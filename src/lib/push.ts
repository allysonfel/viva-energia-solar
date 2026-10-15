// Web Push (avisos no celular e no navegador, mesmo com o painel fechado),
// sem biblioteca: criptografia aes128gcm (RFC 8291) e assinatura VAPID
// (RFC 8292) com o módulo crypto. Chaves em VAPID_PUBLIC_KEY e
// VAPID_PRIVATE_KEY (base64url), geradas uma vez com scripts/gerar-vapid.mjs.
// Sem as chaves, o sino do painel continua funcionando, só sem push.
import "server-only";
import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "crypto";

export type Inscricao = { endpoint: string; p256dh: string; auth: string };

const de64 = (s: string) => Buffer.from(s, "base64url");
const hmac = (k: Buffer, d: Buffer) => createHmac("sha256", k).update(d).digest();

// Chave pública que o navegador usa para se inscrever (null = push desligado).
export function vapidPublica(): string | null {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const priv = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  return de64(pub).length === 65 && de64(priv).length === 32 ? pub : null;
}

// O endereço de entrega vem do navegador. Só os serviços de push conhecidos
// (Google, Mozilla, Microsoft, Apple): o servidor nunca chama outro lugar.
const SERVICOS = [/^fcm\.googleapis\.com$/, /^[a-z0-9.-]+\.push\.services\.mozilla\.com$/, /^[a-z0-9.-]+\.notify\.windows\.com$/, /^([a-z0-9-]+\.)?push\.apple\.com$/];

export function inscricaoValida(i: Inscricao): boolean {
  try {
    const u = new URL(i.endpoint);
    if (u.protocol !== "https:" || u.port || i.endpoint.length > 1000 || !SERVICOS.some((r) => r.test(u.hostname))) return false;
    const chave = de64(i.p256dh);
    return chave.length === 65 && chave[0] === 4 && de64(i.auth).length === 16;
  } catch {
    return false;
  }
}

// RFC 8291: chave efêmera ECDH + segredo do navegador viram a chave AES do
// conteúdo. Um único registro (delimitador 0x02).
function cifrar(i: Inscricao, conteudo: Buffer): Buffer {
  const navegador = de64(i.p256dh);
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const servidor = ecdh.getPublicKey();
  const prkChave = hmac(de64(i.auth), ecdh.computeSecret(navegador));
  const ikm = hmac(prkChave, Buffer.concat([Buffer.from("WebPush: info\0"), navegador, servidor, Buffer.from([1])]));
  const sal = randomBytes(16);
  const prk = hmac(sal, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const c = createCipheriv("aes-128-gcm", cek, nonce);
  const cifrado = Buffer.concat([c.update(Buffer.concat([conteudo, Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([sal, rs, Buffer.from([servidor.length]), servidor, cifrado]);
}

// RFC 8292: JWT ES256 assinado com a chave privada do servidor, válido 12 h.
function vapid(endpoint: string): string {
  const pub = process.env.VAPID_PUBLIC_KEY!.trim();
  const p = de64(pub);
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: process.env.VAPID_PRIVATE_KEY!.trim(), x: p.subarray(1, 33).toString("base64url"), y: p.subarray(33, 65).toString("base64url") },
    format: "jwk",
  });
  const sub = process.env.VAPID_SUBJECT?.trim() || process.env.APP_URL || "mailto:suporte@logoscompany.io";
  const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const dados = `${parte({ typ: "JWT", alg: "ES256" })}.${parte({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })}`;
  const assinatura = sign("sha256", Buffer.from(dados), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `vapid t=${dados}.${assinatura}, k=${pub}`;
}

// "expirada": o navegador cancelou a inscrição (apagar do banco).
export async function enviarPush(i: Inscricao, dados: object, ttl = 3600): Promise<"ok" | "expirada" | "falhou"> {
  if (!vapidPublica() || !inscricaoValida(i)) return "falhou";
  try {
    const r = await fetch(i.endpoint, {
      method: "POST",
      headers: { Authorization: vapid(i.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl), Urgency: "high" },
      body: new Uint8Array(cifrar(i, Buffer.from(JSON.stringify(dados)))),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status === 404 || r.status === 410) return "expirada";
    if (!r.ok) console.error("[push] serviço respondeu", r.status);
    return r.ok ? "ok" : "falhou";
  } catch (err) {
    console.error("[push] falha", err instanceof Error ? err.message : err);
    return "falhou";
  }
}
