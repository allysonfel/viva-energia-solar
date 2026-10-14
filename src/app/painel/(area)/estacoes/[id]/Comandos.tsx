"use client";

import { useActionState, useState } from "react";
import { Ic } from "@/components/Ic";
import { comando, type Retorno } from "../acoes";

type Con = { numero: number; tipo: string; livre: boolean };

// Botões de comando remoto. Cada um é um formulário que chama a server
// action; a resposta do carregador aparece logo abaixo.
export function Comandos({ id, habilitada, conectada, conectores, limiteKw, maxKw }: {
  id: number;
  habilitada: boolean;
  conectada: boolean;
  conectores: Con[];
  limiteKw: number;
  maxKw: number;
}) {
  const [r, enviar, enviando] = useActionState<Retorno, FormData>(comando, null);
  const [kw, setKw] = useState(limiteKw);
  const livre = conectores.find((c) => c.livre)?.numero ?? conectores[0]?.numero ?? 1;
  const [conector, setConector] = useState(livre);

  const Botao = ({ acao, ic, nome, warn, extra }: { acao: string; ic: string; nome: string; warn?: boolean; extra?: React.ReactNode }) => (
    <form action={enviar}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="acao" value={acao} />
      {extra}
      <button className={`cmd ${warn ? "warn" : ""}`} disabled={enviando} style={{ width: "100%" }}>
        <span className="ci"><Ic n={ic} /></span>
        {nome}
      </button>
    </form>
  );

  return (
    <>
      {!conectada && <div className="aviso alerta">A estação está offline: os comandos só chegam quando ela voltar a se conectar.</div>}
      <div className="cmds">
        <Botao acao="reiniciar" ic="refresh" nome="Reiniciar" />
        <Botao acao="iniciar" ic="play" nome={`Iniciar recarga (conector ${conector})`} extra={<input type="hidden" name="conector" value={conector} />} />
        {habilitada ? <Botao acao="desabilitar" ic="ban" nome="Desabilitar" warn /> : <Botao acao="habilitar" ic="power" nome="Habilitar" />}
      </div>
      {conectores.length > 1 && (
        <div className="row" style={{ gap: 6, margin: "10px 0 0", flexWrap: "wrap" }}>
          <small className="muted">Conector para iniciar:</small>
          {conectores.map((c) => (
            <button key={c.numero} type="button" className={`chip ${conector === c.numero ? "on" : ""}`} onClick={() => setConector(c.numero)}>
              {c.numero} · {c.tipo}
            </button>
          ))}
        </div>
      )}
      {enviando && <div className="aviso info" style={{ marginTop: 12 }}>Enviando ao carregador...</div>}
      {r && !enviando && <div className={`aviso ${r.ok ? "ok" : "erro"}`} style={{ marginTop: 12 }}>{r.texto}</div>}

      <form action={enviar} className="box">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="acao" value="potencia" />
        <div className="box-title">Potência máxima liberada</div>
        <div className="between">
          <div className="power-read">{kw} <small>kW</small></div>
          <button className="btn btn-dark btn-sm" disabled={enviando}>Aplicar</button>
        </div>
        <input type="range" className="range" name="kw" min={7} max={maxKw} value={kw} onChange={(e) => setKw(Number(e.target.value))} aria-label="Potência máxima em kW" />
        <div className="between muted" style={{ fontSize: 12 }}>
          <span>7 kW</span>
          <span>Soma dos conectores: {maxKw} kW</span>
        </div>
      </form>
    </>
  );
}

export function PararRecarga({ id, recarga }: { id: number; recarga: number }) {
  const [r, enviar, enviando] = useActionState<Retorno, FormData>(comando, null);
  return (
    <form action={enviar} style={{ textAlign: "right" }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="acao" value="parar" />
      <input type="hidden" name="recarga" value={recarga} />
      <button className="btn btn-danger btn-sm" disabled={enviando}><Ic n="stop" />{enviando ? "Parando..." : "Parar"}</button>
      {r && !r.ok && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>{r.texto}</div>}
    </form>
  );
}
