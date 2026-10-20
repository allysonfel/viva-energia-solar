// SyncPay (api.syncpayments.com.br): Pix para crédito na carteira.
// Credenciais só no servidor (SYNCPAY_CLIENT_ID / SYNCPAY_CLIENT_SECRET). A
// chave tem só as permissões Venda e Consulta (sem Saque). A SyncPay exige o
// IP de saída cadastrado em "IPs Autorizados" (IP fixo do Railway).
import "server-only";

const BASE = "https://api.syncpayments.com.br/api/partner/v1";
const TIMEOUT = 15_000;

export type StatusSyncPay = "pending" | "completed" | "failed" | "refunded" | "med";
export type ClientePix = { nome: string; cpf: string | null; email: string; celular: string };

// O token vale 1 h e pedir de novo antes da hora dá 429: guarda em memória e
// renova 2 min antes de vencer. Pedidos simultâneos esperam o mesmo token.
let token: { valor: string; vence: number } | null = null;
let pedindo: Promise<string> | null = null;

function credenciais() {
  const id = process.env.SYNCPAY_CLIENT_ID?.trim();
  const segredo = process.env.SYNCPAY_CLIENT_SECRET?.trim();
  if (!id || !segredo) throw new Error("SYNCPAY_CLIENT_ID/SYNCPAY_CLIENT_SECRET não configurados");
  return { id, segredo };
}

async function pedir(caminho: string, init: RequestInit & { semToken?: boolean } = {}) {
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (!init.semToken) headers.Authorization = `Bearer ${await tokenAcesso()}`;
  const r = await fetch(BASE + caminho, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const corpo = await r.json().catch(() => null);
  // Detalhe do provedor só no log, sem credencial nem dado do cliente.
  if (!r.ok) throw new Error(`SyncPay ${init.method ?? "GET"} ${caminho.split("/").slice(0, 2).join("/")}: ${r.status} ${String(corpo?.message ?? "").slice(0, 120)}`);
  return corpo;
}

async function tokenAcesso(): Promise<string> {
  if (token && token.vence - 120_000 > Date.now()) return token.valor;
  pedindo ??= (async () => {
    try {
      const { id, segredo } = credenciais();
      const d = await pedir("/auth-token", { method: "POST", body: JSON.stringify({ client_id: id, client_secret: segredo }), semToken: true });
      if (typeof d?.access_token !== "string") throw new Error("SyncPay auth-token: resposta sem access_token");
      const vence = Date.parse(d.expires_at) || Date.now() + Number(d.expires_in ?? 3600) * 1000;
      token = { valor: d.access_token, vence };
      return token.valor;
    } finally {
      pedindo = null;
    }
  })();
  return pedindo;
}

export async function criarCobrancaPix(valorCentavos: number, descricao: string, cliente: ClientePix) {
  const d = await pedir("/cash-in", {
    method: "POST",
    body: JSON.stringify({
      amount: valorCentavos / 100,
      description: descricao.slice(0, 120),
      // Os dados do pagador são opcionais na SyncPay, mas vão completos ou não vão.
      client: cliente.cpf ? { name: cliente.nome, cpf: cliente.cpf, email: cliente.email, phone: cliente.celular } : undefined,
    }),
  });
  if (typeof d?.pix_code !== "string" || typeof d?.identifier !== "string") throw new Error("SyncPay cash-in: resposta sem pix_code/identifier");
  return { identificador: d.identifier as string, copiaECola: d.pix_code as string };
}

// Fonte da verdade para o webhook: status e valor consultados na SyncPay.
export async function consultarTransacao(identificador: string): Promise<{ status: StatusSyncPay; valorCentavos: number }> {
  const d = (await pedir(`/transaction/${encodeURIComponent(identificador)}`))?.data;
  if (!d || typeof d.status !== "string" || typeof d.amount !== "number") throw new Error("SyncPay transaction: resposta inesperada");
  return { status: d.status as StatusSyncPay, valorCentavos: Math.round(d.amount * 100) };
}
