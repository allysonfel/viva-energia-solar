// Dados ao vivo de uma recarga do próprio motorista.
import { getMotorista } from "@/lib/motorista";
import { recargaDoMotorista } from "@/lib/app";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMotorista();
  if (!m) return Response.json({ erro: "sessão expirada" }, { status: 401 });
  const r = await recargaDoMotorista(Number((await params).id), m.id);
  if (!r) return Response.json({ erro: "não encontrada" }, { status: 404 });
  return Response.json({ recarga: r }, { headers: { "Cache-Control": "no-store" } });
}
