import { requireMotorista } from "@/lib/motorista";
import { recargaEmAndamento } from "@/lib/app";
import { sql } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { temaDoMotorista } from "@/lib/tema";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const m = await requireMotorista();
  const r = await recargaEmAndamento(m.id);
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM avisos_motorista WHERE motorista_id = ${m.id} AND NOT lido`;
  const tema = await temaDoMotorista();
  return (
    <AppShell tema={tema} nome={m.nome} recargaInicial={r?.id ?? null} naoLidosInicial={n}>
      {children}
    </AppShell>
  );
}
