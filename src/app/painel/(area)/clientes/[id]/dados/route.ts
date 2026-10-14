// LGPD: cópia dos dados de um cliente (para atender pedido de acesso), só admin.
import { getUser } from "@/lib/session";
import { dadosDoMotorista } from "@/lib/lgpd";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u || u.perfil !== "admin") return new Response("proibido", { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("não encontrado", { status: 404 });
  const dados = await dadosDoMotorista(id);
  if (!dados) return new Response("não encontrado", { status: 404 });
  await audit(`usuario:${u.id}`, "dados_cliente_exportados", "motorista", id);
  return new Response(JSON.stringify(dados, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="dados-cliente-${id}.json"`, "Cache-Control": "no-store" },
  });
}
