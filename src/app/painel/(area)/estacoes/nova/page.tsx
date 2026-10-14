import Link from "next/link";
import { requireUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { simuladorLigado } from "@/lib/ocpp/simulador";
import { TIPOS_CONECTOR } from "@/lib/ocpp/tipos";
import { criarEstacao } from "../acoes";

const ERROS: Record<string, string> = {
  codigo: "Código inválido: use de 3 a 40 letras, números, ponto, hífen ou sublinhado (ex.: VIVA-JPA-07).",
  duplicado: "Já existe uma estação com esse código.",
  conector: "Confira os conectores: tipo da lista e potência entre 1 e 1000 kW.",
  parceiro: "Parceiro não encontrado.",
};

export default async function NovaEstacao({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  await requireUser(["admin"]);
  const { erro } = await searchParams;
  const parceiros = await sql<{ id: number; nome: string }[]>`SELECT id, nome FROM parceiros ORDER BY nome`;
  const sim = simuladorLigado();
  return (
    <form action={criarEstacao} className="panel" style={{ maxWidth: 760 }}>
      <div className="panel-h"><h3>Dados da estação</h3><Link className="link" href="/painel/estacoes">Cancelar</Link></div>
      <div className="panel-b">
        {erro && <div className="aviso erro">{ERROS[erro] ?? erro}</div>}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="codigo">Código (identidade OCPP)</label>
            <input className="input mono" id="codigo" name="codigo" required maxLength={40} placeholder="VIVA-JPA-07" pattern="[A-Za-z0-9._\-]{3,40}" />
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
            <input className="input mono" id="preco" name="preco" required defaultValue="1,89" maxLength={8} />
          </div>
          <div className="field">
            <label htmlFor="custo">Custo da energia por kWh (R$)</label>
            <input className="input mono" id="custo" name="custo" defaultValue="0,98" maxLength={8} />
          </div>
          <div className="field full">
            <label htmlFor="parceiro">Parceiro / local</label>
            <select className="input" id="parceiro" name="parceiro" defaultValue="">
              <option value="">Própria (Viva Energia)</option>
              {parceiros.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="box-title" style={{ marginTop: 6 }}>Conectores</div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Preencha os conectores na ordem do equipamento (conector 1, 2...). Deixe em branco o que não existe.</p>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="form-grid">
            <div className="field">
              <label htmlFor={`tipo${i}`}>Conector {i}</label>
              <select className="input" id={`tipo${i}`} name={`tipo${i}`} defaultValue={i === 1 ? "CCS2" : i === 2 ? "Tipo 2" : ""}>
                <option value="">Não existe</option>
                {TIPOS_CONECTOR.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`kw${i}`}>Potência (kW)</label>
              <input className="input mono" id={`kw${i}`} name={`kw${i}`} defaultValue={i === 1 ? "60" : i === 2 ? "22" : ""} maxLength={6} />
            </div>
          </div>
        ))}
        {sim && (
          <label className="row" style={{ gap: 8, fontWeight: 600, margin: "4px 0 16px" }}>
            <input type="checkbox" name="simulada" value="1" /> Estação simulada (carregador virtual, para teste e demonstração)
          </label>
        )}
        <button className="btn btn-dark">Cadastrar estação</button>
      </div>
    </form>
  );
}
