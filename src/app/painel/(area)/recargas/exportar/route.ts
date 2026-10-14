// Recargas em CSV (mesmos filtros da tela), para admin e operador.
// Célula que começa com = + - @ ganha ' na frente (evita fórmula no Excel).
import { getUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { buscarRecargas, lerFiltro } from "@/lib/recargas";
import { celulaCsv } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getUser();
  if (!u || u.perfil === "parceiro") return new Response("proibido", { status: 403 });
  const f = lerFiltro(Object.fromEntries(new URL(req.url).searchParams));
  const { linhas } = await buscarRecargas(f, null, 20_000, 1);
  const cab = ["Recarga", "Estação", "Conector", "Cartão", "Origem", "Status", "Início", "Fim", "kWh", "Valor (R$)", "Motivo do fim"];
  const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
  const corpo = linhas.map((r) =>
    [r.id, r.estacao, `${r.conector_numero} ${r.conector ?? ""}`.trim(), r.id_tag, r.origem, r.status, fmt(r.inicio), fmt(r.fim),
      (r.energia_wh / 1000).toFixed(3).replace(".", ","), (r.valor_centavos / 100).toFixed(2).replace(".", ","), r.motivo_fim ?? ""]
      .map(celulaCsv).join(";"),
  );
  await audit(`usuario:${u.id}`, "recargas_exportadas", null, null, `${linhas.length} linhas`);
  return new Response("﻿" + [cab.map(celulaCsv).join(";"), ...corpo].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="recargas-viva-energia.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
