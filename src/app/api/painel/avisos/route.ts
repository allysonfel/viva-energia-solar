// Avisos abertos para o sino. Parceiro só vê os das estações dele.
import { getUser, parceiroDoEscopo } from "@/lib/session";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getUser();
  if (!u) return Response.json({ erro: "sessão expirada" }, { status: 401 });
  const p = parceiroDoEscopo(u);
  const avisos = await sql`
    SELECT a.id, a.tipo, a.titulo, a.texto, a.estacao_id, a.criado_em FROM avisos a
    LEFT JOIN estacoes e ON e.id = a.estacao_id
    WHERE a.resolvido_em IS NULL ${p ? sql`AND e.parceiro_id = ${p}` : sql``}
    ORDER BY a.criado_em DESC LIMIT 20`;
  return Response.json({ avisos }, { headers: { "Cache-Control": "no-store" } });
}
