// Foto de perfil do próprio motorista (só a dele, pela sessão).
import { getMotorista } from "@/lib/motorista";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = await getMotorista();
  if (!m) return new Response("sessão expirada", { status: 401 });
  const [f] = await sql<{ imagem: Buffer }[]>`SELECT imagem FROM motorista_fotos WHERE motorista_id = ${m.id}`;
  if (!f) return new Response(null, { status: 404 });
  // A URL leva a data da troca (?v=), então pode ficar no cache do aparelho.
  return new Response(new Uint8Array(f.imagem), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
