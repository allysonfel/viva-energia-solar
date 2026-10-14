// Registro de quem fez cada operação. Falha aqui nunca derruba a operação:
// o registro é importante, mas não pode travar o financeiro. Nunca gravar
// documento completo, chave Pix ou senha no detalhe.
import { sql } from "./db";
import { clientIp } from "./request";

export async function audit(
  ator: string,
  acao: string,
  entidade?: string | null,
  entidadeId?: number | null,
  detalhe?: string,
) {
  try {
    const ip = await clientIp().catch(() => null);
    await sql`
      INSERT INTO audit_log (ator, acao, entidade, entidade_id, detalhe, ip)
      VALUES (${ator}, ${acao}, ${entidade ?? null}, ${entidadeId ?? null}, ${detalhe ?? null}, ${ip})
    `;
  } catch (err) {
    console.error("[audit] falha ao registrar:", err instanceof Error ? err.message : err);
  }
}
