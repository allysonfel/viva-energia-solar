"use client";

import { useState } from "react";
import Link from "next/link";

export type OpcaoTarifa = { id: number; nome: string; cor: string; horario: string; preco: string; hora_inicio: number; hora_fim: number };

const horas = (t: OpcaoTarifa) => {
  const n = t.hora_fim > t.hora_inicio ? t.hora_fim - t.hora_inicio : 24 - t.hora_inicio + t.hora_fim;
  return Array.from({ length: n }, (_, i) => (t.hora_inicio + i) % 24);
};

// Tarifas por horário da estação. Avisa na hora se duas marcadas dividem o
// mesmo horário (o servidor recusa do mesmo jeito).
export function EscolherTarifas({ tarifas, marcadas: iniciais = [] }: { tarifas: OpcaoTarifa[]; marcadas?: number[] }) {
  const [marcadas, setMarcadas] = useState<number[]>(iniciais);
  const escolhidas = tarifas.filter((t) => marcadas.includes(t.id));
  const conflito = escolhidas.find((a, i) => escolhidas.slice(i + 1).some((b) => horas(b).some((h) => horas(a).includes(h))));

  if (!tarifas.length) {
    return (
      <p className="muted" style={{ fontSize: 12.5 }}>
        Nenhuma tarifa por horário criada. A estação cobra o preço acima o dia todo. <Link className="link" href="/painel/tarifas?nova=1">Criar tarifa</Link>
      </p>
    );
  }
  return (
    <>
      <div className="tarifas-op">
        {tarifas.map((t) => (
          <label key={t.id}>
            <input type="checkbox" name="tarifa" value={t.id} checked={marcadas.includes(t.id)}
              onChange={(e) => setMarcadas(e.target.checked ? [...marcadas, t.id] : marcadas.filter((x) => x !== t.id))} />
            <span className="dot" style={{ background: t.cor }} />
            <b>{t.nome}</b>
            <span className="muted mono" style={{ fontSize: 12.5 }}>{t.horario}</span>
            <b className="mono" style={{ marginLeft: "auto" }}>R$ {t.preco}</b>
          </label>
        ))}
      </div>
      {conflito && <div className="aviso erro" style={{ marginTop: 8 }}>&quot;{conflito.nome}&quot; divide horário com outra tarifa marcada. Deixe só uma para cada horário.</div>}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Nos horários sem tarifa marcada vale o preço por kWh da estação.</p>
    </>
  );
}
