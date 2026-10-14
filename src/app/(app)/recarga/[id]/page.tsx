import { notFound, redirect } from "next/navigation";
import { requireMotorista } from "@/lib/motorista";
import { recargaDoMotorista } from "@/lib/app";
import { AoVivo } from "./AoVivo";

export default async function Recarga({ params }: { params: Promise<{ id: string }> }) {
  const m = await requireMotorista();
  const r = await recargaDoMotorista(Number((await params).id), m.id);
  if (!r) notFound();
  if (r.status !== "em_andamento") redirect(`/recibo/${r.id}`);
  return <AoVivo inicial={r} />;
}
