"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ic } from "@/components/Ic";
import { brl, kwh, kw } from "@/lib/format";
import type { RecargaApp } from "@/lib/app";
import { pararRecargaApp, type Resposta } from "../../acoes";

const dois = (n: number) => String(n).padStart(2, "0");

// Recarga ao vivo: atualiza a cada 3 s; quando termina, vai para o recibo.
export function AoVivo({ inicial }: { inicial: RecargaApp }) {
  const router = useRouter();
  const [r, setR] = useState(inicial);
  const [agora, setAgora] = useState(() => Date.now());
  const [res, parar, parando] = useActionState<Resposta, FormData>(pararRecargaApp, null);

  useEffect(() => {
    const t = setInterval(() => {
      fetch(`/api/app/recarga/${inicial.id}`, { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .then((d) => {
          if (!d?.recarga) return;
          setR(d.recarga);
          if (d.recarga.status !== "em_andamento") router.replace(`/recibo/${inicial.id}`);
        })
        .catch(() => {});
    }, 3_000);
    const r1 = setInterval(() => setAgora(Date.now()), 1_000);
    return () => {
      clearInterval(t);
      clearInterval(r1);
    };
  }, [inicial.id, router]);

  const seg = Math.max(0, Math.floor((agora - new Date(r.inicio).getTime()) / 1000));
  const tempo = seg >= 3600 ? `${Math.floor(seg / 3600)}:${dois(Math.floor((seg % 3600) / 60))}:${dois(seg % 60)}` : `${dois(Math.floor(seg / 60))}:${dois(seg % 60)}`;
  // Anel: carga da bateria quando o carro informa; senão, kWh sobre 60 kWh.
  const pct = r.soc ?? Math.min(100, Math.round((r.energia_wh / 60_000) * 100));
  const R = 110, C = 2 * Math.PI * R;

  return (
    <div className="charge">
      <div className="top">
        <Link className="icon-btn" href="/" style={{ background: "rgba(255,255,255,.08)", borderColor: "transparent", color: "#fff" }} aria-label="Mapa"><Ic n="back" /></Link>
        <div style={{ textAlign: "center" }}>
          <b>{r.estacao}</b><br />
          <small>Conector {r.conector_numero}{r.conector ? ` · ${r.conector}` : ""}</small>
        </div>
        <span style={{ width: 40 }} />
      </div>
      <div className="ring-wrap">
        <svg viewBox="0 0 250 250">
          <circle cx="125" cy="125" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="14" />
          <circle cx="125" cy="125" r={R} fill="none" stroke="#C4F53A" strokeWidth="14" strokeLinecap="round" strokeDasharray={C}
            strokeDashoffset={C * (1 - pct / 100)} style={{ filter: "drop-shadow(0 0 8px rgba(196,245,58,.55))", transition: "stroke-dashoffset .5s" }} />
        </svg>
        <div className="ring-center">
          <div className="soc">{r.soc !== null ? <>{r.soc}<small>%</small></> : <>{kwh(r.energia_wh)}<small> kWh</small></>}</div>
          <div className="lbl"><span className="pulse" />{r.parada_solicitada ? "Saldo acabou, encerrando" : r.potencia_w > 0 ? "Carregando" : "Aguardando o carro"}</div>
        </div>
      </div>
      <div className="charge-grid">
        <div><small>Energia</small><b>{kwh(r.energia_wh)} kWh</b></div>
        <div><small>Potência</small><b>{kw(r.potencia_w)} kW</b></div>
        <div><small>Tempo</small><b>{tempo}</b></div>
        <div className="cost"><small>Valor até agora</small><b>{brl(r.valor_centavos)}</b></div>
      </div>
      <div className="between" style={{ background: "rgba(255,255,255,.06)", borderRadius: 14, padding: "12px 14px", fontSize: 12.5, color: "#A9C4B6", marginBottom: 16 }}>
        <span>Tarifa{r.tarifa_nome ? ` ${r.tarifa_nome.toLowerCase()}` : ""}{r.voucher ? ` com ${r.voucher} (-${r.desconto_pct}%)` : ""}</span>
        <b className="mono" style={{ color: "#fff" }}>{brl(r.preco_kwh_centavos)}/kWh</b>
      </div>
      {res && <div className={`aviso ${res.ok ? "info" : "erro"}`}>{res.texto}</div>}
      <form action={parar} style={{ marginTop: "auto" }}>
        <input type="hidden" name="id" value={r.id} />
        <button className="btn btn-block" style={{ background: "#fff", color: "var(--g900)" }} disabled={parando || !!res?.ok}>
          <Ic n="stop" />{parando || res?.ok ? "Encerrando..." : "Encerrar recarga"}
        </button>
      </form>
    </div>
  );
}
