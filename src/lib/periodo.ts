// Períodos dos filtros do painel (relatórios, recargas e exportações), no
// horário de Brasília (UTC-3, sem horário de verão). "personalizado" usa as
// datas de/até (AAAA-MM-DD, as duas inclusas).
export const PERIODOS = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7d": "Últimos 7 dias",
  mes: "Este mês",
  mes_anterior: "Mês passado",
  "30d": "Últimos 30 dias",
  ano: "Este ano",
  tudo: "Tudo",
  personalizado: "Período personalizado",
} as const;
export type Periodo = keyof typeof PERIODOS;

export type Intervalo = { p: Periodo; ini: Date; fim: Date; de: string; ate: string };

const DIA = 86_400_000;
const FUSO = 3 * 3_600_000;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Meia-noite de Brasília do dia (ano, mês, dia), em UTC.
const meiaNoite = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 3));
// Data de Brasília (AAAA-MM-DD) de um instante.
export const diaBr = (d: Date) => new Date(d.getTime() - FUSO).toISOString().slice(0, 10);

function lerData(v: unknown): Date | null {
  if (typeof v !== "string" || !DATA.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const t = meiaNoite(y, m - 1, d);
  return diaBr(t) === v && y >= 2020 && y <= 2100 ? t : null;
}

// Lê p, de e ate da URL. Período fora da lista (ou não permitido na tela)
// vira o padrão; personalizado com datas inválidas ou invertidas também.
export function lerIntervalo(q: { p?: unknown; de?: unknown; ate?: unknown }, padrao: Periodo, permitidos?: readonly Periodo[]): Intervalo {
  const ok = (v: unknown): v is Periodo => typeof v === "string" && v in PERIODOS && (!permitidos || permitidos.includes(v as Periodo));
  const p = ok(q.p) ? q.p : padrao;
  const agora = new Date();
  const br = new Date(agora.getTime() - FUSO);
  const y = br.getUTCFullYear(), m = br.getUTCMonth(), d = br.getUTCDate();
  const hoje = meiaNoite(y, m, d);
  let ini: Date, fim: Date = agora;
  switch (p) {
    case "hoje": ini = hoje; break;
    case "ontem": ini = new Date(hoje.getTime() - DIA); fim = hoje; break;
    case "7d": ini = new Date(hoje.getTime() - 6 * DIA); break;
    case "30d": ini = new Date(hoje.getTime() - 29 * DIA); break;
    case "mes": ini = meiaNoite(y, m, 1); break;
    case "mes_anterior": ini = meiaNoite(y, m - 1, 1); fim = meiaNoite(y, m, 1); break;
    case "ano": ini = meiaNoite(y, 0, 1); break;
    case "tudo": ini = new Date(Date.UTC(2020, 0, 1)); break;
    case "personalizado": {
      const de = lerData(q.de), ate = lerData(q.ate);
      if (!de || !ate || de > ate || ate.getTime() - de.getTime() > 3 * 366 * DIA) return lerIntervalo({ p: padrao }, padrao);
      ini = de;
      fim = new Date(ate.getTime() + DIA);
      break;
    }
  }
  return { p, ini, fim, de: diaBr(ini), ate: diaBr(new Date(fim.getTime() - 1)) };
}

// Parâmetros de URL do intervalo (para links de exportação e paginação).
export const paramsIntervalo = (i: Intervalo): [string, string][] =>
  i.p === "personalizado" ? [["p", i.p], ["de", i.de], ["ate", i.ate]] : [["p", i.p]];

export function rotuloIntervalo(i: Intervalo): string {
  const br = (s: string) => s.split("-").reverse().join("/");
  if (i.p === "tudo") return "Todo o histórico";
  return i.de === i.ate ? br(i.de) : `${br(i.de)} a ${br(i.ate)}`;
}
