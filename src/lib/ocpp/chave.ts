// Chave no endereço OCPP (/ocpp/k-<chave>/<código>): é o jeito simples de
// configurar qualquer carregador (todos têm o campo de endereço). O hash serve
// para conferir na conexão; a cópia cifrada (AES-256-GCM com chave derivada
// do SESSION_SECRET) deixa o admin ver e copiar o endereço sempre que precisar.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export const hashChave = (chave: string) => createHash("sha256").update("ocpp-chave:" + chave).digest("hex");

// Fácil de digitar na tela do carregador: minúsculas e números, sem l, o, 0 e 1
// (26 caracteres de 32 opções: ~130 bits).
export function gerarChave(): string {
  const alfabeto = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(26), (b) => alfabeto[b % 32]).join("");
}

const segredo = () => createHash("sha256").update("ocpp-chave-cifra:" + (process.env.SESSION_SECRET ?? "")).digest();

export function cifrarChave(chave: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", segredo(), iv);
  const dados = Buffer.concat([c.update(chave, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dados]).toString("base64url");
}

export function decifrarChave(cifrada: string | null): string | null {
  if (!cifrada) return null;
  try {
    const b = Buffer.from(cifrada, "base64url");
    const d = createDecipheriv("aes-256-gcm", segredo(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
