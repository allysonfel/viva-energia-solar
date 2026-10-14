// Sessão da equipe do painel. O proxy só redireciona quem não tem cookie; a
// checagem de verdade (assinatura, validade, usuário ativo, versão da sessão,
// perfil) é feita aqui, em toda página, server action e rota.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql, ensureSchema } from "./db";
import { createToken, readToken } from "./auth";

export const SESSION_COOKIE = "viva_equipe";
const HORAS = 12;

export type Perfil = "admin" | "operador" | "parceiro";
export const PERFIL_NOME: Record<Perfil, string> = { admin: "Administrador", operador: "Operador", parceiro: "Parceiro" };

export type Usuario = {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  parceiro_id: number | null;
  parceiro_nome: string | null;
};

export async function startSession(id: number, versao: number, persistente = true) {
  (await cookies()).set(SESSION_COOKIE, createToken({ uid: id, v: versao, t: "equipe" }, HORAS), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(persistente ? { maxAge: HORAS * 3600 } : {}),
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getUser(): Promise<Usuario | null> {
  const data = readToken<{ uid: number; v: number; t: string }>((await cookies()).get(SESSION_COOKIE)?.value);
  if (!data || data.t !== "equipe") return null;
  await ensureSchema();
  const [u] = await sql<Usuario[]>`
    SELECT u.id, u.nome, u.email, u.perfil, u.parceiro_id, p.nome AS parceiro_nome
    FROM usuarios u LEFT JOIN parceiros p ON p.id = u.parceiro_id
    WHERE u.id = ${data.uid} AND u.ativo AND u.sessao_versao = ${data.v}
  `;
  return u ?? null;
}

// Garante usuário logado (e, se pedido, com um dos perfis). Usar no início
// de toda página e server action do painel.
export async function requireUser(perfis?: Perfil[]): Promise<Usuario> {
  const u = await getUser();
  if (!u) redirect("/painel/entrar");
  if (perfis && !perfis.includes(u.perfil)) redirect("/painel?erro=permissao");
  return u;
}

// Parceiro só enxerga as estações dele; admin e operador, todas (null).
export function parceiroDoEscopo(u: Usuario): number | null {
  return u.perfil === "parceiro" ? u.parceiro_id : null;
}

// Quem pode mandar comando para carregador.
export const podeOperar = (u: Usuario) => u.perfil === "admin" || u.perfil === "operador";
