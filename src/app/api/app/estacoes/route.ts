// Estações do mapa (o app consulta a cada 15 s).
import { getMotorista } from "@/lib/motorista";
import { estacoesDoMapa } from "@/lib/app";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getMotorista())) return Response.json({ erro: "sessão expirada" }, { status: 401 });
  return Response.json({ estacoes: await estacoesDoMapa() }, { headers: { "Cache-Control": "no-store" } });
}
