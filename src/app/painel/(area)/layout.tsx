import { redirect } from "next/navigation";
import { requireUser, endSession, getUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { simuladorLigado } from "@/lib/ocpp/simulador";
import { Shell } from "@/components/Shell";

async function sair() {
  "use server";
  const u = await getUser();
  if (u) await audit(`usuario:${u.id}`, "logout");
  await endSession();
  redirect("/painel/entrar");
}

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const s = await getSettings();
  return (
    <Shell user={{ nome: user.nome, perfil: user.perfil, parceiro: user.parceiro_nome }} empresa={s.empresa} simulador={simuladorLigado()} sair={sair}>
      {children}
    </Shell>
  );
}
