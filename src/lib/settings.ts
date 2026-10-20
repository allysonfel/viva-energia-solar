// Configurações gerais, guardadas em configuracoes.dados (JSONB). Valores
// fora da faixa voltam para o padrão.
import { sql, ensureSchema } from "./db";

export type Settings = {
  empresa: string;
  // Minutos sem contato até a estação virar aviso de "offline" no sino.
  offlineMinutos: number;
  // Intervalo do Heartbeat pedido aos carregadores (segundos).
  heartbeatSeg: number;
  // Intervalo das leituras do medidor durante a recarga (segundos).
  leituraSeg: number;
  // Saldo mínimo na carteira para iniciar uma recarga pelo app.
  saldoMinimoCentavos: number;
  // WhatsApp do atendimento (só dígitos, com DDI), usado em Ajuda.
  suporteWhatsapp: string;
  suporteEmail: string;
  // Identificação legal mostrada na carteira e nas políticas (exigência do intermediador de pagamento).
  razaoSocial: string;
  cnpj: string;
  // Taxa média do gateway (Pix + cartão) em centésimos de %: 210 = 2,1%. Só para relatório.
  taxaPagamentoBp: number;
};

const PADRAO: Settings = { empresa: "Viva Energia", offlineMinutos: 5, heartbeatSeg: 60, leituraSeg: 15, saldoMinimoCentavos: 1000, suporteWhatsapp: "", suporteEmail: "", razaoSocial: "", cnpj: "", taxaPagamentoBp: 210 };

export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

const faixa = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : padrao;
};

export async function getSettings(): Promise<Settings> {
  await ensureSchema();
  const [row] = await sql<{ dados: Partial<Settings> }[]>`SELECT dados FROM configuracoes WHERE id = 1`;
  const d = row?.dados ?? {};
  return {
    empresa: typeof d.empresa === "string" && d.empresa.trim() ? d.empresa.trim().slice(0, 40) : PADRAO.empresa,
    offlineMinutos: faixa(d.offlineMinutos, 1, 120, PADRAO.offlineMinutos),
    heartbeatSeg: faixa(d.heartbeatSeg, 10, 3600, PADRAO.heartbeatSeg),
    leituraSeg: faixa(d.leituraSeg, 5, 600, PADRAO.leituraSeg),
    saldoMinimoCentavos: faixa(d.saldoMinimoCentavos, 100, 50000, PADRAO.saldoMinimoCentavos),
    taxaPagamentoBp: faixa(d.taxaPagamentoBp, 0, 1500, PADRAO.taxaPagamentoBp),
    suporteWhatsapp: typeof d.suporteWhatsapp === "string" && /^\d{12,13}$/.test(d.suporteWhatsapp) ? d.suporteWhatsapp : "",
    suporteEmail: typeof d.suporteEmail === "string" && EMAIL.test(d.suporteEmail) ? d.suporteEmail : "",
    razaoSocial: typeof d.razaoSocial === "string" ? d.razaoSocial.trim().slice(0, 100) : "",
    cnpj: typeof d.cnpj === "string" && /^\d{14}$/.test(d.cnpj) ? d.cnpj : "",
  };
}

export async function saveSettings(parcial: Partial<Settings>) {
  await sql`UPDATE configuracoes SET dados = dados || ${sql.json(parcial)} WHERE id = 1`;
}
