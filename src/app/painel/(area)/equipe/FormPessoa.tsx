"use client";

import { useState } from "react";

type Perfil = "admin" | "operador" | "parceiro";
type Aba = { id: string; nome: string; escopo: boolean };

const PERFIS: { id: Perfil; nome: string; texto: string }[] = [
  { id: "admin", nome: "Administrador", texto: "Vê e faz tudo, inclusive equipe e configurações." },
  { id: "operador", nome: "Operador", texto: "Opera estações e recargas (comandos remotos). Pode ficar restrito às estações de um parceiro." },
  { id: "parceiro", nome: "Parceiro", texto: "Dono do local: só as estações dele, sem comandos, sem dados de clientes." },
];

// Cadastro e edição de pessoa da equipe: perfil, estações que vê e abas
// liberadas. A tela só ajuda; o servidor confere tudo de novo ao salvar.
export function FormPessoa({ acao, abas, parceiros, pessoa }: {
  acao: (fd: FormData) => Promise<void>;
  abas: Aba[];
  parceiros: { id: number; nome: string }[];
  pessoa?: { id: number; nome: string; email: string; perfil: Perfil; parceiro_id: number | null; abas: string[] };
}) {
  const [perfil, setPerfil] = useState<Perfil>(pessoa?.perfil ?? "operador");
  const [parceiro, setParceiro] = useState(pessoa?.parceiro_id ? String(pessoa.parceiro_id) : "");
  const restrito = perfil === "parceiro" || (perfil === "operador" && !!parceiro);
  const disponiveis = abas.filter((a) => !restrito || a.escopo);
  const padrao = (p: Perfil) => (p === "parceiro" ? ["estacoes", "recargas", "relatorios"] : abas.map((a) => a.id));
  const [marcadas, setMarcadas] = useState<string[]>(pessoa?.abas ?? padrao("operador"));

  return (
    <form action={acao}>
      {pessoa && <input type="hidden" name="id" value={pessoa.id} />}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="p-nome">Nome</label>
          <input className="input" id="p-nome" name="nome" defaultValue={pessoa?.nome} required minLength={2} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="p-email">E-mail (login)</label>
          {pessoa ? (
            <input className="input" id="p-email" value={pessoa.email} disabled />
          ) : (
            <input className="input" id="p-email" name="email" type="email" required maxLength={160} />
          )}
        </div>
      </div>

      <div className="box-title" style={{ marginTop: 4 }}>Perfil</div>
      <div className="perfis">
        {PERFIS.map((p) => (
          <label key={p.id} className={`perfil-op${perfil === p.id ? " on" : ""}`}>
            <input
              type="radio"
              name="perfil"
              value={p.id}
              checked={perfil === p.id}
              onChange={() => {
                setPerfil(p.id);
                setMarcadas(padrao(p.id));
              }}
            />
            <b>{p.nome}</b>
            <span>{p.texto}</span>
          </label>
        ))}
      </div>

      {perfil !== "admin" && (
        <>
          <div className="field" style={{ maxWidth: 420, marginTop: 14 }}>
            <label htmlFor="p-parceiro">Estações que vê</label>
            <select className="input" id="p-parceiro" name="parceiro" value={parceiro} required={perfil === "parceiro"} onChange={(e) => setParceiro(e.target.value)}>
              <option value="">{perfil === "parceiro" ? "Escolha o parceiro" : "Todas as estações da rede"}</option>
              {parceiros.map((x) => <option key={x.id} value={x.id}>Só as de {x.nome}</option>)}
            </select>
            {perfil === "parceiro" && parceiros.length === 0 && <small className="muted">Cadastre o parceiro mais abaixo primeiro.</small>}
          </div>

          <div className="box-title" style={{ marginTop: 14 }}>Abas que pode ver</div>
          <div className="abas-op">
            {disponiveis.map((a) => (
              <label key={a.id} className="row" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  name="aba"
                  value={a.id}
                  checked={marcadas.includes(a.id)}
                  onChange={(e) => setMarcadas(e.target.checked ? [...marcadas, a.id] : marcadas.filter((x) => x !== a.id))}
                />
                {a.nome}
              </label>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            Visão geral e Minha conta aparecem para todos.
            {restrito && " Quem vê só as estações de um parceiro não recebe Tarifas, Vouchers, Clientes e Simulador (são da rede inteira) e não vê nome de cliente, custo da energia nem resultado da Viva."}
          </p>
        </>
      )}

      <button className="btn btn-dark" style={{ marginTop: 14 }}>{pessoa ? "Salvar alterações" : "Adicionar pessoa"}</button>
    </form>
  );
}
