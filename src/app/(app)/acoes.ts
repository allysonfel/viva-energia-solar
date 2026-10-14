"use server";

// Ações do app do motorista. Tudo conferido aqui: sessão, dono da recarga ou
// do pagamento, saldo, estado da estação e do conector, valores.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireMotorista, iniciarSessaoMotorista, encerrarSessaoMotorista, getMotorista } from "@/lib/motorista";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword, SENHA_MINIMA } from "@/lib/auth";
import { celularValido } from "@/lib/cpf";
import { brl } from "@/lib/format";
import { confirmarPagamento } from "@/lib/carteira";
import { provedorPagamentos } from "@/lib/pagamentos";
import { iniciarRecarga, pararRecarga } from "@/lib/ocpp/comandos";
import { estaConectada } from "@/lib/ocpp/central";
import { TIPOS_CONECTOR } from "@/lib/ocpp/tipos";
import { vouchersDisponiveis } from "@/lib/app";
import { clientIp } from "@/lib/request";
import { isBlocked, registerFailure } from "@/lib/limits";

export type Resposta = { ok: boolean; texto: string; id?: number } | null;

// ---------------------------------------------------------------- recarga

export async function iniciarRecargaApp(_: Resposta, fd: FormData): Promise<Resposta> {
  const m = await requireMotorista();
  const s = await getSettings();
  const codigo = String(fd.get("codigo") ?? "").slice(0, 40);
  const n = Number(fd.get("conector"));
  if (!Number.isInteger(n) || n < 1 || n > 20) return { ok: false, texto: "Escolha o conector." };
  const [e] = await sql<{ id: number; codigo: string; habilitada: boolean }[]>`
    SELECT id, codigo, habilitada FROM estacoes WHERE codigo = ${codigo} AND ativa`;
  if (!e) return { ok: false, texto: "Estação não encontrada." };
  if (!e.habilitada || !estaConectada(e.codigo)) return { ok: false, texto: "A estação está indisponível agora. Tente outra perto." };
  const [c] = await sql<{ status: string }[]>`SELECT status FROM conectores WHERE estacao_id = ${e.id} AND numero = ${n}`;
  if (!c || !["Available", "Preparing"].includes(c.status)) return { ok: false, texto: "Esse conector está ocupado ou indisponível." };
  const [aberta] = await sql`SELECT 1 FROM recargas WHERE motorista_id = ${m.id} AND status = 'em_andamento'`;
  if (aberta) return { ok: false, texto: "Você já tem uma recarga em andamento." };
  if (m.saldo_centavos < s.saldoMinimoCentavos) {
    return { ok: false, texto: `Saldo mínimo para iniciar: ${brl(s.saldoMinimoCentavos)}. Adicione crédito na carteira.` };
  }
  // Voucher escolhido: precisa ser do motorista, sem uso e valer nesta estação.
  const mv = Number(fd.get("voucher")) || null;
  if (mv && !(await vouchersDisponiveis(m.id, e.id)).some((v) => v.mv === mv)) return { ok: false, texto: "Esse voucher não vale nesta recarga." };
  const r = await iniciarRecarga(e, null, n, m.id_tag, m.id, mv);
  await audit(`motorista:${m.id}`, "recarga_pedida", "estacao", e.id, `conector ${n}: ${r.ok ? "aceito" : "não aceito"}`);
  if (!r.ok) return { ok: false, texto: "O carregador não aceitou o pedido. Confira se o cabo está conectado e tente de novo." };
  return { ok: true, texto: "Pedido enviado ao carregador." };
}

export async function pararRecargaApp(_: Resposta, fd: FormData): Promise<Resposta> {
  const m = await requireMotorista();
  const id = Number(fd.get("id"));
  const [r] = await sql<{ id: number; estacao_id: number; codigo: string }[]>`
    SELECT r.id, r.estacao_id, e.codigo FROM recargas r JOIN estacoes e ON e.id = r.estacao_id
    WHERE r.id = ${id} AND r.motorista_id = ${m.id} AND r.status = 'em_andamento'`;
  if (!r) return { ok: false, texto: "Essa recarga não está em andamento." };
  const res = await pararRecarga({ id: r.estacao_id, codigo: r.codigo }, null, r.id);
  await audit(`motorista:${m.id}`, "recarga_parar", "recarga", r.id, res.ok ? "aceito" : "não aceito");
  return res.ok
    ? { ok: true, texto: "Encerrando a recarga..." }
    : { ok: false, texto: "O carregador não respondeu. Tente de novo ou use o botão de parada do carregador." };
}

// ---------------------------------------------------------------- carteira

const VALORES = [3000, 5000, 10000, 20000];

function valorCredito(fd: FormData): number | null {
  const v = Number(fd.get("valor"));
  return VALORES.includes(v) ? v : null;
}

export async function criarPix(_: Resposta, fd: FormData): Promise<Resposta> {
  const m = await requireMotorista();
  const valor = valorCredito(fd);
  if (!valor) return { ok: false, texto: "Escolha um valor." };
  // Freio: no máximo 5 Pix pendentes por motorista.
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pagamentos WHERE motorista_id = ${m.id} AND status = 'pendente' AND expira_em > now()`;
  if (n >= 5) return { ok: false, texto: "Você já tem Pix aguardando pagamento. Use um deles ou espere expirar." };
  const prov = provedorPagamentos();
  const pix = await prov.criarPix(valor, `motorista-${m.id}`);
  const [p] = await sql<{ id: number }[]>`
    INSERT INTO pagamentos (motorista_id, metodo, valor_centavos, provedor, provedor_id, pix_copia_cola, expira_em)
    VALUES (${m.id}, 'pix', ${valor}, ${prov.nome}, ${pix.provedorId}, ${pix.copiaECola}, ${pix.expiraEm}) RETURNING id`;
  await audit(`motorista:${m.id}`, "pix_criado", "pagamento", p.id, brl(valor));
  redirect(`/carteira/pix/${p.id}`);
}

// Só no provedor simulado: faz o papel do banco confirmando o Pix.
export async function simularPagamentoPix(fd: FormData) {
  const m = await requireMotorista();
  if (!provedorPagamentos().simulado) redirect("/carteira");
  const id = Number(fd.get("id"));
  const [p] = await sql`SELECT 1 FROM pagamentos WHERE id = ${id} AND motorista_id = ${m.id} AND status = 'pendente' AND provedor = 'simulado'`;
  if (p && (await confirmarPagamento(id))) await audit(`motorista:${m.id}`, "pix_pago_simulado", "pagamento", id);
  redirect(`/carteira/pix/${id}`);
}

// Cartão: o número completo nunca chega aqui. O formulário do gateway (no
// simulado, o próprio navegador) devolve só o final e a bandeira.
export async function pagarCartao(_: Resposta, fd: FormData): Promise<Resposta> {
  const m = await requireMotorista();
  const valor = valorCredito(fd);
  const final = String(fd.get("final") ?? "");
  const bandeira = String(fd.get("bandeira") ?? "").slice(0, 20);
  if (!valor) return { ok: false, texto: "Escolha um valor." };
  if (!/^\d{4}$/.test(final)) return { ok: false, texto: "Confira os dados do cartão." };
  const prov = provedorPagamentos();
  const r = await prov.cobrarCartao(valor, { final, bandeira }, `motorista-${m.id}`);
  const [p] = await sql<{ id: number }[]>`
    INSERT INTO pagamentos (motorista_id, metodo, valor_centavos, provedor, provedor_id, cartao_final, cartao_bandeira, status)
    VALUES (${m.id}, 'cartao', ${valor}, ${prov.nome}, ${r.provedorId}, ${final}, ${bandeira}, ${r.aprovado ? "pendente" : "recusado"}) RETURNING id`;
  if (r.aprovado) await confirmarPagamento(p.id);
  await audit(`motorista:${m.id}`, r.aprovado ? "cartao_aprovado" : "cartao_recusado", "pagamento", p.id, brl(valor));
  revalidatePath("/carteira");
  return r.aprovado ? { ok: true, texto: `${brl(valor)} adicionados à carteira.` } : { ok: false, texto: r.motivo ?? "Pagamento recusado." };
}

// Resgate de voucher pelo código. Freio contra tentativa de adivinhar
// códigos: 10 erros em 15 min por motorista e 30 por IP.
export async function resgatarVoucher(_: Resposta, fd: FormData): Promise<Resposta> {
  const m = await requireMotorista();
  const codigo = String(fd.get("codigo") ?? "").trim().toUpperCase().slice(0, 20);
  const chaves: [string, number][] = [[`voucher:${m.id}`, 10], [`voucher-ip:${await clientIp()}`, 30]];
  if (await isBlocked(chaves)) return { ok: false, texto: "Muitas tentativas. Aguarde 15 minutos." };
  const [v] = /^[A-Z0-9]{3,20}$/.test(codigo)
    ? await sql<{ id: number; pct: number; esgotado: boolean }[]>`
        SELECT v.id, v.pct, (v.limite_usos IS NOT NULL AND (SELECT count(*) FROM motorista_vouchers u WHERE u.voucher_id = v.id AND u.recarga_id IS NOT NULL) >= v.limite_usos) AS esgotado
        FROM vouchers v WHERE v.codigo = ${codigo} AND v.ativo AND (v.valido_ate IS NULL OR v.valido_ate >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)`
    : [];
  if (!v) {
    await registerFailure(...chaves.map(([c]) => c));
    return { ok: false, texto: "Código inválido ou vencido." };
  }
  if (v.esgotado) return { ok: false, texto: "Esse voucher já esgotou." };
  const r = await sql`INSERT INTO motorista_vouchers (motorista_id, voucher_id) VALUES (${m.id}, ${v.id}) ON CONFLICT DO NOTHING RETURNING id`;
  if (!r.length) return { ok: false, texto: "Você já resgatou esse voucher." };
  await audit(`motorista:${m.id}`, "voucher_resgatado", "voucher", v.id, codigo);
  revalidatePath("/carteira");
  return { ok: true, texto: `Voucher ${codigo} resgatado: ${v.pct}% de desconto na próxima recarga.` };
}

// ---------------------------------------------------------------- perfil

export async function salvarPerfil(fd: FormData) {
  const m = await requireMotorista();
  const celular = celularValido(fd.get("celular"));
  if (!celular) redirect("/perfil?erro=celular");
  const veiculo = String(fd.get("veiculo") ?? "").trim().slice(0, 60);
  const placa = String(fd.get("placa") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  const conectores = fd.getAll("conectores").map(String).filter((c) => TIPOS_CONECTOR.includes(c)).slice(0, 6);
  await sql`
    UPDATE motoristas SET celular = ${celular}, veiculo = ${veiculo}, placa = ${placa}, conectores = ${conectores},
      avisos_recarga = ${fd.get("avisos") === "1"}, aceita_promocoes = ${fd.get("promocoes") === "1"}
    WHERE id = ${m.id}`;
  await audit(`motorista:${m.id}`, "perfil_salvo", "motorista", m.id);
  redirect("/perfil?ok=1");
}

export async function trocarSenhaApp(fd: FormData) {
  const m = await requireMotorista();
  const atual = String(fd.get("atual") ?? "").slice(0, 200);
  const nova = String(fd.get("nova") ?? "");
  const [r] = await sql<{ senha_hash: string }[]>`SELECT senha_hash FROM motoristas WHERE id = ${m.id}`;
  if (!r || !verifyPassword(atual, r.senha_hash)) redirect("/perfil?erro=atual");
  if (nova.length < SENHA_MINIMA || nova.length > 200) redirect("/perfil?erro=nova");
  const [v] = await sql<{ v: number }[]>`
    UPDATE motoristas SET senha_hash = ${hashPassword(nova)}, sessao_versao = sessao_versao + 1 WHERE id = ${m.id} RETURNING sessao_versao AS v`;
  await iniciarSessaoMotorista(m.id, v.v);
  await audit(`motorista:${m.id}`, "senha_trocada", "motorista", m.id);
  redirect("/perfil?ok=senha");
}

export async function sairApp() {
  const m = await getMotorista();
  if (m) await audit(`motorista:${m.id}`, "logout");
  await encerrarSessaoMotorista();
  redirect("/entrar");
}
