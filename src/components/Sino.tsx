"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ic } from "./Ic";

type Aviso = { id: number; tipo: string; titulo: string; texto: string; estacao_id: number | null; criado_em: string };

const ICONE: Record<string, [string, string]> = {
  offline: ["alert", "var(--red)"],
  falha: ["alert", "var(--red)"],
  recarga_longa: ["clock", "var(--amber)"],
};

// Avisos abertos (estação offline, falha). Atualiza a cada 15 s.
export function Sino() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    // Cancela a consulta ao trocar de tela (sem isso o navegador acusa erro de rede).
    const ctrl = new AbortController();
    const carregar = () =>
      fetch("/api/painel/avisos", { cache: "no-store", signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => vivo && d && setAvisos(d.avisos))
        .catch(() => {});
    carregar();
    const t = setInterval(carregar, 15_000);
    return () => {
      vivo = false;
      ctrl.abort();
      clearInterval(t);
    };
  }, []);

  return (
    <div className="sino-wrap">
      <button className="icon-btn" onClick={() => setAberto((a) => !a)} aria-label="Avisos" title="Avisos">
        <Ic n="bell" />
        {avisos.length > 0 && <span className="pip" />}
      </button>
      {aberto && (
        <div className="notif-pop">
          {avisos.length === 0 && <div className="n"><span style={{ color: "var(--g600)" }}><Ic n="check" /></span><div><b>Tudo certo</b><div className="muted" style={{ fontSize: 12.5 }}>Nenhum aviso aberto.</div></div></div>}
          {avisos.map((a) => {
            const [ic, cor] = ICONE[a.tipo] ?? ["bell", "var(--muted)"];
            const corpo = (
              <>
                <span style={{ color: cor }}><Ic n={ic} /></span>
                <div>
                  <b>{a.titulo}</b>
                  <div className="muted" style={{ fontSize: 12.5 }}>{a.texto}</div>
                </div>
              </>
            );
            return a.estacao_id ? (
              <Link key={a.id} className="n" href={`/painel/estacoes/${a.estacao_id}`} onClick={() => setAberto(false)} style={{ textDecoration: "none" }}>{corpo}</Link>
            ) : (
              <div key={a.id} className="n">{corpo}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
