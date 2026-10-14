"use client";

import { useActionState } from "react";
import { resgatarVoucher, type Resposta } from "../acoes";

type V = { codigo: string; pct: number; descricao: string; onde: string; validade: string; usado: boolean };

export function MeusVouchers({ lista }: { lista: V[] }) {
  const [r, resgatar, enviando] = useActionState<Resposta, FormData>(resgatarVoucher, null);
  return (
    <div className="box">
      <div className="box-title">Meus vouchers</div>
      <form action={resgatar} className="row" style={{ marginBottom: 12, gap: 8 }}>
        <input className="input" name="codigo" style={{ height: 40, textTransform: "uppercase" }} placeholder="Digite o código, ex.: VIVA20" maxLength={20} required />
        <button className="btn btn-dark btn-sm" disabled={enviando}>Resgatar</button>
      </form>
      {r && <div className={`aviso ${r.ok ? "ok" : "erro"}`}>{r.texto}</div>}
      {lista.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nenhum voucher ainda. Promoções aparecem aqui.</div>}
      {lista.map((v) => (
        <div key={v.codigo} className={`voucher ${v.usado ? "used" : ""}`}>
          <div className="l"><b>{v.pct}%</b><small>off</small></div>
          <div className="r">
            <div className="between"><b className="mono">{v.codigo}</b>{v.usado && <span className="badge b-neutral">Usado</span>}</div>
            <small>{[v.descricao, v.onde, v.validade].filter(Boolean).join(" · ")}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
