// Aparência do app do motorista: "auto" segue o celular; "claro"/"escuro"
// forçam. Fica num cookie do aparelho (não é dado pessoal).
import { cookies } from "next/headers";

export type Tema = "auto" | "claro" | "escuro";
export const COOKIE_TEMA = "viva_tema";

// Painel da operação: sempre começa claro; o escuro é pelo botão sol/lua.
export const COOKIE_TEMA_PAINEL = "viva_painel_tema";

export async function temaDoPainel(): Promise<"claro" | "escuro"> {
  return (await cookies()).get(COOKIE_TEMA_PAINEL)?.value === "escuro" ? "escuro" : "claro";
}

export async function temaDoMotorista(): Promise<Tema> {
  const v = (await cookies()).get(COOKIE_TEMA)?.value;
  return v === "claro" || v === "escuro" ? v : "auto";
}
