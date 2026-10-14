import { requireMotorista } from "@/lib/motorista";
import { recargaEmAndamento } from "@/lib/app";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const m = await requireMotorista();
  const r = await recargaEmAndamento(m.id);
  return (
    <AppShell nome={m.nome} recargaInicial={r?.id ?? null}>
      {children}
    </AppShell>
  );
}
