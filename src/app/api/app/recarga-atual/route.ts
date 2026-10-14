// Recarga em andamento do motorista logado (ou null).
import { getMotorista } from "@/lib/motorista";
import { recargaEmAndamento } from "@/lib/app";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = await getMotorista();
  if (!m) return Response.json({ erro: "sessão expirada" }, { status: 401 });
  const r = await recargaEmAndamento(m.id);
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM avisos_motorista WHERE motorista_id = ${m.id} AND NOT lido`;
  return Response.json({ id: r?.id ?? null, naoLidos: n }, { headers: { "Cache-Control": "no-store" } });
}
