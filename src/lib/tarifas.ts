// Tarifas por horário (Brasília). Cada estação escolhe as suas; fora delas
// vale o preço da estação. A tarifa da recarga é a do horário em que ela
// começa. Faixa com fim antes do início atravessa a meia-noite (22h às 06h).
import { sql } from "./db";

export type Tarifa = { id: number; nome: string; hora_inicio: number; hora_fim: number; preco_kwh_centavos: number; cor: string };

export async function listarTarifas(): Promise<Tarifa[]> {
  return sql<Tarifa[]>`SELECT id, nome, hora_inicio, hora_fim, preco_kwh_centavos, cor FROM tarifas ORDER BY hora_inicio, nome`;
}

export async function tarifasDaEstacao(estacaoId: number): Promise<Tarifa[]> {
  return sql<Tarifa[]>`
    SELECT t.id, t.nome, t.hora_inicio, t.hora_fim, t.preco_kwh_centavos, t.cor
    FROM tarifas t JOIN estacao_tarifas et ON et.tarifa_id = t.id
    WHERE et.estacao_id = ${estacaoId} ORDER BY t.hora_inicio`;
}

// Tarifas de todas as estações de uma vez (mapa do app).
export async function tarifasPorEstacao(): Promise<Map<number, Tarifa[]>> {
  const rows = await sql<(Tarifa & { estacao_id: number })[]>`
    SELECT et.estacao_id, t.id, t.nome, t.hora_inicio, t.hora_fim, t.preco_kwh_centavos, t.cor
    FROM tarifas t JOIN estacao_tarifas et ON et.tarifa_id = t.id ORDER BY t.hora_inicio`;
  const m = new Map<number, Tarifa[]>();
  for (const { estacao_id, ...t } of rows) m.set(estacao_id, [...(m.get(estacao_id) ?? []), t]);
  return m;
}

// Hora de Brasília (UTC-3, sem horário de verão).
export const horaBrasilia = (d: Date = new Date()) => new Date(d.getTime() - 3 * 3_600_000).getUTCHours();

// Horas (0 a 23) que a faixa cobre.
export function horasDa(t: Pick<Tarifa, "hora_inicio" | "hora_fim">): number[] {
  const n = t.hora_fim > t.hora_inicio ? t.hora_fim - t.hora_inicio : 24 - t.hora_inicio + t.hora_fim;
  return Array.from({ length: n }, (_, i) => (t.hora_inicio + i) % 24);
}

export const horarioDa = (t: Pick<Tarifa, "hora_inicio" | "hora_fim">) =>
  `${String(t.hora_inicio).padStart(2, "0")}h às ${String(t.hora_fim % 24).padStart(2, "0")}h`;

export function faixaNoHorario(tarifas: Tarifa[], d: Date = new Date()): Tarifa | null {
  const h = horaBrasilia(d);
  return tarifas.find((t) => horasDa(t).includes(h)) ?? null;
}

// Preço do kWh agora (ou no horário dado) numa estação.
export function precoNoHorario(tarifas: Tarifa[], precoEstacao: number, d: Date = new Date()): { preco: number; nome: string | null } {
  const f = faixaNoHorario(tarifas, d);
  return f ? { preco: f.preco_kwh_centavos, nome: f.nome } : { preco: precoEstacao, nome: null };
}

// Tarifas de uma mesma estação não podem dividir a mesma hora.
export function conflitoDeHorario(tarifas: Tarifa[]): string | null {
  const dona = new Map<number, Tarifa>();
  for (const t of tarifas) {
    for (const h of horasDa(t)) {
      const outra = dona.get(h);
      if (outra) return `"${outra.nome}" (${horarioDa(outra)}) e "${t.nome}" (${horarioDa(t)}) usam o mesmo horário. Escolha só uma delas para essa estação.`;
      dona.set(h, t);
    }
  }
  return null;
}

// As 24 horas em blocos seguidos (para a faixa colorida): cada bloco é uma
// tarifa ou o preço da estação (tarifa null).
export function blocosDoDia(tarifas: Tarifa[]): { inicio: number; horas: number; tarifa: Tarifa | null }[] {
  const porHora = Array.from({ length: 24 }, (_, h) => tarifas.find((t) => horasDa(t).includes(h)) ?? null);
  const blocos: { inicio: number; horas: number; tarifa: Tarifa | null }[] = [];
  porHora.forEach((t, h) => {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.tarifa?.id === t?.id) ultimo.horas++;
    else blocos.push({ inicio: h, horas: 1, tarifa: t });
  });
  return blocos;
}
