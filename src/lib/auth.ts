// Senhas (scrypt com sal) e tokens de sessão assinados (HMAC-SHA256).
// Nada de biblioteca externa: só o módulo crypto do Node.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

export const SENHA_MINIMA = 10;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET não configurada (mínimo de 32 caracteres).");
  return s;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createToken(payload: Record<string, unknown>, hours: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + hours * 3_600_000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readToken<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

// Identificador aleatório e não sequencial (link de pagamento, chave de
// idempotência).
export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}
