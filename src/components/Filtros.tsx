"use client";

import { useState } from "react";
import { PERIODOS, type Periodo } from "@/lib/periodo";

// Formulário de filtro (GET) que aplica sozinho ao trocar uma opção: quem
// muda o período ou a estação vê o número mudar na hora, sem procurar botão.
// Datas do período personalizado aplicam no botão (escolher a primeira data
// não recarrega a tela antes da segunda).
export function FormFiltro({ action, className, style, children }: { action: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <form
      action={action}
      className={className}
      style={style}
      onChange={(ev) => {
        const alvo = ev.target as unknown as HTMLInputElement | HTMLSelectElement;
        const form = ev.currentTarget;
        if (alvo.tagName === "SELECT" && alvo.name !== "p") return form.requestSubmit();
        if (alvo.name === "p" && alvo.value !== "personalizado") return form.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}

// Seletor de período com as datas do personalizado.
export function CampoPeriodo({ p, de, ate, opcoes }: { p: Periodo; de: string; ate: string; opcoes: readonly Periodo[] }) {
  const [atual, setAtual] = useState(p);
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  return (
    <>
      <select className="input" name="p" value={atual} onChange={(e) => setAtual(e.target.value as Periodo)} aria-label="Período">
        {opcoes.map((k) => <option key={k} value={k}>{PERIODOS[k]}</option>)}
      </select>
      {atual === "personalizado" && (
        <span className="row" style={{ gap: 6 }}>
          <input className="input" type="date" name="de" defaultValue={de} max={hoje} aria-label="De" required style={{ width: 150 }} />
          <span className="muted">até</span>
          <input className="input" type="date" name="ate" defaultValue={ate} max={hoje} aria-label="Até" required style={{ width: 150 }} />
          <button className="btn btn-dark btn-sm">Aplicar</button>
        </span>
      )}
    </>
  );
}
