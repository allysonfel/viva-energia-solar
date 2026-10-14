// Avisos no celular (push) e na caixa de avisos do app. Envio sempre em
// segundo plano: quem chama (ex.: a central OCPP) não espera a entrega.
// Texto sem dado pessoal sensível (aparece na tela bloqueada).
import "server-only";
import { sql } from "./db";
import { enviarPush, type Inscricao } from "./push";

async function entregar(dono: "equipe" | "motorista", ids: number[], dados: { titulo: string; texto: string; link: string; tag?: string }) {
  if (!ids.length) return;
  const tabela = dono === "equipe" ? sql`usuarios` : sql`motoristas`;
  const inscricoes = await sql<(Inscricao & { id: number })[]>`
    SELECT p.id, p.endpoint, p.p256dh, p.auth FROM push_inscricoes p JOIN ${tabela} d ON d.id = p.dono_id
    WHERE p.dono_tipo = ${dono} AND p.dono_id IN ${sql(ids)} AND d.ativo AND d.sessao_versao = p.sessao_versao`;
  for (const i of inscricoes) {
    const r = await enviarPush(i, dados);
    if (r === "expirada") await sql`DELETE FROM push_inscricoes WHERE id = ${i.id}`;
    else if (r === "ok") await sql`UPDATE push_inscricoes SET usada_em = now() WHERE id = ${i.id}`;
  }
}

const emSegundoPlano = (p: Promise<unknown>) => {
  p.catch((err) => console.error("[avisos] falha", err instanceof Error ? err.message : err));
};

// Motorista: grava na caixa do app e manda push (se ele deixou "Avisos de recarga" ligado).
export function avisarMotorista(motoristaId: number, titulo: string, texto: string, link: string) {
  emSegundoPlano(
    (async () => {
      const [m] = await sql<{ avisos_recarga: boolean }[]>`
        INSERT INTO avisos_motorista (motorista_id, titulo, texto, link) VALUES (${motoristaId}, ${titulo.slice(0, 80)}, ${texto.slice(0, 200)}, ${link})
        RETURNING (SELECT avisos_recarga FROM motoristas WHERE id = ${motoristaId})`;
      if (m?.avisos_recarga) await entregar("motorista", [motoristaId], { titulo, texto, link, tag: link });
    })(),
  );
}

// Equipe: admins e operadores, e o parceiro dono da estação (quando houver).
export function avisarEquipe(estacaoId: number | null, titulo: string, texto: string, link: string) {
  emSegundoPlano(
    (async () => {
      const ids = await sql<{ id: number }[]>`
        SELECT u.id FROM usuarios u WHERE u.ativo AND (u.perfil IN ('admin', 'operador')
          OR (u.perfil = 'parceiro' AND u.parceiro_id = (SELECT parceiro_id FROM estacoes WHERE id = ${estacaoId ?? 0})))`;
      await entregar("equipe", ids.map((x) => x.id), { titulo, texto, link, tag: `${link}-${titulo}` });
    })(),
  );
}
