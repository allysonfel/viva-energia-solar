"use client";

import { useActionState, useState } from "react";
import { salvarTarifa } from "./acoes";

const CORES = ["#E9A23B", "#2F7FD8", "#7BCFA6", "#0B3B2A", "#C4F53A", "#177148", "#D9534F", "#8E6CC9"];
const hh = (h: number) => `${String(h).padStart(2, "0")}h`;

type Inicial = { id: number; nome: string; hora_inicio: number; hora_fim: number; preco: string; cor: string; estacoes: number[] };

// Campos controlados: se o servidor recusar (horário em conflito, preço),
// nada do que foi digitado se perde.
export function FormTarifa({ inicial, estacoes, corSugerida }: { inicial?: Inicial; estacoes: { id: number; nome: string; tarifas: string }[]; corSugerida: number }) {
  const [resp, enviar, enviando] = useActionState(salvarTarifa, null);
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [ini, setIni] = useState(inicial?.hora_inicio ?? 18);
  const [fim, setFim] = useState(inicial?.hora_fim ?? 21);
  const [preco, setPreco] = useState(inicial?.preco ?? "");
  const [cor, setCor] = useState(inicial?.cor ?? CORES[corSugerida % CORES.length]);
  const [marcadas, setMarcadas] = useState<number[]>(inicial?.estacoes ?? []);
  const horas = fim === ini ? 0 : fim > ini ? fim - ini : 24 - ini + fim;

  return (
    <form action={enviar}>
      {inicial && <input type="hidden" name="id" value={inicial.id} />}
      {resp?.erro && <div className="aviso erro">{resp.erro}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="t-nome">Nome da tarifa</label>
          <input className="input" id="t-nome" name="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Horário de ponta" maxLength={30} required />
        </div>
        <div className="field">
          <label htmlFor="t-preco">Preço por kWh (R$)</label>
          <input className="input mono" id="t-preco" name="preco" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="2,10" maxLength={8} inputMode="decimal" required />
        </div>
        <div className="field">
          <label htmlFor="t-ini">Começa às</label>
          <select className="input" id="t-ini" name="ini" value={ini} onChange={(e) => setIni(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-fim">Termina às</label>
          <select className="input" id="t-fim" name="fim" value={fim} onChange={(e) => setFim(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => <option key={h + 1} value={h + 1}>{hh(h + 1)}</option>)}
          </select>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: "-4px 0 12px" }}>
        {horas === 0
          ? "Início e fim iguais: escolha outro horário (para o dia todo, 00h às 24h)."
          : `Vale das ${hh(ini)} às ${hh(fim % 24)}, ${horas} hora${horas > 1 ? "s" : ""}${fim < ini ? " (passa da meia-noite)" : ""}. Conta o horário em que a recarga começa.`}
      </p>
      <div className="field">
        <label>Cor no gráfico</label>
        <div className="row" style={{ gap: 8 }}>
          {CORES.map((c) => (
            <button key={c} type="button" onClick={() => setCor(c)} aria-label={`Cor ${c}`} aria-pressed={cor === c}
              style={{ width: 28, height: 28, borderRadius: 8, background: c, border: cor === c ? "3px solid var(--ink)" : "1px solid var(--line)", cursor: "pointer" }} />
          ))}
          <input type="hidden" name="cor" value={cor} />
        </div>
      </div>

      <div className="box-title" style={{ marginTop: 14 }}>Usar nas estações</div>
      {estacoes.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5 }}>Nenhuma estação cadastrada ainda.</p>
      ) : (
        <div className="tarifas-op">
          {estacoes.map((e) => (
            <label key={e.id}>
              <input type="checkbox" name="estacao" value={e.id} checked={marcadas.includes(e.id)}
                onChange={(ev) => setMarcadas(ev.target.checked ? [...marcadas, e.id] : marcadas.filter((x) => x !== e.id))} />
              <b>{e.nome}</b>
              <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{e.tarifas}</span>
            </label>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Dá para ligar e desligar depois, aqui ou no cadastro de cada estação.</p>

      <button className="btn btn-dark" style={{ marginTop: 12 }} disabled={enviando}>{enviando ? "Salvando..." : inicial ? "Salvar tarifa" : "Criar tarifa"}</button>
    </form>
  );
}
