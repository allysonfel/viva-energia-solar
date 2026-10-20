// Aparência do app do motorista: "auto" segue o celular; "claro"/"escuro"
// forçam. Fica num cookie do aparelho (não é dado pessoal).
import { cookies } from "next/headers";

export type Tema = "auto" | "claro" | "escuro";
export const COOKIE_TEMA = "viva_tema";

export async function temaDoMotorista(): Promise<Tema> {
  const v = (await cookies()).get(COOKIE_TEMA)?.value;
  return v === "claro" || v === "escuro" ? v : "auto";
}
