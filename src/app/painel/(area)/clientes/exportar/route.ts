// Clientes em CSV (só admin). CPF mascarado; célula com = + - @ ganha '.
import { getUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { celulaCsv } from "@/lib/format";
import { cpfMascarado, celularFormatado } from "@/lib/cpf";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getUser();
  if (!u || u.perfil !== "admin") return new Response("proibido", { status: 403 });
  const rows = await sql<{ nome: string; email: string; cpf: string; celular: string; veiculo: string; placa: string; recargas: number; gasto: number; saldo_centavos: number; aceita_promocoes: boolean; ativo: boolean; criado_em: Date }[]>`
    SELECT m.nome, m.email, m.cpf, m.celular, m.veiculo, m.placa, m.saldo_centavos, m.aceita_promocoes, m.ativo, m.criado_em,
      (SELECT count(*)::int FROM recargas r WHERE r.motorista_id = m.id AND r.status <> 'recusada') AS recargas,
      (SELECT coalesce(sum(valor_centavos), 0)::bigint FROM recargas r WHERE r.motorista_id = m.id) AS gasto
    FROM motoristas m ORDER BY m.nome`;
  const real = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const cab = ["Nome", "E-mail", "CPF", "Celular", "Veículo", "Placa", "Recargas", "Total gasto (R$)", "Saldo (R$)", "Aceita promoções", "Ativo", "Cadastro"];
  const linhas = rows.map((r) =>
    [r.nome, r.email, cpfMascarado(r.cpf), celularFormatado(r.celular), r.veiculo, r.placa, r.recargas, real(r.gasto), real(r.saldo_centavos),
      r.aceita_promocoes ? "sim" : "não", r.ativo ? "sim" : "não", r.criado_em].map(celulaCsv).join(";"),
  );
  await audit(`usuario:${u.id}`, "clientes_exportados", null, null, `${rows.length} linhas`);
  return new Response("﻿" + [cab.map(celulaCsv).join(";"), ...linhas].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="clientes-viva-energia.csv"`, "Cache-Control": "no-store" },
  });
}
