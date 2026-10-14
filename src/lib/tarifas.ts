// Tarifas por faixa de horário (Brasília). Sem faixas cadastradas, vale o
// preço de cada estação. A tarifa da recarga é a do horário em que ela começa.
import { sql } from "./db";

export type Tarifa = { id: number; nome: string; hora_inicio: number; hora_fim: number; preco_kwh_centavos: number; cor: string };

export async function listarTarifas(): Promise<Tarifa[]> {
  return sql<Tarifa[]>`SELECT id, nome, hora_inicio, hora_fim, preco_kwh_centavos, cor FROM tarifas ORDER BY hora_inicio`;
}

// Hora de Brasília (UTC-3, sem horário de verão).
export const horaBrasilia = (d: Date = new Date()) => new Date(d.getTime() - 3 * 3_600_000).getUTCHours();

export function faixaNoHorario(tarifas: Tarifa[], d: Date = new Date()): Tarifa | null {
  const h = horaBrasilia(d);
  return tarifas.find((t) => h >= t.hora_inicio && h < t.hora_fim) ?? null;
}

// Preço do kWh agora (ou no horário dado) numa estação.
export function precoNoHorario(tarifas: Tarifa[], precoEstacao: number, d: Date = new Date()): { preco: number; nome: string | null } {
  const f = faixaNoHorario(tarifas, d);
  return f ? { preco: f.preco_kwh_centavos, nome: f.nome } : { preco: precoEstacao, nome: null };
}

// As faixas precisam cobrir 0h a 24h, em sequência, sem buraco nem sobreposição.
export function validarGrade(fx: { hora_inicio: number; hora_fim: number }[]): string | null {
  if (!fx.length) return null;
  const o = [...fx].sort((a, b) => a.hora_inicio - b.hora_inicio);
  if (o[0].hora_inicio !== 0) return "A primeira faixa precisa começar às 00h.";
  for (let i = 1; i < o.length; i++) {
    if (o[i].hora_inicio < o[i - 1].hora_fim) return "Há faixas que se sobrepõem.";
    if (o[i].hora_inicio > o[i - 1].hora_fim) return `Falta preço entre ${o[i - 1].hora_fim}h e ${o[i].hora_inicio}h.`;
  }
  if (o[o.length - 1].hora_fim !== 24) return "A última faixa precisa terminar às 24h.";
  return null;
}
