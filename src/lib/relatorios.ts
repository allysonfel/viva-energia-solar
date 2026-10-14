// Números do relatório comercial. Receita = recargas cobradas de motoristas
// (app). Recargas da operação (cartão de serviço/teste) não têm cobrança, mas
// a energia delas entra no custo. Repasse = % da receita da estação do
// parceiro. Taxas de pagamento = estimativa pela taxa média configurada.
import { sql } from "./db";
import { getSettings } from "./settings";

export const PERIODOS = { mes: "Este mês", mes_anterior: "Mês passado", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", ano: "Este ano" } as const;
export type Periodo = keyof typeof PERIODOS;

export const lerPeriodo = (v: unknown): Periodo => (typeof v === "string" && v in PERIODOS ? (v as Periodo) : "mes");

// Intervalo [ini, fim) no horário de Brasília.
function intervalo(p: Periodo): { ini: Date; fim: Date } {
  const agora = new Date();
  const br = new Date(agora.getTime() - 3 * 3_600_000);
  const y = br.getUTCFullYear(), m = br.getUTCMonth();
  const meiaNoite = (ano: number, mes: number, dia: number) => new Date(Date.UTC(ano, mes, dia, 3));
  if (p === "mes") return { ini: meiaNoite(y, m, 1), fim: agora };
  if (p === "mes_anterior") return { ini: meiaNoite(y, m - 1, 1), fim: meiaNoite(y, m, 1) };
  if (p === "ano") return { ini: meiaNoite(y, 0, 1), fim: agora };
  const dias = p === "7d" ? 7 : 30;
  return { ini: new Date(agora.getTime() - dias * 86_400_000), fim: agora };
}

export type LinhaEstacao = {
  id: number; nome: string; parceiro: string | null; repasse_pct: number;
  recargas: number; wh: number; receita: number; custo: number; descontos: number; operacao_wh: number;
  taxas: number; repasse: number; resultado: number;
};

export async function gerarRelatorio(p: Periodo, opcoes: { estacao?: number | null; parceiro?: number | null }) {
  const { ini, fim } = intervalo(p);
  const s = await getSettings();
  const filtro = sql`
    ${opcoes.estacao ? sql`AND e.id = ${opcoes.estacao}` : sql``}
    ${opcoes.parceiro ? sql`AND e.parceiro_id = ${opcoes.parceiro}` : sql``}`;
  const rows = await sql<Omit<LinhaEstacao, "taxas" | "repasse" | "resultado">[]>`
    SELECT e.id, e.nome, pa.nome AS parceiro, coalesce(pa.repasse_pct, 0)::float AS repasse_pct,
      count(r.id) FILTER (WHERE r.motorista_id IS NOT NULL)::int AS recargas,
      coalesce(sum(r.energia_wh) FILTER (WHERE r.motorista_id IS NOT NULL), 0)::bigint AS wh,
      coalesce(sum(r.valor_centavos) FILTER (WHERE r.motorista_id IS NOT NULL), 0)::bigint AS receita,
      coalesce(sum(round(r.energia_wh * r.custo_kwh_centavos / 1000.0)), 0)::bigint AS custo,
      coalesce(sum(round(r.energia_wh * (coalesce(r.preco_cheio_centavos, r.preco_kwh_centavos) - r.preco_kwh_centavos) / 1000.0)) FILTER (WHERE r.motorista_id IS NOT NULL), 0)::bigint AS descontos,
      coalesce(sum(r.energia_wh) FILTER (WHERE r.motorista_id IS NULL), 0)::bigint AS operacao_wh
    FROM estacoes e
    LEFT JOIN parceiros pa ON pa.id = e.parceiro_id
    LEFT JOIN recargas r ON r.estacao_id = e.id AND r.status <> 'recusada' AND r.inicio >= ${ini} AND r.inicio < ${fim}
    WHERE (e.ativa OR r.id IS NOT NULL) ${filtro}
    GROUP BY e.id, e.nome, pa.nome, pa.repasse_pct
    ORDER BY receita DESC, e.nome`;
  const estacoes: LinhaEstacao[] = rows.map((r) => {
    const taxas = Math.round((r.receita * s.taxaPagamentoBp) / 10_000);
    const repasse = Math.round((r.receita * r.repasse_pct) / 100);
    return { ...r, taxas, repasse, resultado: r.receita - r.custo - taxas - repasse };
  });
  const soma = (k: keyof LinhaEstacao) => estacoes.reduce((t, e) => t + (e[k] as number), 0);
  const total = {
    recargas: soma("recargas"), wh: soma("wh"), receita: soma("receita"), custo: soma("custo"), descontos: soma("descontos"),
    operacao_wh: soma("operacao_wh"), taxas: soma("taxas"), repasse: soma("repasse"), resultado: soma("resultado"),
  };
  const parceiros = Object.values(
    estacoes.filter((e) => e.parceiro).reduce<Record<string, { parceiro: string; pct: number; estacoes: number; receita: number; repasse: number }>>((acc, e) => {
      const k = e.parceiro!;
      acc[k] ??= { parceiro: k, pct: e.repasse_pct, estacoes: 0, receita: 0, repasse: 0 };
      acc[k].estacoes++;
      acc[k].receita += e.receita;
      acc[k].repasse += e.repasse;
      return acc;
    }, {}),
  );
  // Série para o gráfico: por dia (ou por mês no ano).
  // Unidade e formato como texto fixo do código (não parâmetro): o GROUP BY
  // precisa ser a mesma expressão do SELECT.
  const porMes = p === "ano";
  const unidade = porMes ? sql`'month'` : sql`'day'`;
  const formato = porMes ? sql`'MM/YYYY'` : sql`'DD/MM'`;
  const serie = await sql<{ rotulo: string; receita: number; custo: number }[]>`
    SELECT to_char(date_trunc(${unidade}, r.inicio AT TIME ZONE 'America/Sao_Paulo'), ${formato}) AS rotulo,
      coalesce(sum(r.valor_centavos) FILTER (WHERE r.motorista_id IS NOT NULL), 0)::bigint AS receita,
      coalesce(sum(round(r.energia_wh * r.custo_kwh_centavos / 1000.0)), 0)::bigint AS custo
    FROM recargas r JOIN estacoes e ON e.id = r.estacao_id
    WHERE r.status <> 'recusada' AND r.inicio >= ${ini} AND r.inicio < ${fim} ${filtro}
    GROUP BY date_trunc(${unidade}, r.inicio AT TIME ZONE 'America/Sao_Paulo')
    ORDER BY date_trunc(${unidade}, r.inicio AT TIME ZONE 'America/Sao_Paulo')`;
  return { periodo: { ini, fim }, estacoes, total, parceiros, serie, taxaPct: s.taxaPagamentoBp / 100 };
}
