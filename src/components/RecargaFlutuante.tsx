"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ic } from "./Ic";
import { ConfirmarEncerrar } from "./ConfirmarEncerrar";
import { brl, kwh, kw } from "@/lib/format";
import type { RecargaApp } from "@/lib/app";
import { pararRecargaApp, type Resposta } from "@/app/(app)/acoes";

const dois = (n: number) => String(n).padStart(2, "0");

// Botão azul flutuante (pedido do cliente): aparece em todas as telas com as
// abas enquanto há recarga em andamento. Ao tocar, mostra o status ao vivo e
// permite encerrar sem sair da tela.
export function RecargaFlutuante({ id }: { id: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const fechar = () => {
    if (parando) return;
    setAberto(false);
    setConfirmar(false);
  };
  const [r, setR] = useState<RecargaApp | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [res, parar, parando] = useActionState<Resposta, FormData>(pararRecargaApp, null);

  // Com a folha aberta: dados a cada 3 s e relógio a cada 1 s.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    const carregar = () =>
      fetch(`/api/app/recarga/${id}`, { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .then((d) => {
          if (!vivo || !d?.recarga) return;
          setR(d.recarga);
          if (d.recarga.status !== "em_andamento") router.push(`/recibo/${id}`);
        })
        .catch(() => {});
    carregar();
    const t = setInterval(carregar, 3_000);
    const rel = setInterval(() => setAgora(Date.now()), 1_000);
    return () => {
      vivo = false;
      clearInterval(t);
      clearInterval(rel);
    };
  }, [aberto, id, router]);

  const seg = r ? Math.max(0, Math.floor((agora - new Date(r.inicio).getTime()) / 1000)) : 0;
  const tempo = seg >= 3600 ? `${Math.floor(seg / 3600)}:${dois(Math.floor((seg % 3600) / 60))}:${dois(seg % 60)}` : `${dois(Math.floor(seg / 60))}:${dois(seg % 60)}`;
  const pct = r ? (r.soc ?? Math.min(100, Math.round((r.energia_wh / 60_000) * 100))) : 0;

  return (
    <>
      <button className="fab-recarga" onClick={() => setAberto(true)} aria-label="Ver recarga em andamento">
        <span className="orbita" aria-hidden="true" />
        <Ic n="bolt" />
      </button>
      {aberto && (
        <>
          <div className="sheet-bg" onClick={fechar} />
          <div className="sheet">
            <div className="grab" />
            {confirmar && r ? (
              <ConfirmarEncerrar r={r} parar={parar} parando={parando} res={res} onCancelar={() => setConfirmar(false)} />
            ) : (
            <div style={{ padding: "8px 18px 20px" }}>
              <div className="between" style={{ marginBottom: 4 }}>
                <span className="badge b-blue"><span className="pulse" style={{ width: 8, height: 8 }} />Recarga em andamento</span>
                <button className="icon-btn" onClick={fechar} aria-label="Fechar"><Ic n="close" /></button>
              </div>
              {!r ? (
                <div className="muted" style={{ padding: "18px 0" }}>Carregando...</div>
              ) : (
                <>
                  <h3 style={{ fontSize: 20, fontWeight: 800, margin: "8px 0 2px" }}>{r.estacao}</h3>
                  <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Conector {r.conector_numero}{r.conector ? ` · ${r.conector}` : ""}</div>
                  <div className="box" style={{ marginTop: 0 }}>
                    <div className="between" style={{ marginBottom: 8 }}>
                      <b>{r.parada_solicitada ? "Saldo acabando, encerrando" : r.potencia_w > 0 ? "Carregando" : "Aguardando o carro"}</b>
                      <b className="mono">{r.soc !== null ? `${r.soc}%` : `${kwh(r.energia_wh)} kWh`}</b>
                    </div>
                    <div className="barra-recarga"><i style={{ width: `${pct}%` }} /></div>
                  </div>
                  <div className="kv" style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)", marginBottom: 14 }}>
                    <div><small>Energia</small><b>{kwh(r.energia_wh)} kWh</b></div>
                    <div><small>Potência</small><b>{kw(r.potencia_w)} kW</b></div>
                    <div><small>Tempo</small><b>{tempo}</b></div>
                  </div>
                  <div className="between" style={{ marginBottom: 16 }}>
                    <span className="muted">Valor até agora</span>
                    <b className="mono" style={{ fontSize: 20 }}>{brl(r.valor_centavos)}</b>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Link className="btn btn-ghost" href={`/recarga/${id}`} onClick={() => setAberto(false)}>Ver detalhes</Link>
                    <button className="btn btn-danger btn-block" onClick={() => setConfirmar(true)}><Ic n="stop" />Encerrar</button>
                  </div>
                </>
              )}
            </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
