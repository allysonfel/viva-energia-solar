// Busca de recargas com filtros (tela e exportação usam a mesma consulta).
import { sql } from "./db";

export const PERIODOS = { hoje: "Hoje", "7d": "Últimos 7 dias", mes: "Este mês", "30d": "Últimos 30 dias", tudo: "Tudo" } as const;
export type Periodo = keyof typeof PERIODOS;

export type Filtro = { estacao: number | null; periodo: Periodo; status: string | null; busca: string };

export function lerFiltro(q: Record<string, string | undefined>): Filtro {
  const periodo = (q.p && q.p in PERIODOS ? q.p : "7d") as Periodo;
  const status = ["em_andamento", "concluida", "interrompida", "recusada"].includes(q.s ?? "") ? q.s! : null;
  return { estacao: Number(q.estacao) || null, periodo, status, busca: String(q.q ?? "").trim().slice(0, 40) };
}

const desde = (p: Periodo) =>
  p === "hoje" ? sql`date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`
  : p === "7d" ? sql`now() - interval '7 days'`
  : p === "mes" ? sql`date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`
  : p === "30d" ? sql`now() - interval '30 days'`
  : sql`'-infinity'::timestamptz`;

export type LinhaRecarga = {
  id: number; estacao: string; estacao_id: number; conector_numero: number; conector: string | null; id_tag: string; origem: string;
  status: string; inicio: Date; fim: Date | null; energia_wh: number; valor_centavos: number; motivo_fim: string | null; usuario: string | null;
  motorista: string | null;
};

export async function buscarRecargas(f: Filtro, parceiro: number | null, limite = 50, pagina = 1) {
  const buscaId = /^#?\d+$/.test(f.busca) ? Number(f.busca.replace("#", "")) : null;
  const onde = sql`
    WHERE r.inicio >= ${desde(f.periodo)}
    ${parceiro ? sql`AND e.parceiro_id = ${parceiro}` : sql``}
    ${f.estacao ? sql`AND r.estacao_id = ${f.estacao}` : sql``}
    ${f.status ? sql`AND r.status = ${f.status}` : sql``}
    ${buscaId ? sql`AND r.id = ${buscaId}` : f.busca ? sql`AND r.id_tag ILIKE ${"%" + f.busca.replace(/[%_\\]/g, "") + "%"}` : sql``}`;
  const linhas = await sql<LinhaRecarga[]>`
    SELECT r.id, e.nome AS estacao, r.estacao_id, r.conector_numero, c.tipo || ' · ' || (c.potencia_w / 1000) || ' kW' AS conector,
      r.id_tag, r.origem, r.status, r.inicio, r.fim, r.energia_wh, r.valor_centavos, r.motivo_fim, u.nome AS usuario, mo.nome AS motorista
    FROM recargas r JOIN estacoes e ON e.id = r.estacao_id
    LEFT JOIN conectores c ON c.estacao_id = r.estacao_id AND c.numero = r.conector_numero
    LEFT JOIN usuarios u ON u.id = r.usuario_id
    LEFT JOIN motoristas mo ON mo.id = r.motorista_id
    ${onde}
    ORDER BY r.inicio DESC LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`;
  const [t] = await sql<{ n: number; wh: number; centavos: number }[]>`
    SELECT count(*)::int AS n, coalesce(sum(r.energia_wh), 0)::bigint AS wh, coalesce(sum(r.valor_centavos), 0)::bigint AS centavos
    FROM recargas r JOIN estacoes e ON e.id = r.estacao_id ${onde}`;
  return { linhas, total: t };
}
