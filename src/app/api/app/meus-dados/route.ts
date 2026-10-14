// LGPD: o motorista baixa a cópia dos próprios dados (JSON).
import { getMotorista } from "@/lib/motorista";
import { dadosDoMotorista } from "@/lib/lgpd";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = await getMotorista();
  if (!m) return new Response("sessão expirada", { status: 401 });
  const dados = await dadosDoMotorista(m.id);
  await audit(`motorista:${m.id}`, "dados_baixados", "motorista", m.id);
  return new Response(JSON.stringify(dados, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="meus-dados-viva-energia.json"`, "Cache-Control": "no-store" },
  });
}
