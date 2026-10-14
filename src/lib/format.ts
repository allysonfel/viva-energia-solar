// Formatação de dinheiro, energia, potência e datas (horário de Brasília).
export const TZ = "America/Sao_Paulo";

export const brl = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// "1,89" ou "1.89" ou "2" → 189. null se inválido.
export function centavosDe(v: unknown): number | null {
  const s = String(v ?? "").trim().replace(/[R$\s]/g, "");
  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s.replace(",", ".")) * 100);
}

// Energia guardada em Wh. Mostra em kWh com 1 casa ("31,2 kWh").
export const kwh = (wh: number, casas = 1) =>
  (wh / 1000).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

// Potência guardada em W. Mostra em kW ("22 kW", "7,4 kW").
export const kw = (w: number) => (w / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export const num = (n: number) => n.toLocaleString("pt-BR");

export const dataBr = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: TZ });
export const horaBr = (d: Date | string) =>
  new Date(d).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const dataHoraBr = (d: Date | string) =>
  new Date(d).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// "hoje 14:02", "ontem 22:48" ou "12/10 09:10".
export function quando(d: Date | string): string {
  const dia = (x: Date) => x.toLocaleDateString("pt-BR", { timeZone: TZ });
  const dt = new Date(d);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86_400_000);
  if (dia(dt) === dia(hoje)) return `hoje ${horaBr(dt)}`;
  if (dia(dt) === dia(ontem)) return `ontem ${horaBr(dt)}`;
  return dataHoraBr(dt);
}

export function haQuanto(d: Date | string | null): string {
  if (!d) return "nunca";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${Math.max(s, 0)} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  return dataBr(d);
}

// Duração "38 min" ou "1h 52min".
export function duracao(ini: Date | string, fim?: Date | string | null): string {
  const min = Math.max(0, Math.round(((fim ? new Date(fim) : new Date()).getTime() - new Date(ini).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}min`;
}

export const iniciais = (n: string) =>
  n.split(" ").filter((x) => /^[A-Za-zÀ-ú]/.test(x)).map((x) => x[0]).slice(0, 2).join("").toUpperCase() || "?";

export const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Célula de CSV (separador ;). Começando com = + - @ ganha ' na frente: evita
// fórmula maliciosa quando a planilha abre no Excel.
export const celulaCsv = (v: unknown) => {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 16).replace("T", " ") : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s) && s !== "-") s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};
