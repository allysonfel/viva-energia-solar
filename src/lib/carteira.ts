// Carteira pré-paga do motorista. Todo movimento passa por aqui, dentro de
// transação com a linha do motorista travada (FOR UPDATE): o saldo guardado
// é sempre a soma do extrato. Crédito de um pagamento e débito de uma
// recarga são únicos no banco: repetir não duplica.
import "server-only";
import type { TransactionSql } from "postgres";
import { sql } from "./db";

type Tx = TransactionSql<{ bigint: number }>;

async function movimentar(tx: Tx, m: { motorista: number; tipo: string; valor: number; descricao: string; pagamento?: number; recarga?: number; usuario?: number }) {
  await tx`SELECT id FROM motoristas WHERE id = ${m.motorista} FOR UPDATE`;
  const [r] = await tx<{ id: number }[]>`
    INSERT INTO carteira_movimentos (motorista_id, tipo, valor_centavos, descricao, pagamento_id, recarga_id, usuario_id)
    VALUES (${m.motorista}, ${m.tipo}, ${m.valor}, ${m.descricao.slice(0, 120)}, ${m.pagamento ?? null}, ${m.recarga ?? null}, ${m.usuario ?? null})
    ON CONFLICT DO NOTHING RETURNING id`;
  if (!r) return false;
  await tx`UPDATE motoristas SET saldo_centavos = saldo_centavos + ${m.valor} WHERE id = ${m.motorista}`;
  return true;
}

// Pagamento confirmado pelo provedor: marca como pago e credita (uma vez só).
// O valor vem do registro do banco, nunca do que o provedor ou o navegador mandou.
export async function confirmarPagamento(pagamentoId: number): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [p] = await tx<{ id: number; motorista_id: number; valor_centavos: number; metodo: string; status: string }[]>`
      SELECT id, motorista_id, valor_centavos, metodo, status FROM pagamentos WHERE id = ${pagamentoId} FOR UPDATE`;
    if (!p || p.status === "pago") return false;
    if (p.status !== "pendente") return false;
    await tx`UPDATE pagamentos SET status = 'pago', pago_em = now() WHERE id = ${p.id}`;
    return movimentar(tx, { motorista: p.motorista_id, tipo: "credito", valor: p.valor_centavos, descricao: p.metodo === "pix" ? "Crédito via Pix" : "Crédito no cartão", pagamento: p.id });
  });
}

// Fim de recarga do app: debita o valor medido (uma vez só). Pode deixar o
// saldo negativo por centavos se o carregador demorou a parar; nesse caso a
// próxima recarga só sai depois de pôr crédito.
export async function cobrarRecarga(recargaId: number): Promise<void> {
  await sql.begin(async (tx) => {
    const [r] = await tx<{ id: number; motorista_id: number | null; valor_centavos: number; status: string; estacao: string }[]>`
      SELECT r.id, r.motorista_id, r.valor_centavos, r.status, e.nome AS estacao FROM recargas r JOIN estacoes e ON e.id = r.estacao_id
      WHERE r.id = ${recargaId} FOR UPDATE OF r`;
    if (!r || !r.motorista_id || r.status === "em_andamento" || r.status === "recusada" || r.valor_centavos <= 0) return;
    await movimentar(tx, { motorista: r.motorista_id, tipo: "recarga", valor: -r.valor_centavos, descricao: `Recarga #${r.id} · ${r.estacao}`, recarga: r.id });
  });
}

export async function ajustarSaldo(motorista: number, valor: number, descricao: string, usuario: number) {
  return sql.begin((tx) => movimentar(tx, { motorista, tipo: "ajuste", valor, descricao, usuario }));
}
