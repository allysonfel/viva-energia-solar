// Guarda a inscrição de push de um aparelho (equipe ou motorista). Vale
// enquanto a sessão for a mesma (trocar a senha ou sair por versão nova corta).
import "server-only";
import { sql } from "./db";
import { inscricaoValida } from "./push";

export type InscricaoBruta = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

export async function salvarInscricao(dono: "equipe" | "motorista", id: number, versao: number, s: InscricaoBruta): Promise<boolean> {
  const i = { endpoint: String(s?.endpoint ?? ""), p256dh: String(s?.keys?.p256dh ?? ""), auth: String(s?.keys?.auth ?? "") };
  if (!inscricaoValida(i)) return false;
  await sql`
    INSERT INTO push_inscricoes (dono_tipo, dono_id, sessao_versao, endpoint, p256dh, auth)
    VALUES (${dono}, ${id}, ${versao}, ${i.endpoint}, ${i.p256dh}, ${i.auth})
    ON CONFLICT (endpoint) DO UPDATE SET dono_tipo = EXCLUDED.dono_tipo, dono_id = EXCLUDED.dono_id, sessao_versao = EXCLUDED.sessao_versao,
      p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, criada_em = now()`;
  return true;
}

export async function versaoDe(dono: "equipe" | "motorista", id: number): Promise<number> {
  const [r] = dono === "equipe"
    ? await sql<{ v: number }[]>`SELECT sessao_versao AS v FROM usuarios WHERE id = ${id}`
    : await sql<{ v: number }[]>`SELECT sessao_versao AS v FROM motoristas WHERE id = ${id}`;
  return r?.v ?? -1;
}
