// Relatório por estação em CSV (mesmos números da tela). Parceiro recebe só
// as estações dele, sem custo e resultado.
import { getUser, parceiroDoEscopo } from "@/lib/session";
import { audit } from "@/lib/audit";
import { gerarRelatorio, lerPeriodo, PERIODOS } from "@/lib/relatorios";
import { celulaCsv } from "@/lib/format";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getUser();
  if (!u) return new Response("proibido", { status: 403 });
  const q = new URL(req.url).searchParams;
  const p = lerPeriodo(q.get("p"));
  const parceiro = parceiroDoEscopo(u);
  let est = Number(q.get("estacao")) || null;
  if (est) {
    const [e] = await sql`SELECT 1 FROM estacoes WHERE id = ${est} ${parceiro ? sql`AND parceiro_id = ${parceiro}` : sql``}`;
    if (!e) est = null;
  }
  const r = await gerarRelatorio(p, { estacao: est, parceiro });
  const ehParceiro = u.perfil === "parceiro";
  const real = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const cab = ["Estação", "Parceiro", "Repasse %", "Recargas", "kWh", "Valor apurado (R$)", ...(ehParceiro ? [] : ["Custo energia (R$)", "Descontos (R$)", "Taxas (R$)"]), "Repasse (R$)", ...(ehParceiro ? [] : ["Resultado (R$)"])];
  const linhas = [...r.estacoes, { ...r.total, nome: "TOTAL", parceiro: "", repasse_pct: "" }].map((e) =>
    [e.nome, e.parceiro ?? "Própria", String(e.repasse_pct).replace(".", ","), e.recargas, (e.wh / 1000).toFixed(1).replace(".", ","), real(e.receita),
      ...(ehParceiro ? [] : [real(e.custo), real(e.descontos), real(e.taxas)]), real(e.repasse), ...(ehParceiro ? [] : [real(e.resultado)])]
      .map(celulaCsv).join(";"),
  );
  await audit(`usuario:${u.id}`, "relatorio_exportado", null, null, `${PERIODOS[p]}${est ? ` estação ${est}` : ""}`);
  return new Response("﻿" + [cab.map(celulaCsv).join(";"), ...linhas].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="relatorio-viva-energia-${p}.csv"`, "Cache-Control": "no-store" },
  });
}
