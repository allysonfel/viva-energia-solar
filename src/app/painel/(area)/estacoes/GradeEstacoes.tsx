"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { brl, kwh, kw } from "@/lib/format";
import type { EstacaoVista } from "@/lib/estacoes";

// Grade das estações, atualizada a cada 4 s.
export function GradeEstacoes({ inicial }: { inicial: EstacaoVista[] }) {
  const [lista, setLista] = useState(inicial);
  const [em, setEm] = useState(() => Date.now());
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    let vivo = true;
    const t = setInterval(() => {
      fetch("/api/painel/estacoes", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!vivo || !d) return;
          setLista(d.estacoes);
          setEm(Date.now());
        })
        .catch(() => {});
    }, 4_000);
    const r = setInterval(() => setAgora(Date.now()), 1_000);
    return () => {
      vivo = false;
      clearInterval(t);
      clearInterval(r);
    };
  }, []);

  const conta = (s: string) => lista.filter((e) => e.situacao === s).length;
  const ha = Math.max(0, Math.round((agora - em) / 1000));

  if (!lista.length)
    return (
      <div className="panel">
        <div className="vazio">
          <b>Nenhuma estação cadastrada</b>
          Cadastre a primeira estação para ligar o carregador à central.
        </div>
      </div>
    );

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <Badge s="disponivel" texto={`${conta("disponivel")} disponíveis`} />
        <Badge s="em_uso" texto={`${conta("em_uso")} em uso`} />
        <Badge s="offline" texto={`${conta("offline")} offline`} />
        {conta("falha") > 0 && <Badge s="falha" texto={`${conta("falha")} com falha`} />}
        {conta("indisponivel") > 0 && <Badge s="indisponivel" texto={`${conta("indisponivel")} indisponíveis`} />}
        <span className="muted" style={{ fontSize: 12.5 }}>Protocolo OCPP 1.6J · atualizado há {ha} s</span>
      </div>
      <div className="stations-grid">
        {lista.map((e) => (
          <Link key={e.id} className="st-card" href={`/painel/estacoes/${e.id}`}>
            <div className="top">
              <div>
                <div className="id">{e.codigo}{e.simulada ? " · simulada" : ""}</div>
                <h4>{e.nome}</h4>
                <div className="muted" style={{ fontSize: 12.5 }}>{[e.bairro, e.parceiro ?? "Própria"].filter(Boolean).join(" · ")}</div>
              </div>
              <Badge s={e.situacao} />
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {e.conectores.length === 0 && <span className="badge b-neutral">Sem conectores</span>}
              {e.conectores.map((c) => (
                <span key={c.numero} className="badge b-neutral">
                  <span className={`dot st-${c.situacao}`} />
                  {c.tipo} {kw(c.potencia_w)} kW
                </span>
              ))}
            </div>
            <div className="meta">
              <div><small>Receita no mês</small><b>{brl(e.mes_centavos)}</b></div>
              <div><small>Energia</small><b>{kwh(e.mes_wh, 0)} kWh</b></div>
              <div><small>Ocupação</small><b>{e.ocupacao}%</b></div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
