// Camada única de pagamentos (crédito na carteira por Pix ou cartão). O
// provedor é escolhido por PAGAMENTOS_PROVEDOR:
// - "simulado": nada sai do sistema, o Pix não é de verdade e o cartão nunca
//   tem o número enviado ao servidor;
// - "syncpay": Pix de verdade (lib/syncpay), confirmado pelo webhook
//   /api/webhooks/syncpay, que chama confirmarPagamento (lib/carteira).
//   Cartão fica de fora (a SyncPay retém parte das vendas no cartão).
import "server-only";
import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { criarCobrancaPix, type ClientePix } from "./syncpay";

export type Pix = { provedorId: string; copiaECola: string; expiraEm: Date };
export type ResultadoCartao = { provedorId: string; aprovado: boolean; motivo?: string };

export type Provedor = {
  nome: string;
  simulado: boolean;
  cartao: boolean;
  criarPix(valorCentavos: number, ref: string, cliente: ClientePix): Promise<Pix>;
  // token = o que o formulário do gateway devolve (no simulado: final do cartão).
  cobrarCartao(valorCentavos: number, token: { final: string; bandeira: string }, ref: string): Promise<ResultadoCartao>;
};

// BR Code (Pix copia e cola) de exemplo, com CRC16 válido, para a tela
// ficar igual à de produção. Não é cobrança de verdade.
function brCode(valorCentavos: number, txid: string) {
  const campo = (id: string, v: string) => id + String(v.length).padStart(2, "0") + v;
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", "simulado@vivaenergia.local");
  const corpo =
    campo("00", "01") + campo("26", conta) + campo("52", "0000") + campo("53", "986") +
    campo("54", (valorCentavos / 100).toFixed(2)) + campo("58", "BR") + campo("59", "VIVA ENERGIA SIMULADO") +
    campo("60", "JOAO PESSOA") + campo("62", campo("05", txid)) + "6304";
  let crc = 0xffff;
  for (const ch of corpo) {
    crc ^= ch.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return corpo + crc.toString(16).toUpperCase().padStart(4, "0");
}

const simulado: Provedor = {
  nome: "simulado",
  simulado: true,
  cartao: true,
  async criarPix(valor) {
    const id = "SIM" + randomBytes(10).toString("hex").toUpperCase();
    return { provedorId: id, copiaECola: brCode(valor, id.slice(0, 25)), expiraEm: new Date(Date.now() + 30 * 60_000) };
  },
  async cobrarCartao(_valor, token) {
    // Cartão terminado em 0000 simula recusa (para testar a tela de erro).
    const id = "SIMC" + randomBytes(10).toString("hex").toUpperCase();
    return token.final === "0000" ? { provedorId: id, aprovado: false, motivo: "Cartão recusado pelo emissor (teste)" } : { provedorId: id, aprovado: true };
  },
};

const syncpay: Provedor = {
  nome: "syncpay",
  simulado: false,
  cartao: false,
  async criarPix(valor, ref, cliente) {
    const c = await criarCobrancaPix(valor, `Crédito Viva Energia (${ref})`, cliente);
    // A tela mostra 30 min; se o banco confirmar depois, o crédito entra igual.
    return { provedorId: c.identificador, copiaECola: c.copiaECola, expiraEm: new Date(Date.now() + 30 * 60_000) };
  },
  async cobrarCartao() {
    return { provedorId: "", aprovado: false, motivo: "Pagamento com cartão indisponível. Use o Pix." };
  },
};

// Em produção o simulado fica BLOQUEADO (crédito de graça na carteira), a não
// ser com PAGAMENTOS_SIMULADO_EM_PRODUCAO=sim (demonstração/homologação).
// Olha o provedor que de fato vai cobrar (nome desconhecido cai no simulado).
export function pagamentosLiberados(): boolean {
  if (!provedorPagamentos().simulado) return true;
  return process.env.NODE_ENV !== "production" || process.env.PAGAMENTOS_SIMULADO_EM_PRODUCAO === "sim";
}

export function provedorPagamentos(): Provedor {
  const nome = process.env.PAGAMENTOS_PROVEDOR?.trim() || "simulado";
  if (nome === "syncpay") return syncpay;
  if (nome !== "simulado") console.warn(`[pagamentos] provedor "${nome}" desconhecido; usando o simulado`);
  return simulado;
}

export const qrPix = (copiaECola: string) => QRCode.toDataURL(copiaECola, { margin: 1, width: 300, color: { dark: "#062A1E", light: "#FFFFFF" } });
