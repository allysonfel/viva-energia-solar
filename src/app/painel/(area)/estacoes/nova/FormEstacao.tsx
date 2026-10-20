"use client";

import { useActionState, startTransition } from "react";
import { criarEstacao } from "../acoes";
import { EscolherTarifas, type OpcaoTarifa } from "../EscolherTarifas";

// Enviado à mão (sem <form action>) para o React não limpar o formulário
// quando o servidor recusa algo: o erro aparece e o que foi digitado fica.
export function FormEstacao({ parceiros, tarifas, tipos, sim }: { parceiros: { id: number; nome: string }[]; tarifas: OpcaoTarifa[]; tipos: string[]; sim: boolean }) {
  const [resp, enviar, enviando] = useActionState(criarEstacao, null);
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        startTransition(() => enviar(fd));
      }}
    >
      {resp?.erro && <div className="aviso erro">{resp.erro}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="codigo">Código (identidade OCPP)</label>
          <input className="input mono" id="codigo" name="codigo" required maxLength={40} placeholder="VIVA-JPA-07" pattern="[A-Za-z0-9._\-]{3,40}" title="De 3 a 40 letras, números, ponto, hífen ou sublinhado" />
        </div>
        <div className="field">
          <label htmlFor="nome">Nome</label>
          <input className="input" id="nome" name="nome" required maxLength={60} placeholder="Viva Manaíra" />
        </div>
        <div className="field full">
          <label htmlFor="endereco">Endereço</label>
          <input className="input" id="endereco" name="endereco" maxLength={160} />
        </div>
        <div className="field">
          <label htmlFor="bairro">Bairro</label>
          <input className="input" id="bairro" name="bairro" maxLength={60} />
        </div>
        <div className="field">
          <label htmlFor="cidade">Cidade</label>
          <input className="input" id="cidade" name="cidade" maxLength={60} placeholder="João Pessoa" />
        </div>
        <div className="field">
          <label htmlFor="lat">Latitude</label>
          <input className="input mono" id="lat" name="lat" maxLength={20} placeholder="-7.0945" />
        </div>
        <div className="field">
          <label htmlFor="lng">Longitude</label>
          <input className="input mono" id="lng" name="lng" maxLength={20} placeholder="-34.8341" />
        </div>
        <div className="field">
          <label htmlFor="preco">Preço por kWh (R$)</label>
          <input className="input mono" id="preco" name="preco" required defaultValue="1,70" maxLength={8} inputMode="decimal" />
        </div>
        <div className="field">
          <label htmlFor="custo">Custo da energia por kWh (R$)</label>
          <input className="input mono" id="custo" name="custo" defaultValue="0,85" maxLength={8} inputMode="decimal" />
        </div>
        <div className="field full">
          <label htmlFor="parceiro">Parceiro / local</label>
          <select className="input" id="parceiro" name="parceiro" defaultValue="">
            <option value="">Própria (Viva Energia)</option>
            {parceiros.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      </div>

      <div className="box-title" style={{ marginTop: 6 }}>Tarifas por horário</div>
      <EscolherTarifas tarifas={tarifas} />

      <div className="box-title" style={{ marginTop: 16 }}>Conectores</div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Preencha os conectores na ordem do equipamento (conector 1, 2...). Deixe em branco o que não existe.</p>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="form-grid">
          <div className="field">
            <label htmlFor={`tipo${i}`}>Conector {i}</label>
            <select className="input" id={`tipo${i}`} name={`tipo${i}`} defaultValue={i === 1 ? "CCS2" : i === 2 ? "Tipo 2" : ""}>
              <option value="">Não existe</option>
              {tipos.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`kw${i}`}>Potência (kW)</label>
            <input className="input mono" id={`kw${i}`} name={`kw${i}`} defaultValue={i === 1 ? "60" : i === 2 ? "22" : ""} maxLength={6} inputMode="decimal" />
          </div>
        </div>
      ))}
      {sim && (
        <label className="row" style={{ gap: 8, fontWeight: 600, margin: "4px 0 16px" }}>
          <input type="checkbox" name="simulada" value="1" /> Estação simulada (carregador virtual, para teste e demonstração)
        </label>
      )}
      <button className="btn btn-dark" disabled={enviando}>{enviando ? "Cadastrando..." : "Cadastrar estação"}</button>
    </form>
  );
}
