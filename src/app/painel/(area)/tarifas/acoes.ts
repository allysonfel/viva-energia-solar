"use server";

// Cadastro de tarifas por horário (só admin). Cada tarifa pode já ser ligada
// a estações aqui; o mesmo vale pelo cadastro da estação. Uma estação não
// pode ter duas tarifas no mesmo horário.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { centavosDe } from "@/lib/format";
import { conflitoDeHorario, horarioDa, type Tarifa } from "@/lib/tarifas";

export type RespostaTarifa = { erro: string } | null;

const COR = /^#[0-9A-Fa-f]{6}$/;

export async function salvarTarifa(_: RespostaTarifa, fd: FormData): Promise<RespostaTarifa> {
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id")) || null;
  const nome = String(fd.get("nome") ?? "").trim().slice(0, 30);
  const ini = Number(fd.get("ini"));
  const fim = Number(fd.get("fim"));
  const preco = centavosDe(fd.get("preco"));
  const cor = String(fd.get("cor") ?? "");
  if (nome.length < 2) return { erro: "Dê um nome à tarifa (ex.: Horário de ponta)." };
  if (!Number.isInteger(ini) || ini < 0 || ini > 23 || !Number.isInteger(fim) || fim < 1 || fim > 24) return { erro: "Escolha o horário de início e de fim." };
  if (fim === ini) return { erro: "O início e o fim não podem ser a mesma hora. Para o dia todo, use 00h às 24h." };
  if (preco === null || preco < 1 || preco > 10000) return { erro: "Informe o preço por kWh (ex.: 2,10)." };
  if (!COR.test(cor)) return { erro: "Cor inválida." };

  const pedidas = [...new Set(fd.getAll("estacao").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const estacoes = pedidas.length
    ? await sql<{ id: number; nome: string }[]>`SELECT id, nome FROM estacoes WHERE ativa AND id = ANY(${pedidas})`
    : [];
  if (id) {
    const [existe] = await sql`SELECT 1 FROM tarifas WHERE id = ${id}`;
    if (!existe) return { erro: "Tarifa não encontrada. Recarregue a página." };
  }

  // Confere o horário contra as outras tarifas de cada estação marcada.
  const nova: Tarifa = { id: id ?? 0, nome, hora_inicio: ini, hora_fim: fim, preco_kwh_centavos: preco, cor };
  for (const e of estacoes) {
    const outras = await sql<Tarifa[]>`
      SELECT t.id, t.nome, t.hora_inicio, t.hora_fim, t.preco_kwh_centavos, t.cor
      FROM tarifas t JOIN estacao_tarifas et ON et.tarifa_id = t.id
      WHERE et.estacao_id = ${e.id} ${id ? sql`AND t.id <> ${id}` : sql``}`;
    const conflito = conflitoDeHorario([...outras, nova]);
    if (conflito) return { erro: `${e.nome}: ${conflito}` };
  }

  const tarifaId = await sql.begin(async (tx) => {
    let tid = id;
    if (tid) {
      await tx`UPDATE tarifas SET nome = ${nome}, hora_inicio = ${ini}, hora_fim = ${fim}, preco_kwh_centavos = ${preco}, cor = ${cor} WHERE id = ${tid}`;
      await tx`DELETE FROM estacao_tarifas WHERE tarifa_id = ${tid}`;
    } else {
      const [t] = await tx<{ id: number }[]>`
        INSERT INTO tarifas (nome, hora_inicio, hora_fim, preco_kwh_centavos, cor) VALUES (${nome}, ${ini}, ${fim}, ${preco}, ${cor}) RETURNING id`;
      tid = t.id;
    }
    for (const e of estacoes) await tx`INSERT INTO estacao_tarifas (estacao_id, tarifa_id) VALUES (${e.id}, ${tid})`;
    return tid;
  });
  await audit(`usuario:${u.id}`, id ? "tarifa_editada" : "tarifa_criada", "tarifa", tarifaId,
    `${nome} ${horarioDa(nova)} ${preco} · ${estacoes.length} estação(ões)`);
  revalidatePath("/painel/tarifas");
  redirect(`/painel/tarifas?ok=${id ? "editada" : "criada"}`);
}

// Excluir não mexe em recargas já feitas (elas guardam nome e preço da época).
export async function excluirTarifa(fd: FormData) {
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id"));
  const [t] = await sql<{ nome: string }[]>`DELETE FROM tarifas WHERE id = ${id} RETURNING nome`;
  if (t) await audit(`usuario:${u.id}`, "tarifa_excluida", "tarifa", id, t.nome);
  revalidatePath("/painel/tarifas");
  redirect("/painel/tarifas?ok=excluida");
}
