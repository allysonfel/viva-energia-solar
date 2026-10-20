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

// Abas do painel que dependem de permissão. Visão geral e Minha conta são de
// todos; Equipe e Configurações, só do admin.
export const ABAS = {
  estacoes: "Estações",
  recargas: "Recargas",
  tarifas: "Tarifas",
  vouchers: "Vouchers",
  clientes: "Clientes",
  relatorios: "Relatórios",
  simulador: "Simulador",
} as const;
export type Aba = keyof typeof ABAS;
const TODAS = Object.keys(ABAS) as Aba[];
// Quem vê só as estações de um parceiro fica nas abas que filtram por
// estação: tarifas, vouchers, clientes e simulador são da rede inteira.
export const ABAS_COM_ESCOPO: Aba[] = ["estacoes", "recargas", "relatorios"];

// Abas que podem ser liberadas para alguém (admin vê tudo sempre).
export function abasPermitidas(perfil: Perfil, parceiroId: number | null): Aba[] {
  if (perfil === "admin") return TODAS;
  return perfil === "parceiro" || parceiroId ? ABAS_COM_ESCOPO : TODAS;
}

export type Usuario = {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  parceiro_id: number | null;
  parceiro_nome: string | null;
  abas: Aba[];
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
  const [u] = await sql<(Omit<Usuario, "abas"> & { abas: string[] | null })[]>`
    SELECT u.id, u.nome, u.email, u.perfil, u.parceiro_id, p.nome AS parceiro_nome, u.abas
    FROM usuarios u LEFT JOIN parceiros p ON p.id = u.parceiro_id
    WHERE u.id = ${data.uid} AND u.ativo AND u.sessao_versao = ${data.v}
  `;
  if (!u) return null;
  // Sem abas marcadas (cadastro antigo): todas as que o perfil permite.
  const permitidas = abasPermitidas(u.perfil, u.parceiro_id);
  const abas = u.perfil === "admin" || !u.abas ? permitidas : permitidas.filter((a) => u.abas!.includes(a));
  return { ...u, abas };
}

// Garante usuário logado (e, se pedido, com um dos perfis). Usar no início
// de toda página e server action do painel.
export async function requireUser(perfis?: Perfil[]): Promise<Usuario> {
  const u = await getUser();
  if (!u) redirect("/painel/entrar");
  if (perfis && !perfis.includes(u.perfil)) redirect("/painel?erro=permissao");
  return u;
}

// Garante usuário logado com acesso à aba (e, se pedido, um dos perfis).
export async function requireAba(aba: Aba, perfis?: Perfil[]): Promise<Usuario> {
  const u = await requireUser(perfis);
  if (!u.abas.includes(aba)) redirect("/painel?erro=permissao");
  return u;
}

// Quem está ligado a um parceiro (perfil parceiro ou operador do parceiro) só
// enxerga as estações dele; admin e operador da rede, todas (null).
export function parceiroDoEscopo(u: Usuario): number | null {
  return u.perfil === "admin" ? null : u.parceiro_id;
}

// Quem pode mandar comando para carregador.
export const podeOperar = (u: Usuario) => u.perfil === "admin" || u.perfil === "operador";
