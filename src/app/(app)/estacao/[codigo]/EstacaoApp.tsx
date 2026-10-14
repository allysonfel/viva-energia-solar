"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Ic } from "@/components/Ic";
import { brl, kw } from "@/lib/format";
import type { EstacaoApp as Est } from "@/lib/app";
import { iniciarRecargaApp, type Resposta } from "../../acoes";

export function EstacaoApp({ e, conectorInicial, saldo, saldoMinimo, meusConectores }: {
  e: Est;
  conectorInicial: number | null;
  saldo: number;
  saldoMinimo: number;
  meusConectores: string[];
}) {
  const router = useRouter();
  const livres = e.conectores.filter((c) => c.situacao === "disponivel");
  const [con, setCon] = useState<number | null>(
    conectorInicial && livres.some((c) => c.numero === conectorInicial) ? conectorInicial : livres[0]?.numero ?? null,
  );
  const [confirmar, setConfirmar] = useState(false);
  const [r, enviar, enviando] = useActionState<Resposta, FormData>(iniciarRecargaApp, null);
  const [esperando, setEsperando] = useState(0);

  // Depois do pedido aceito, espera o carregador abrir a transação (até 2 min).
  useEffect(() => {
    if (!r?.ok) return;
    setEsperando(1);
    const ini = Date.now();
    const t = setInterval(() => {
      fetch("/api/app/recarga-atual", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .then((d) => {
          if (d?.id) {
            clearInterval(t);
            router.push(`/recarga/${d.id}`);
          } else if (Date.now() - ini > 120_000) {
            clearInterval(t);
            setEsperando(-1);
          }
        })
        .catch(() => {});
    }, 2_000);
    return () => clearInterval(t);
  }, [r, router]);

  const c = e.conectores.find((x) => x.numero === con);
  const off = e.situacao === "offline" || e.situacao === "indisponivel" || e.situacao === "falha";
  const maxKw = Math.max(0, ...e.conectores.map((x) => x.potencia_w));
  const estimativa = Math.round(30 * e.preco_kwh_centavos);
  const rota = e.lat !== null && e.lng !== null ? `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}` : null;

  if (esperando)
    return (
      <div className="sec-pad" style={{ textAlign: "center", paddingTop: 60 }}>
        {esperando > 0 ? (
          <>
            <div className="pulse" style={{ margin: "0 auto 18px" }} />
            <h3 style={{ fontSize: 20, fontWeight: 800 }}>Liberando o carregador...</h3>
            <p className="muted" style={{ margin: "8px 0 20px" }}>Mantenha o cabo conectado ao carro. A recarga começa em alguns segundos.</p>
          </>
        ) : (
          <>
            <h3 style={{ fontSize: 20, fontWeight: 800 }}>A recarga não começou</h3>
            <p className="muted" style={{ margin: "8px 0 20px" }}>Confira se o cabo está bem encaixado no carro e tente de novo. Nada foi cobrado.</p>
            <button className="btn btn-volt btn-block" onClick={() => { setEsperando(0); setConfirmar(false); }}>Tentar de novo</button>
          </>
        )}
      </div>
    );

  return (
    <div className="estacao-pg">
      <div className="st-head">
        <div className="between" style={{ paddingTop: 12 }}>
          <Link className="link row" href="/" style={{ gap: 4 }}><Ic n="back" />Mapa</Link>
          <Badge s={e.situacao} />
        </div>
        <span className="mono muted" style={{ fontSize: 12 }}>{e.codigo}</span>
        <h3>{e.nome}</h3>
        <div className="addr">{[e.endereco, e.bairro, e.cidade].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="kv">
        <div><small>Tarifa agora</small><b>{brl(e.preco_kwh_centavos)}</b></div>
        <div><small>Potência máx.</small><b>{kw(maxKw)} kW</b></div>
        <div><small>Conectores</small><b>{livres.length} de {e.conectores.length} livres</b></div>
      </div>

      {!confirmar ? (
        <div style={{ padding: "16px 18px" }}>
          {off ? (
            <div className="box" style={{ background: "var(--red-bg)", borderColor: "#F2C4C7" }}>
              <div className="row" style={{ color: "var(--red)", fontWeight: 800 }}><Ic n="alert" />Estação temporariamente indisponível</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>A equipe técnica já foi avisada. Veja outras estações no mapa.</div>
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Escolha o conector</div>
              {e.conectores.map((x) => {
                const dis = x.situacao !== "disponivel";
                const compativel = !meusConectores.length || meusConectores.includes(x.tipo);
                return (
                  <button key={x.numero} className={`conn ${con === x.numero ? "on" : ""} ${dis ? "dis" : ""}`} disabled={dis} onClick={() => setCon(x.numero)}>
                    <span className="ic"><Ic n="plug" /></span>
                    <span style={{ flex: 1 }}>
                      <div className="t">Conector {x.numero} · {x.tipo}</div>
                      <div className="m">Até {kw(x.potencia_w)} kW · {x.potencia_w >= 40_000 ? "Corrente contínua" : "Corrente alternada"}{!compativel ? " · não é o do seu carro" : ""}</div>
                    </span>
                    <Badge s={x.situacao} />
                  </button>
                );
              })}
            </>
          )}
          <div style={{ display: "grid", gridTemplateColumns: rota ? "auto 1fr" : "1fr", gap: 10, marginTop: 6 }}>
            {rota && <a className="btn btn-ghost" href={rota} target="_blank" rel="noopener noreferrer"><Ic n="nav" />Rota</a>}
            <button className="btn btn-volt" disabled={off || !c} style={off || !c ? { opacity: 0.4 } : undefined} onClick={() => setConfirmar(true)}>
              <Ic n="bolt" />{!off && !livres.length ? "Todos ocupados" : "Iniciar recarga"}
            </button>
          </div>
        </div>
      ) : (
        <form action={enviar} style={{ padding: "16px 18px 20px" }}>
          <input type="hidden" name="codigo" value={e.codigo} />
          <input type="hidden" name="conector" value={con ?? ""} />
          <h3 style={{ fontSize: 21, fontWeight: 800, marginBottom: 4 }}>Confirmar recarga</h3>
          <div className="muted" style={{ marginBottom: 14 }}>{e.nome} · Conector {c?.numero} · {c?.tipo} {c ? kw(c.potencia_w) : ""} kW</div>
          <div className="box">
            <div className="between" style={{ marginBottom: 8 }}><span className="muted">Tarifa</span><b className="mono">{brl(e.preco_kwh_centavos)}/kWh</b></div>
            <div className="between"><span className="muted">Estimativa para 30 kWh</span><b className="mono">{brl(estimativa)}</b></div>
          </div>
          <div className="box">
            <div className="box-title">Pagamento</div>
            <div className="list-item" style={{ paddingTop: 0 }}>
              <span className="li-ic"><Ic n="wallet" /></span>
              <div className="li-main"><b>Saldo da carteira</b><small className="mono">{brl(saldo)} disponível</small></div>
              {saldo >= saldoMinimo && <Ic n="check" />}
            </div>
            {saldo < saldoMinimo ? (
              <div className="aviso erro" style={{ marginTop: 4 }}>Saldo mínimo para iniciar: {brl(saldoMinimo)}. <Link className="link" href="/carteira">Adicionar crédito</Link></div>
            ) : saldo < estimativa ? (
              <div className="aviso alerta" style={{ marginTop: 4, marginBottom: 0 }}>O saldo pode não cobrir uma recarga completa. A recarga para sozinha quando o saldo acabar.</div>
            ) : null}
          </div>
          {r && !r.ok && <div className="aviso erro">{r.texto}</div>}
          <button className="btn btn-volt btn-block" disabled={enviando || saldo < saldoMinimo}><Ic n="bolt" />{enviando ? "Enviando..." : "Conectei o cabo, iniciar"}</button>
          <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setConfirmar(false)}>Voltar</button>
        </form>
      )}
    </div>
  );
}
