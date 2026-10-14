// Consultas do app do motorista.
import { sql } from "./db";
import { situacaoEstacao, situacaoConector, type Situacao } from "./ocpp/tipos";

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
  return rows.map(({ conectada, habilitada, status_geral, conectores, ...e }) => {
    const cs = (conectores ?? []).map((c) => ({ numero: c.numero, tipo: c.tipo, potencia_w: c.potencia_w, situacao: situacaoConector(conectada, habilitada ? c.status : "Unavailable"), status: c.status }));
    return {
      ...e,
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
};

const COLUNAS = sql`
  r.id, e.nome AS estacao, e.codigo AS estacao_codigo, r.conector_numero, c.tipo || ' ' || (c.potencia_w / 1000) || ' kW' AS conector,
  r.status, r.inicio, r.fim, r.energia_wh, r.potencia_w, r.soc, r.valor_centavos, r.preco_kwh_centavos, r.motivo_fim, r.parada_solicitada`;
const ORIGEM = sql`
  FROM recargas r JOIN estacoes e ON e.id = r.estacao_id
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

// kg de CO₂ evitados por kWh (carro elétrico x a combustão, referência do protótipo).
export const CO2_POR_KWH = 0.52;
