// Freio contra tentativa e erro, com janela de 15 minutos:
// - por e-mail: 5 falhas bloqueiam aquela conta;
// - por IP: 30 falhas bloqueiam a origem. O limite é mais alto porque a
//   equipe da cooperativa costuma sair pelo mesmo IP do escritório, e um
//   colega errando a senha não pode trancar todo mundo.
import { sql, ensureSchema } from "./db";

export const LIMITE_EMAIL = 5;
export const LIMITE_IP = 30;

export async function isBlocked(limites: [chave: string, max: number][]): Promise<boolean> {
  await ensureSchema();
  const rows = await sql<{ chave: string; n: string }[]>`
    SELECT chave, count(*) AS n FROM tentativas_falhas
    WHERE chave IN ${sql(limites.map(([c]) => c))} AND criado_em > now() - interval '15 minutes'
    GROUP BY chave
  `;
  return rows.some((r) => Number(r.n) >= (limites.find(([c]) => c === r.chave)?.[1] ?? Infinity));
}

export async function registerFailure(...chaves: string[]): Promise<void> {
  for (const chave of chaves) await sql`INSERT INTO tentativas_falhas (chave) VALUES (${chave})`;
  // Limpeza oportunista do que já não conta.
  await sql`DELETE FROM tentativas_falhas WHERE criado_em < now() - interval '1 day'`;
}

export async function clearFailures(chave: string): Promise<void> {
  await sql`DELETE FROM tentativas_falhas WHERE chave = ${chave}`;
}
