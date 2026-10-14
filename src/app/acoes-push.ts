"use server";

// Inscrição de push do aparelho: do motorista (app) ou da equipe (painel).
// Quem chama precisa estar logado; o dono vem da sessão, nunca do navegador.
import { getMotorista } from "@/lib/motorista";
import { getUser } from "@/lib/session";
import { salvarInscricao, versaoDe, type InscricaoBruta } from "@/lib/inscricoes";
import { audit } from "@/lib/audit";

export async function inscreverPushApp(s: InscricaoBruta): Promise<boolean> {
  const m = await getMotorista();
  if (!m) return false;
  const ok = await salvarInscricao("motorista", m.id, await versaoDe("motorista", m.id), s);
  if (ok) await audit(`motorista:${m.id}`, "push_ativado");
  return ok;
}

export async function inscreverPushEquipe(s: InscricaoBruta): Promise<boolean> {
  const u = await getUser();
  if (!u) return false;
  const ok = await salvarInscricao("equipe", u.id, await versaoDe("equipe", u.id), s);
  if (ok) await audit(`usuario:${u.id}`, "push_ativado");
  return ok;
}
