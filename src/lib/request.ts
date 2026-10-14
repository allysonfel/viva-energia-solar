import { headers } from "next/headers";

// IP do cliente vindo do proxy do Railway (primeiro IP do x-forwarded-for).
// Serve como dica para limite de tentativas e auditoria, nunca como única
// prova de identidade.
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || h.get("x-real-ip") || "desconhecido").slice(0, 64);
}
