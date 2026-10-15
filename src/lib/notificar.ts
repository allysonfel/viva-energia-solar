// Avisos no celular (push) e na caixa de avisos do app. Envio sempre em
// segundo plano: quem chama (ex.: a central OCPP) não espera a entrega.
// Texto sem dado pessoal sensível (aparece na tela bloqueada).
import "server-only";
import { sql } from "./db";
import { enviarPush, type Inscricao } from "./push";
import { brl, kwh, kw, duracao } from "./format";

type Dados = { titulo: string; texto: string; link: string; tag?: string; silencioso?: boolean };

async function entregar(dono: "equipe" | "motorista", ids: number[], dados: Dados, ttl?: number) {
  if (!ids.length) return;
  const tabela = dono === "equipe" ? sql`usuarios` : sql`motoristas`;
  const inscricoes = await sql<(Inscricao & { id: number })[]>`
    SELECT p.id, p.endpoint, p.p256dh, p.auth FROM push_inscricoes p JOIN ${tabela} d ON d.id = p.dono_id
    WHERE p.dono_tipo = ${dono} AND p.dono_id IN ${sql(ids)} AND d.ativo AND d.sessao_versao = p.sessao_versao`;
  for (const i of inscricoes) {
    const r = await enviarPush(i, dados, ttl);
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

// Andamento da recarga fora do app (pedido do cliente): push silencioso com a
// % da carga, que substitui o anterior (mesma tag do "Recarga iniciada").
// Não entra na caixa de avisos. Vai quando a carga sobe 10 pontos ou a cada
// 10 min (sem % do carro), nunca com menos de 2 min do anterior.
export function avisarProgresso(recargaId: number) {
  emSegundoPlano(
    (async () => {
      const [r] = await sql<{ motorista_id: number; estacao: string; soc: number | null; energia_wh: number; potencia_w: number; valor_centavos: number; inicio: Date }[]>`
        UPDATE recargas r SET progresso_aviso_em = now(), progresso_aviso_soc = r.soc
        FROM estacoes e, motoristas m
        WHERE r.id = ${recargaId} AND e.id = r.estacao_id AND m.id = r.motorista_id AND m.avisos_recarga
          AND r.status = 'em_andamento' AND NOT r.parada_solicitada AND r.energia_wh > 0
          AND (r.progresso_aviso_em IS NULL OR r.progresso_aviso_em < now() - interval '2 minutes')
          AND (r.progresso_aviso_em IS NULL OR r.progresso_aviso_em < now() - interval '10 minutes'
            OR (r.soc IS NOT NULL AND r.soc / 10 > coalesce(r.progresso_aviso_soc, -1) / 10))
        RETURNING r.motorista_id, e.nome AS estacao, r.soc, r.energia_wh, r.potencia_w, r.valor_centavos, r.inicio`;
      if (!r) return;
      const link = `/recarga/${recargaId}`;
      await entregar("motorista", [r.motorista_id], {
        titulo: r.soc !== null ? `Recarregando · ${r.soc}%` : `Recarregando · ${kwh(r.energia_wh)} kWh`,
        texto: `${r.estacao}\n${kw(r.potencia_w)} kW · ${kwh(r.energia_wh)} kWh · ${duracao(r.inicio)} · ${brl(r.valor_centavos)}`,
        link, tag: link, silencioso: true,
      }, 600);
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
