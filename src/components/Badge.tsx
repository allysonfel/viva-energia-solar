import { SITUACAO_NOME, type Situacao } from "@/lib/ocpp/tipos";

export function Badge({ s, texto }: { s: Situacao; texto?: string }) {
  return (
    <span className={`badge b-${s}`}>
      <span className={`dot st-${s}`} />
      {texto ?? SITUACAO_NOME[s]}
    </span>
  );
}

const RECARGA: Record<string, [string, string]> = {
  em_andamento: ["b-blue", "em andamento"],
  concluida: ["b-disponivel", "concluída"],
  interrompida: ["b-offline", "interrompida"],
  recusada: ["b-neutral", "recusada"],
};

export function BadgeRecarga({ status }: { status: string }) {
  const [c, t] = RECARGA[status] ?? ["b-neutral", status];
  return <span className={`badge ${c}`}>{t}</span>;
}
