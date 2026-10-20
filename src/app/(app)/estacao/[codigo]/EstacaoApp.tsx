"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Ic } from "@/components/Ic";
import { brl, kw } from "@/lib/format";
import type { EstacaoApp as Est, Proxima } from "@/lib/app";
import { iniciarRecargaApp, type Resposta } from "../../acoes";

export function EstacaoApp({ e, conectorInicial, saldo, saldoMinimo, meusConectores, grade, vouchers, proximas }: {
  e: Est;
  conectorInicial: number | null;
  saldo: number;
  saldoMinimo: number;
  meusConectores: string[];
  grade: { tarifas: { id: number; nome: string; cor: string; preco: number; horario: string; agora: boolean }[]; blocos: { horas: number; cor: string | null }[]; precoBase: number };
  vouchers: { mv: number; codigo: string; pct: number }[];
  proximas: Proxima[];
}) {
  const [voucher, setVoucher] = useState<number | null>(vouchers[0]?.mv ?? null);
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
  const pct = vouchers.find((v) => v.mv === voucher)?.pct ?? 0;
  const preco = Math.round((e.preco_agora * (100 - pct)) / 100);
  const estimativa = Math.round(30 * preco);
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
        <div><small>Tarifa agora</small><b>{brl(e.preco_agora)}</b></div>
        <div><small>Potência máx.</small><b>{kw(maxKw)} kW</b></div>
        <div><small>Conectores</small><b>{livres.length} de {e.conectores.length} livres</b></div>
      </div>

      {!confirmar ? (
        <div style={{ padding: "16px 18px" }}>
          {off ? (
            <div className="box" style={{ background: "var(--red-bg)", borderColor: "#F2C4C7" }}>
              <div className="row" style={{ color: "var(--red)", fontWeight: 800 }}><Ic n="alert" />Estação temporariamente indisponível</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>A equipe técnica já foi avisada.{proximas.length ? " Veja as estações livres mais perto:" : " Veja outras estações no mapa."}</div>
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
          {proximas.length > 0 && (
            <div className="box" style={off || !livres.length ? { borderColor: "var(--g300)", background: "var(--g50)" } : undefined}>
              <div className="box-title">{off || !livres.length ? "Estações livres mais perto" : "Se estiver ocupada, as mais perto"}</div>
              {proximas.map((p) => (
                <Link key={p.codigo} className="list-item" href={`/estacao/${encodeURIComponent(p.codigo)}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="li-ic"><Ic n="pin" /></span>
                  <div className="li-main">
                    <b>{p.nome}</b>
                    <small>{p.km < 1 ? `${Math.round(p.km * 1000)} m` : `${p.km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`} daqui · {p.livres} {p.livres === 1 ? "conector livre" : "conectores livres"} · {p.tipos.join(", ")}</small>
                  </div>
                  <Ic n="right" />
                </Link>
              ))}
            </div>
          )}
          {grade.tarifas.length > 0 && (
            <div className="box" style={{ marginTop: 6 }}>
              <div className="box-title">Tarifa por horário {e.tarifa_nome && <span className="badge b-disponivel">{e.tarifa_nome} agora</span>}</div>
              <div className="tariff-strip">{grade.blocos.map((b, i) => <div key={i} style={{ flex: b.horas, background: b.cor ?? "var(--line)" }} />)}</div>
              <div className="tariff-scale"><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span></div>
              <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 12.5 }}>
                {grade.tarifas.map((t) => (
                  <div key={t.id} className="between">
                    <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: t.cor }} />{t.nome} · {t.horario}</span>
                    <b className="mono" style={t.agora ? { color: "var(--g600)" } : undefined}>{brl(t.preco)}</b>
                  </div>
                ))}
                {grade.blocos.some((b) => !b.cor) && (
                  <div className="between">
                    <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: "var(--line)" }} />Demais horários</span>
                    <b className="mono" style={!e.tarifa_nome ? { color: "var(--g600)" } : undefined}>{brl(grade.precoBase)}</b>
                  </div>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Vale a tarifa do horário em que a recarga começa.</div>
            </div>
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
          <input type="hidden" name="voucher" value={voucher ?? ""} />
          <h3 style={{ fontSize: 21, fontWeight: 800, marginBottom: 4 }}>Confirmar recarga</h3>
          <div className="muted" style={{ marginBottom: 14 }}>{e.nome} · Conector {c?.numero} · {c?.tipo} {c ? kw(c.potencia_w) : ""} kW</div>
          <div className="box">
            <div className="between" style={{ marginBottom: 8 }}><span className="muted">Tarifa{e.tarifa_nome ? ` ${e.tarifa_nome.toLowerCase()}` : ""}</span><b className="mono">{brl(e.preco_agora)}/kWh</b></div>
            {pct > 0 && (
              <>
                <div className="between" style={{ marginBottom: 8, color: "var(--g600)" }}><span>Voucher {vouchers.find((v) => v.mv === voucher)?.codigo}</span><b className="mono">-{pct}%</b></div>
                <div className="between" style={{ marginBottom: 8 }}><span className="muted">Você paga</span><b className="mono">{brl(preco)}/kWh</b></div>
              </>
            )}
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
          {vouchers.length > 0 && (
            <div className="box">
              <div className="box-title">Usar voucher</div>
              <div className="chips" style={{ flexWrap: "wrap" }}>
                <button type="button" className={`chip ${voucher === null ? "on" : ""}`} onClick={() => setVoucher(null)}>Não usar</button>
                {vouchers.map((v) => (
                  <button key={v.mv} type="button" className={`chip ${voucher === v.mv ? "on" : ""}`} onClick={() => setVoucher(v.mv)}>{v.codigo} · {v.pct}%</button>
                ))}
              </div>
            </div>
          )}
          {r && !r.ok && <div className="aviso erro">{r.texto}</div>}
          <button className="btn btn-volt btn-block" disabled={enviando || saldo < saldoMinimo}><Ic n="bolt" />{enviando ? "Enviando..." : "Conectei o cabo, iniciar"}</button>
          <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setConfirmar(false)}>Voltar</button>
        </form>
      )}
    </div>
  );
}
