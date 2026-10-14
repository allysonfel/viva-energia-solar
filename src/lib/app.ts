// Consultas do app do motorista.
import { sql } from "./db";
import { situacaoEstacao, situacaoConector, type Situacao } from "./ocpp/tipos";
import { listarTarifas, precoNoHorario } from "./tarifas";

export type EstacaoApp = {
  id: number;
  codigo: string;
  nome: string;
  endereco: string;
  bairro: string;
  cidade: string;
  lat: number | null;
  lng: number | null;
  preco_kwh_centavos: number;
  // Tarifa do horário atual (faixas) ou o preço da estação.
  preco_agora: number;
  tarifa_nome: string | null;
  situacao: Situacao;
  conectores: { numero: number; tipo: string; potencia_w: number; situacao: Situacao }[];
};

// Estações ativas com localização (as sem coordenada não aparecem no mapa,
// mas abrem pelo QR code/código).
export async function estacoesDoMapa(codigo?: string): Promise<EstacaoApp[]> {
  const rows = await sql<(Omit<EstacaoApp, "situacao" | "conectores"> & { conectada: boolean; habilitada: boolean; status_geral: string; conectores: { numero: number; tipo: string; potencia_w: number; status: string }[] | null })[]>`
    SELECT e.id, e.codigo, e.nome, e.endereco, e.bairro, e.cidade, e.lat, e.lng, e.preco_kwh_centavos, e.conectada, e.habilitada, e.status_geral,
      (SELECT json_agg(json_build_object('numero', c.numero, 'tipo', c.tipo, 'potencia_w', c.potencia_w, 'status', c.status) ORDER BY c.numero)
        FROM conectores c WHERE c.estacao_id = e.id) AS conectores
    FROM estacoes e
    WHERE e.ativa ${codigo ? sql`AND e.codigo = ${codigo}` : sql`AND e.lat IS NOT NULL AND e.lng IS NOT NULL`}
    ORDER BY e.nome`;
  const tarifas = await listarTarifas();
  return rows.map(({ conectada, habilitada, status_geral, conectores, ...e }) => {
    const t = precoNoHorario(tarifas, e.preco_kwh_centavos);
    const cs = (conectores ?? []).map((c) => ({ numero: c.numero, tipo: c.tipo, potencia_w: c.potencia_w, situacao: situacaoConector(conectada, habilitada ? c.status : "Unavailable"), status: c.status }));
    return {
      ...e,
      preco_agora: t.preco,
      tarifa_nome: t.nome,
      situacao: situacaoEstacao({ conectada, habilitada, status_geral }, cs),
      conectores: cs.map(({ status: _s, ...c }) => c),
    };
  });
}

export type RecargaApp = {
  id: number;
  estacao: string;
  estacao_codigo: string;
  conector_numero: number;
  conector: string | null;
  status: string;
  inicio: Date;
  fim: Date | null;
  energia_wh: number;
  potencia_w: number;
  soc: number | null;
  valor_centavos: number;
  preco_kwh_centavos: number;
  motivo_fim: string | null;
  parada_solicitada: boolean;
  tarifa_nome: string | null;
  preco_cheio_centavos: number | null;
  desconto_pct: number;
  voucher: string | null;
};

const COLUNAS = sql`
  r.id, e.nome AS estacao, e.codigo AS estacao_codigo, r.conector_numero, c.tipo || ' ' || (c.potencia_w / 1000) || ' kW' AS conector,
  r.status, r.inicio, r.fim, r.energia_wh, r.potencia_w, r.soc, r.valor_centavos, r.preco_kwh_centavos, r.motivo_fim, r.parada_solicitada,
  r.tarifa_nome, r.preco_cheio_centavos, r.desconto_pct, v.codigo AS voucher`;
const ORIGEM = sql`
  FROM recargas r JOIN estacoes e ON e.id = r.estacao_id
  LEFT JOIN vouchers v ON v.id = r.voucher_id
  LEFT JOIN conectores c ON c.estacao_id = r.estacao_id AND c.numero = r.conector_numero`;

// Só recargas do próprio motorista.
export async function recargaDoMotorista(id: number, motorista: number): Promise<RecargaApp | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [r] = await sql<RecargaApp[]>`SELECT ${COLUNAS} ${ORIGEM} WHERE r.id = ${id} AND r.motorista_id = ${motorista}`;
  return r ?? null;
}

export async function recargaEmAndamento(motorista: number): Promise<RecargaApp | null> {
  const [r] = await sql<RecargaApp[]>`SELECT ${COLUNAS} ${ORIGEM} WHERE r.motorista_id = ${motorista} AND r.status = 'em_andamento' ORDER BY r.inicio DESC LIMIT 1`;
  return r ?? null;
}

export async function historico(motorista: number, limite = 50): Promise<RecargaApp[]> {
  return sql<RecargaApp[]>`SELECT ${COLUNAS} ${ORIGEM} WHERE r.motorista_id = ${motorista} AND r.status <> 'recusada' ORDER BY r.inicio DESC LIMIT ${limite}`;
}

// As estações com conector livre mais perto de um ponto (pedido do cliente:
// estação ocupada, o motorista já vê para onde ir).
export function maisProximasLivres(todas: EstacaoApp[], de: { lat: number; lng: number }, exceto: string, n = 2) {
  const r = (x: number) => (x * Math.PI) / 180;
  const km = (b: { lat: number; lng: number }) => {
    const h = Math.sin(r(b.lat - de.lat) / 2) ** 2 + Math.cos(r(de.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - de.lng) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  };
  return todas
    .filter((e): e is EstacaoApp & { lat: number; lng: number } => e.codigo !== exceto && e.lat !== null && e.lng !== null && e.conectores.some((c) => c.situacao === "disponivel"))
    .map((e) => ({
      codigo: e.codigo, nome: e.nome, bairro: e.bairro, km: km(e), preco: e.preco_agora,
      livres: e.conectores.filter((c) => c.situacao === "disponivel").length,
      tipos: [...new Set(e.conectores.filter((c) => c.situacao === "disponivel").map((c) => c.tipo))],
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}
export type Proxima = ReturnType<typeof maisProximasLivres>[number];

// kg de CO₂ evitados por kWh (carro elétrico x a combustão, referência do protótipo).
export const CO2_POR_KWH = 0.52;

// Vouchers do motorista que ainda podem ser usados (resgatados, sem uso,
// ativos, na validade e com limite disponível). Com estação, só os que valem nela.
export type VoucherApp = { mv: number; codigo: string; pct: number; descricao: string; estacao: string | null; estacao_id: number | null; valido_ate: Date | null };

export async function vouchersDisponiveis(motorista: number, estacaoId?: number): Promise<VoucherApp[]> {
  return sql<VoucherApp[]>`
    SELECT mv.id AS mv, v.codigo, v.pct, v.descricao, e.nome AS estacao, v.estacao_id, v.valido_ate
    FROM motorista_vouchers mv JOIN vouchers v ON v.id = mv.voucher_id LEFT JOIN estacoes e ON e.id = v.estacao_id
    WHERE mv.motorista_id = ${motorista} AND mv.recarga_id IS NULL AND v.ativo
      AND (v.valido_ate IS NULL OR v.valido_ate >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
      AND (v.limite_usos IS NULL OR (SELECT count(*) FROM motorista_vouchers u WHERE u.voucher_id = v.id AND u.recarga_id IS NOT NULL) < v.limite_usos)
      ${estacaoId ? sql`AND (v.estacao_id IS NULL OR v.estacao_id = ${estacaoId})` : sql``}
    ORDER BY v.pct DESC, mv.id`;
}
