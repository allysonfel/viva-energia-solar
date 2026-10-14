"use server";

// Cadastro de estações (só admin) e comandos remotos (admin e operador).
// Tudo checado aqui no servidor: perfil, escopo e valores.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser, parceiroDoEscopo, podeOperar } from "@/lib/session";
import { hashPassword, randomId } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { centavosDe } from "@/lib/format";
import { guardarSegredo } from "@/lib/segredo";
import { estacaoDoEscopo } from "@/lib/estacoes";
import { TIPOS_CONECTOR } from "@/lib/ocpp/tipos";
import * as cmd from "@/lib/ocpp/comandos";
import { ligar, desligar, simuladorLigado } from "@/lib/ocpp/simulador";

const texto = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

function coordenada(v: string, limite: number): number | null | "erro" {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && Math.abs(n) <= limite ? n : "erro";
}

function lerDados(fd: FormData) {
  const nome = texto(fd, "nome", 60);
  const lat = coordenada(texto(fd, "lat", 20), 90);
  const lng = coordenada(texto(fd, "lng", 20), 180);
  const preco = centavosDe(fd.get("preco"));
  const custo = fd.get("custo") ? centavosDe(fd.get("custo")) : 0;
  const parceiro = Number(fd.get("parceiro")) || null;
  if (nome.length < 2) return { erro: "Informe o nome da estação." };
  if (lat === "erro" || lng === "erro") return { erro: "Coordenadas inválidas." };
  if ((lat === null) !== (lng === null)) return { erro: "Informe latitude e longitude juntas." };
  if (preco === null || preco < 1 || preco > 10000) return { erro: "Preço por kWh inválido." };
  if (custo === null || custo > 10000) return { erro: "Custo por kWh inválido." };
  return {
    dados: {
      nome, endereco: texto(fd, "endereco", 160), bairro: texto(fd, "bairro", 60), cidade: texto(fd, "cidade", 60),
      lat, lng, preco_kwh_centavos: preco, custo_kwh_centavos: custo, parceiro_id: parceiro,
    },
  };
}

async function parceiroExiste(id: number | null) {
  if (!id) return true;
  const [p] = await sql`SELECT 1 FROM parceiros WHERE id = ${id}`;
  return !!p;
}

export async function criarEstacao(fd: FormData) {
  const u = await requireUser(["admin"]);
  const codigo = texto(fd, "codigo", 40).toUpperCase();
  if (!/^[A-Z0-9._-]{3,40}$/.test(codigo)) redirect("/painel/estacoes/nova?erro=codigo");
  const r = lerDados(fd);
  if (!r.dados) redirect(`/painel/estacoes/nova?erro=${encodeURIComponent(r.erro)}`);
  if (!(await parceiroExiste(r.dados.parceiro_id))) redirect("/painel/estacoes/nova?erro=parceiro");
  const simulada = fd.get("simulada") === "1" && simuladorLigado();
  // Conectores: até 4, cada um com tipo e potência (kW).
  const conectores: { tipo: string; w: number }[] = [];
  for (let i = 1; i <= 4; i++) {
    const tipo = texto(fd, `tipo${i}`, 20);
    if (!tipo) continue;
    const kw = Number(String(fd.get(`kw${i}`) ?? "").replace(",", "."));
    if (!TIPOS_CONECTOR.includes(tipo) || !Number.isFinite(kw) || kw < 1 || kw > 1000) redirect("/painel/estacoes/nova?erro=conector");
    conectores.push({ tipo, w: Math.round(kw * 1000) });
  }
  if (!conectores.length) redirect("/painel/estacoes/nova?erro=conector");
  const [existe] = await sql`SELECT 1 FROM estacoes WHERE codigo = ${codigo}`;
  if (existe) redirect("/painel/estacoes/nova?erro=duplicado");

  const senha = simulada ? null : randomId(18);
  const d = r.dados;
  const id = await sql.begin(async (tx) => {
    const [e] = await tx<{ id: number }[]>`
      INSERT INTO estacoes (codigo, nome, endereco, bairro, cidade, lat, lng, preco_kwh_centavos, custo_kwh_centavos, parceiro_id, simulada, ocpp_senha_hash)
      VALUES (${codigo}, ${d.nome}, ${d.endereco}, ${d.bairro}, ${d.cidade}, ${d.lat}, ${d.lng}, ${d.preco_kwh_centavos}, ${d.custo_kwh_centavos},
        ${d.parceiro_id}, ${simulada}, ${senha ? hashPassword(senha) : null})
      RETURNING id`;
    for (const [i, c] of conectores.entries()) {
      await tx`INSERT INTO conectores (estacao_id, numero, tipo, potencia_w) VALUES (${e.id}, ${i + 1}, ${c.tipo}, ${c.w})`;
    }
    return e.id;
  });
  await audit(`usuario:${u.id}`, "estacao_criada", "estacao", id, codigo);
  if (senha) await guardarSegredo("ocpp", id, senha);
  if (simulada) await ligar(codigo).catch(() => {});
  redirect(`/painel/estacoes/${id}?criada=1`);
}

export async function editarEstacao(fd: FormData) {
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id"));
  const e = await estacaoDoEscopo(id, null);
  if (!e) redirect("/painel/estacoes");
  const r = lerDados(fd);
  if (!r.dados) redirect(`/painel/estacoes/${id}?erro=${encodeURIComponent(r.erro)}`);
  if (!(await parceiroExiste(r.dados.parceiro_id))) redirect(`/painel/estacoes/${id}?erro=parceiro`);
  const d = r.dados;
  await sql`
    UPDATE estacoes SET nome = ${d.nome}, endereco = ${d.endereco}, bairro = ${d.bairro}, cidade = ${d.cidade}, lat = ${d.lat}, lng = ${d.lng},
      preco_kwh_centavos = ${d.preco_kwh_centavos}, custo_kwh_centavos = ${d.custo_kwh_centavos}, parceiro_id = ${d.parceiro_id}
    WHERE id = ${id}`;
  await audit(`usuario:${u.id}`, "estacao_editada", "estacao", id);
  redirect(`/painel/estacoes/${id}?ok=dados`);
}

// Nova senha OCPP: a antiga deixa de valer na próxima conexão do carregador.
export async function novaSenhaOcpp(fd: FormData) {
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id"));
  const e = await estacaoDoEscopo(id, null);
  if (!e || e.simulada) redirect("/painel/estacoes");
  const senha = randomId(18);
  await sql`UPDATE estacoes SET ocpp_senha_hash = ${hashPassword(senha)} WHERE id = ${id}`;
  await audit(`usuario:${u.id}`, "estacao_senha_ocpp", "estacao", id);
  await guardarSegredo("ocpp", id, senha);
  redirect(`/painel/estacoes/${id}?senha=1`);
}

export async function editarConector(fd: FormData) {
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id"));
  const numero = Number(fd.get("numero"));
  const tipo = texto(fd, "tipo", 20);
  const kw = Number(String(fd.get("kw") ?? "").replace(",", "."));
  const e = await estacaoDoEscopo(id, null);
  if (!e) redirect("/painel/estacoes");
  if (!Number.isInteger(numero) || numero < 1 || numero > 20 || !TIPOS_CONECTOR.includes(tipo) || !Number.isFinite(kw) || kw < 1 || kw > 1000) {
    redirect(`/painel/estacoes/${id}?erro=conector`);
  }
  await sql`
    INSERT INTO conectores (estacao_id, numero, tipo, potencia_w) VALUES (${id}, ${numero}, ${tipo}, ${Math.round(kw * 1000)})
    ON CONFLICT (estacao_id, numero) DO UPDATE SET tipo = EXCLUDED.tipo, potencia_w = EXCLUDED.potencia_w`;
  await audit(`usuario:${u.id}`, "conector_editado", "estacao", id, `conector ${numero}`);
  if (e.simulada) await ligar(e.codigo).catch(() => {});
  redirect(`/painel/estacoes/${id}?ok=conector`);
}

// Arquivar: some das listas e recusa conexões; histórico de recargas fica.
export async function arquivarEstacao(fd: FormData) {
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id"));
  const e = await estacaoDoEscopo(id, null);
  if (!e) redirect("/painel/estacoes");
  if (e.simulada) desligar(e.codigo);
  await sql`UPDATE estacoes SET ativa = false, conectada = false WHERE id = ${id}`;
  await sql`UPDATE avisos SET resolvido_em = now() WHERE estacao_id = ${id} AND resolvido_em IS NULL`;
  await audit(`usuario:${u.id}`, "estacao_arquivada", "estacao", id, e.codigo);
  redirect("/painel/estacoes");
}

// ---------------------------------------------------------------- comandos remotos

export type Retorno = { ok: boolean; texto: string } | null;

async function operavel(fd: FormData) {
  const u = await requireUser();
  if (!podeOperar(u)) return { u, e: null, erro: "Seu perfil não envia comandos." };
  const e = await estacaoDoEscopo(Number(fd.get("id")), parceiroDoEscopo(u));
  if (!e) return { u, e: null, erro: "Estação não encontrada." };
  return { u, e, erro: null };
}

export async function comando(_: Retorno, fd: FormData): Promise<Retorno> {
  const { u, e, erro } = await operavel(fd);
  if (!e) return { ok: false, texto: erro! };
  const acao = String(fd.get("acao") ?? "");
  let r: { ok: boolean; texto: string };
  switch (acao) {
    case "reiniciar":
      r = await cmd.reiniciar(e, u.id, "Soft");
      break;
    case "reiniciar_forcado":
      r = await cmd.reiniciar(e, u.id, "Hard");
      break;
    case "habilitar":
    case "desabilitar":
      r = await cmd.disponibilidade(e, u.id, acao === "habilitar");
      break;
    case "iniciar": {
      const conector = Number(fd.get("conector"));
      if (!Number.isInteger(conector) || conector < 1 || conector > 20) return { ok: false, texto: "Escolha o conector." };
      await garantirTagOperacao();
      r = await cmd.iniciarRecarga(e, u.id, conector);
      break;
    }
    case "parar": {
      const tx = Number(fd.get("recarga"));
      const [rec] = await sql`SELECT 1 FROM recargas WHERE id = ${tx} AND estacao_id = ${e.id} AND status = 'em_andamento'`;
      if (!rec) return { ok: false, texto: "Recarga não está em andamento." };
      r = await cmd.pararRecarga(e, u.id, tx);
      break;
    }
    case "potencia": {
      const kw = Number(String(fd.get("kw") ?? "").replace(",", "."));
      if (!Number.isFinite(kw) || kw < 1 || kw > 1000) return { ok: false, texto: "Potência inválida." };
      r = await cmd.limitarPotencia(e, u.id, Math.round(kw * 1000));
      break;
    }
    case "status":
      r = await cmd.pedirStatus(e, u.id);
      break;
    default:
      return { ok: false, texto: "Comando desconhecido." };
  }
  await audit(`usuario:${u.id}`, `comando_${acao}`, "estacao", e.id, r.ok ? "aceito" : "não aceito");
  revalidatePath(`/painel/estacoes/${e.id}`);
  return r;
}

// Cartão interno usado nas recargas iniciadas pelo painel (sem cobrança).
async function garantirTagOperacao() {
  await sql`
    INSERT INTO tags (id_tag, descricao, tipo) VALUES (${cmd.ID_TAG_OPERACAO}, 'Recarga iniciada pela operação (sem cobrança)', 'operacao')
    ON CONFLICT (id_tag) DO NOTHING`;
}
