// Recarga em andamento do motorista logado (ou null).
import { getMotorista } from "@/lib/motorista";
import { recargaEmAndamento } from "@/lib/app";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = await getMotorista();
  if (!m) return Response.json({ erro: "sessão expirada" }, { status: 401 });
  const r = await recargaEmAndamento(m.id);
  return Response.json({ id: r?.id ?? null }, { headers: { "Cache-Control": "no-store" } });
}
