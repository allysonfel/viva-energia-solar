// Webhook da SyncPay (evento "cashin": Pix gerado ou com status mudado).
// A SyncPay não assina com HMAC: manda o token do webhook em
// "Authorization: Bearer <token>" (SYNCPAY_WEBHOOK_TOKEN). Mesmo com o token
// certo, o corpo não é fonte da verdade: status e valor são consultados na
// SyncPay pelo identificador e o crédito usa o valor do nosso banco.
// Repetir o aviso não credita duas vezes (confirmarPagamento é idempotente).
import { createHash, timingSafeEqual } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { confirmarPagamento } from "@/lib/carteira";
import { consultarTransacao } from "@/lib/syncpay";
import { audit } from "@/lib/audit";
import { brl } from "@/lib/format";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (s: string) => createHash("sha256").update(s).digest();

function autorizado(req: Request) {
  const esperado = process.env.SYNCPAY_WEBHOOK_TOKEN?.trim();
  if (!esperado) return false;
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return timingSafeEqual(hash(recebido), hash(esperado));
}

export async function POST(req: Request) {
  if (!autorizado(req)) return Response.json({ ok: false }, { status: 401 });
  const texto = await req.text();
  if (texto.length > 64_000) return Response.json({ ok: false }, { status: 413 });
  let corpo: { data?: { id?: unknown }; id?: unknown } | null = null;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  // O aviso novo vem às vezes dentro de "data", às vezes direto.
  const id = String((corpo?.data ?? corpo)?.id ?? "");
  if (!UUID.test(id)) return Response.json({ ok: true });

  await ensureSchema();
  const [p] = await sql<{ id: number; motorista_id: number; valor_centavos: number; status: string }[]>`
    SELECT id, motorista_id, valor_centavos, status FROM pagamentos WHERE provedor = 'syncpay' AND provedor_id = ${id}`;
  // Cobrança que não é nossa (outro produto da conta): só confirma o recebimento.
  if (!p) return Response.json({ ok: true });

  let t;
  try {
    t = await consultarTransacao(id);
  } catch (e) {
    console.error("[syncpay] falha ao consultar transação:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 502 }); // a SyncPay tenta de novo
  }

  if (t.status === "completed") {
    if (t.valorCentavos !== p.valor_centavos) {
      await audit("syncpay", "pix_valor_divergente", "pagamento", p.id, `esperado ${brl(p.valor_centavos)}, recebido ${brl(t.valorCentavos)}`);
    } else if (await confirmarPagamento(p.id)) {
      await audit("syncpay", "pix_pago", "pagamento", p.id, brl(p.valor_centavos));
    }
  } else if (t.status === "failed") {
    await sql`UPDATE pagamentos SET status = 'cancelado' WHERE id = ${p.id} AND status = 'pendente'`;
  } else if (t.status === "refunded" || t.status === "med") {
    // Estorno ou contestação (MED) depois do crédito: o saldo não é mexido
    // sozinho; fica no registro para a operação decidir (ajuste no painel).
    if (p.status === "pago") await audit("syncpay", t.status === "med" ? "pix_contestado" : "pix_estornado", "pagamento", p.id, brl(p.valor_centavos));
  }
  return Response.json({ ok: true });
}
