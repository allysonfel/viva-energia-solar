// Lista das estações ao vivo (a tela consulta a cada poucos segundos).
import { getUser, parceiroDoEscopo } from "@/lib/session";
import { listarEstacoes } from "@/lib/estacoes";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getUser();
  if (!u) return Response.json({ erro: "sessão expirada" }, { status: 401 });
  const estacoes = await listarEstacoes(parceiroDoEscopo(u));
  return Response.json({ estacoes, em: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
