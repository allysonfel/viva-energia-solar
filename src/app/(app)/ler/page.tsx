import { redirect } from "next/navigation";
import { requireMotorista } from "@/lib/motorista";
import { recargaEmAndamento } from "@/lib/app";
import { Leitor } from "./Leitor";

export default async function Ler() {
  const m = await requireMotorista();
  const r = await recargaEmAndamento(m.id);
  if (r) redirect(`/recarga/${r.id}`);
  return <Leitor />;
}
