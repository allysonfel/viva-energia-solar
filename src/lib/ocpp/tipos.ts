// Formato das mensagens OCPP 1.6J (JSON sobre WebSocket):
//   CALL       [2, id, ação, payload]       pedido
//   CALLRESULT [3, id, payload]             resposta
//   CALLERROR  [4, id, código, texto, {}]   erro
export type Call = [2, string, string, Record<string, unknown>];
export type CallResult = [3, string, Record<string, unknown>];
export type CallError = [4, string, string, string, Record<string, unknown>];
export type Frame = Call | CallResult | CallError;

export function lerFrame(texto: string): Frame | null {
  let v: unknown;
  try {
    v = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!Array.isArray(v) || typeof v[1] !== "string" || v[1].length > 64) return null;
  if (v[0] === 2 && v.length === 4 && typeof v[2] === "string" && v[3] && typeof v[3] === "object") return v as Call;
  if (v[0] === 3 && v.length === 3 && v[2] && typeof v[2] === "object") return v as CallResult;
  if (v[0] === 4 && v.length >= 4 && typeof v[2] === "string") return [4, v[1], v[2], String(v[3] ?? ""), (v[4] as Record<string, unknown>) ?? {}];
  return null;
}

// Status de conector que contam como "ocupado" (tem carro ou recarga em curso).
export const OCUPADO = ["Preparing", "Charging", "SuspendedEV", "SuspendedEVSE", "Finishing"];

// Situação da estação para a tela (mesmas cores do protótipo).
export type Situacao = "disponivel" | "em_uso" | "offline" | "indisponivel" | "falha";

export const SITUACAO_NOME: Record<Situacao, string> = {
  disponivel: "Disponível",
  em_uso: "Em uso",
  offline: "Offline",
  indisponivel: "Indisponível",
  falha: "Com falha",
};

export function situacaoEstacao(e: { conectada: boolean; habilitada: boolean; status_geral: string }, conectores: { status: string }[]): Situacao {
  if (!e.conectada) return "offline";
  if (!e.habilitada || e.status_geral === "Unavailable") return "indisponivel";
  if (e.status_geral === "Faulted") return "falha";
  if (conectores.some((c) => c.status === "Available")) return "disponivel";
  if (conectores.some((c) => OCUPADO.includes(c.status))) return "em_uso";
  if (conectores.some((c) => c.status === "Faulted")) return "falha";
  return "indisponivel";
}

export function situacaoConector(estacaoConectada: boolean, status: string): Situacao {
  if (!estacaoConectada) return "offline";
  if (status === "Available") return "disponivel";
  if (OCUPADO.includes(status)) return "em_uso";
  if (status === "Faulted") return "falha";
  return "indisponivel";
}

export const STATUS_CONECTOR_NOME: Record<string, string> = {
  Available: "Livre",
  Preparing: "Carro conectado",
  Charging: "Carregando",
  SuspendedEV: "Pausado pelo carro",
  SuspendedEVSE: "Pausado pelo carregador",
  Finishing: "Finalizando",
  Reserved: "Reservado",
  Unavailable: "Indisponível",
  Faulted: "Com falha",
};

export const TIPOS_CONECTOR = ["CCS2", "Tipo 2", "CHAdeMO", "GB/T", "CCS1", "Tipo 1"];

// Uma leitura do MeterValues. Padrão do OCPP quando não vem "measurand":
// energia ativa importada (registrador), em Wh.
type Amostra = { value?: unknown; measurand?: unknown; unit?: unknown; phase?: unknown };

export function lerMedidor(amostras: Amostra[]): { energiaWh: number | null; potenciaW: number | null; soc: number | null } {
  const de = (m: string) =>
    amostras.filter((a) => (typeof a.measurand === "string" ? a.measurand : "Energy.Active.Import.Register") === m);
  const valor = (a: Amostra) => {
    const n = Number(a.value);
    if (!Number.isFinite(n)) return null;
    const u = String(a.unit ?? "").toLowerCase();
    return u === "kwh" || u === "kw" ? n * 1000 : n;
  };
  const escolher = (lista: Amostra[], somarFases: boolean) => {
    const semFase = lista.filter((a) => !a.phase).map(valor).filter((n): n is number => n !== null);
    if (semFase.length) return semFase[0];
    const fases = lista.map(valor).filter((n): n is number => n !== null);
    if (!fases.length) return null;
    return somarFases ? fases.reduce((s, n) => s + n, 0) : Math.max(...fases);
  };
  const e = escolher(de("Energy.Active.Import.Register"), false);
  const p = escolher(de("Power.Active.Import"), true);
  const s = escolher(de("SoC"), false);
  return {
    energiaWh: e === null ? null : Math.round(e),
    potenciaW: p === null ? null : Math.max(0, Math.round(p)),
    soc: s === null ? null : Math.min(100, Math.max(0, Math.round(s))),
  };
}
