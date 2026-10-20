import Link from "next/link";
import { requireUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { simuladorLigado } from "@/lib/ocpp/simulador";
import { TIPOS_CONECTOR } from "@/lib/ocpp/tipos";
import { listarTarifas, horarioDa } from "@/lib/tarifas";
import { FormEstacao } from "./FormEstacao";

export default async function NovaEstacao() {
  await requireUser(["admin"]);
  const [parceiros, tarifas] = await Promise.all([
    sql<{ id: number; nome: string }[]>`SELECT id, nome FROM parceiros ORDER BY nome`,
    listarTarifas(),
  ]);
  return (
    <div className="panel" style={{ maxWidth: 760 }}>
      <div className="panel-h"><h3>Dados da estação</h3><Link className="link" href="/painel/estacoes">Cancelar</Link></div>
      <div className="panel-b">
        <FormEstacao
          parceiros={parceiros.map((p) => ({ id: p.id, nome: p.nome }))}
          tarifas={tarifas.map((t) => ({ id: t.id, nome: t.nome, cor: t.cor, horario: horarioDa(t), preco: (t.preco_kwh_centavos / 100).toFixed(2).replace(".", ","), hora_inicio: t.hora_inicio, hora_fim: t.hora_fim }))}
          tipos={[...TIPOS_CONECTOR]}
          sim={simuladorLigado()}
        />
      </div>
    </div>
  );
}
