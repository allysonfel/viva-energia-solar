"use client";

import { Ic } from "./Ic";
import { brl, kwh } from "@/lib/format";
import type { RecargaApp } from "@/lib/app";
import type { Resposta } from "@/app/(app)/acoes";

// Segunda confirmação antes de encerrar (pedido do cliente): evita parar a
// recarga por um toque sem querer. Conteúdo da folha; quem chama põe a moldura.
export function ConfirmarEncerrar({ r, parar, parando, res, onCancelar }: {
  r: RecargaApp;
  parar: (f: FormData) => void;
  parando: boolean;
  res: Resposta;
  onCancelar: () => void;
}) {
  const ocupado = parando || !!res?.ok;
  return (
    <div style={{ padding: "8px 18px 22px" }}>
      <h3 style={{ fontSize: 21, fontWeight: 800, margin: "10px 0 14px" }}>Encerrar recarga agora?</h3>
      <div className="kv" style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)", marginBottom: 16, gridTemplateColumns: `repeat(${r.soc !== null ? 3 : 2}, 1fr)` }}>
        {r.soc !== null && <div><small>Bateria</small><b>{r.soc}%</b></div>}
        <div><small>Energia</small><b>{kwh(r.energia_wh, 2)} kWh</b></div>
        <div><small>A pagar</small><b>{brl(r.valor_centavos)}</b></div>
      </div>
      {res && <div className={`aviso ${res.ok ? "info" : "erro"}`}>{res.texto}</div>}
      <form action={parar}>
        <input type="hidden" name="id" value={r.id} />
        <button className="btn btn-block" style={{ background: "var(--red)", color: "#fff" }} disabled={ocupado}>
          <Ic n="stop" />{ocupado ? "Encerrando..." : "Encerrar recarga"}
        </button>
      </form>
      <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={onCancelar} disabled={ocupado}>Continuar carregando</button>
    </div>
  );
}
