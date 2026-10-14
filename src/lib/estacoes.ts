// Consultas das estações para o painel (lista ao vivo e detalhe).
import { sql } from "./db";
import { situacaoEstacao, situacaoConector, type Situacao } from "./ocpp/tipos";

export type ConectorVista = { numero: number; tipo: string; potencia_w: number; status: string; erro: string; situacao: Situacao };
export type EstacaoVista = {
  id: number;
  codigo: string;
  nome: string;
  endereco: string;
  bairro: string;
  cidade: string;
  parceiro: string | null;
  simulada: boolean;
  habilitada: boolean;
  conectada: boolean;
  ultimo_contato: Date | null;
  limite_w: number | null;
  situacao: Situacao;
  conectores: ConectorVista[];
  mes_wh: number;
  mes_centavos: number;
  mes_recargas: number;
  ocupacao: number;
};

// Estações com conectores e números do mês. Parceiro: só as dele.
export async function listarEstacoes(parceiro: number | null, id?: number): Promise<EstacaoVista[]> {
  const rows = await sql<(Omit<EstacaoVista, "situacao" | "conectores" | "ocupacao"> & { status_geral: string; conectores: Omit<ConectorVista, "situacao">[] | null; min_uso: number })[]>`
    SELECT e.id, e.codigo, e.nome, e.endereco, e.bairro, e.cidade, p.nome AS parceiro, e.simulada, e.habilitada, e.conectada,
      e.ultimo_contato, e.limite_w, e.status_geral,
      (SELECT json_agg(json_build_object('numero', c.numero, 'tipo', c.tipo, 'potencia_w', c.potencia_w, 'status', c.status, 'erro', c.erro) ORDER BY c.numero)
        FROM conectores c WHERE c.estacao_id = e.id) AS conectores,
      coalesce(m.wh, 0)::bigint AS mes_wh, coalesce(m.centavos, 0)::bigint AS mes_centavos, coalesce(m.n, 0)::int AS mes_recargas,
      coalesce(m.min_uso, 0)::int AS min_uso
    FROM estacoes e
    LEFT JOIN parceiros p ON p.id = e.parceiro_id
    LEFT JOIN LATERAL (
      SELECT sum(r.energia_wh) AS wh, sum(r.valor_centavos) AS centavos, count(*) AS n,
        sum(extract(epoch FROM (coalesce(r.fim, now()) - greatest(r.inicio, date_trunc('month', now())))) / 60) AS min_uso
      FROM recargas r WHERE r.estacao_id = e.id AND r.status <> 'recusada' AND coalesce(r.fim, now()) >= date_trunc('month', now())
    ) m ON true
    WHERE e.ativa ${parceiro ? sql`AND e.parceiro_id = ${parceiro}` : sql``} ${id ? sql`AND e.id = ${id}` : sql``}
    ORDER BY e.nome`;
  // Ocupação: minutos em recarga no mês / (minutos do mês até agora x conectores).
  const minMes = Math.max(1, (Date.now() - inicioDoMes().getTime()) / 60_000);
  return rows.map(({ status_geral, conectores, min_uso, ...e }) => {
    const cs = (conectores ?? []).map((c) => ({ ...c, situacao: situacaoConector(e.conectada, c.status) }));
    return {
      ...e,
      conectores: cs,
      situacao: situacaoEstacao({ conectada: e.conectada, habilitada: e.habilitada, status_geral }, cs),
      ocupacao: Math.min(100, Math.round((min_uso / (minMes * Math.max(1, cs.length))) * 100)),
    };
  });
}

function inicioDoMes() {
  // Mês corrente no horário de Brasília (UTC-3, sem horário de verão).
  const agora = new Date(Date.now() - 3 * 3_600_000);
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1, 3));
}

// Confere se o usuário pode ver a estação (parceiro só as dele). Devolve o básico.
export async function estacaoDoEscopo(id: number, parceiro: number | null) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [e] = await sql<{ id: number; codigo: string; nome: string; simulada: boolean }[]>`
    SELECT id, codigo, nome, simulada FROM estacoes WHERE id = ${id} AND ativa ${parceiro ? sql`AND parceiro_id = ${parceiro}` : sql``}`;
  return e ?? null;
}
