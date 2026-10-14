// Sessão do motorista (app). Separada da equipe: cookie próprio, validade
// longa (30 dias, é app de celular), e a mesma checagem a cada requisição:
// assinatura, validade, conta ativa e versão da sessão.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql, ensureSchema } from "./db";
import { createToken, readToken } from "./auth";

export const COOKIE_MOTORISTA = "viva_motorista";
const DIAS = 30;

export type Motorista = {
  id: number;
  nome: string;
  email: string;
  cpf: string;
  celular: string;
  veiculo: string;
  placa: string;
  conectores: string[];
  id_tag: string;
  saldo_centavos: number;
  avisos_recarga: boolean;
  aceita_promocoes: boolean;
};

export async function iniciarSessaoMotorista(id: number, versao: number) {
  (await cookies()).set(COOKIE_MOTORISTA, createToken({ mid: id, v: versao, t: "motorista" }, DIAS * 24), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DIAS * 86_400,
  });
}

export async function encerrarSessaoMotorista() {
  (await cookies()).delete(COOKIE_MOTORISTA);
}

export async function getMotorista(): Promise<Motorista | null> {
  const d = readToken<{ mid: number; v: number; t: string }>((await cookies()).get(COOKIE_MOTORISTA)?.value);
  if (!d || d.t !== "motorista") return null;
  await ensureSchema();
  const [m] = await sql<Motorista[]>`
    SELECT id, nome, email, cpf, celular, veiculo, placa, conectores, id_tag, saldo_centavos, avisos_recarga, aceita_promocoes
    FROM motoristas WHERE id = ${d.mid} AND ativo AND sessao_versao = ${d.v}`;
  return m ?? null;
}

export async function requireMotorista(): Promise<Motorista> {
  const m = await getMotorista();
  if (!m) redirect("/entrar");
  return m;
}

// Só caminhos internos do app (nada de "?voltar=https://...").
export function destinoSeguro(v: unknown): string {
  const s = String(v ?? "");
  return /^\/(?!\/)[A-Za-z0-9/_\-?=&.%]*$/.test(s) && !s.startsWith("/painel") ? s : "/";
}
