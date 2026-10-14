import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { requireUser, PERFIL_NOME, type Perfil } from "@/lib/session";
import { sql } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { guardarSegredo, lerSegredo } from "@/lib/segredo";
import { haQuanto } from "@/lib/format";

type Pessoa = { id: number; nome: string; email: string; perfil: Perfil; parceiro_id: number | null; parceiro: string | null; ativo: boolean; ultimo_acesso: Date | null };

// Senha provisória legível (sem letras que confundem), mostrada uma vez para o admin repassar.
function senhaProvisoria(): string {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(12), (b) => a[b % a.length]).join("").replace(/(.{4})(?!$)/g, "$1-");
}

function lerPessoa(fd: FormData) {
  const p = String(fd.get("perfil") ?? "");
  const perfil: Perfil = p === "admin" ? "admin" : p === "parceiro" ? "parceiro" : "operador";
  return {
    nome: String(fd.get("nome") ?? "").trim().slice(0, 80),
    email: String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 160),
    perfil,
    parceiro: perfil === "parceiro" ? Number(fd.get("parceiro")) || null : null,
  };
}

async function parceiroValido(id: number | null) {
  if (!id) return false;
  const [p] = await sql`SELECT 1 FROM parceiros WHERE id = ${id}`;
  return !!p;
}

async function convidar(fd: FormData) {
  "use server";
  const u = await requireUser(["admin"]);
  const p = lerPessoa(fd);
  if (p.nome.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) redirect("/painel/equipe?erro=dados");
  if (p.perfil === "parceiro" && !(await parceiroValido(p.parceiro))) redirect("/painel/equipe?erro=parceiro");
  const [existe] = await sql`SELECT 1 FROM usuarios WHERE email = ${p.email}`;
  if (existe) redirect("/painel/equipe?erro=email");
  const senha = senhaProvisoria();
  const [n] = await sql<{ id: number }[]>`
    INSERT INTO usuarios (nome, email, senha_hash, perfil, parceiro_id) VALUES (${p.nome}, ${p.email}, ${hashPassword(senha)}, ${p.perfil}, ${p.parceiro}) RETURNING id`;
  await audit(`usuario:${u.id}`, "usuario_criado", "usuario", n.id, p.perfil);
  await guardarSegredo("usuario", n.id, senha);
  redirect(`/painel/equipe?nova=${n.id}`);
}

async function editar(fd: FormData) {
  "use server";
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id"));
  const p = lerPessoa(fd);
  if (p.nome.length < 2) redirect("/painel/equipe?erro=dados");
  if (p.perfil === "parceiro" && !(await parceiroValido(p.parceiro))) redirect("/painel/equipe?erro=parceiro");
  if (id === u.id && p.perfil !== "admin") redirect("/painel/equipe?erro=proprio");
  await sql`UPDATE usuarios SET nome = ${p.nome}, perfil = ${p.perfil}, parceiro_id = ${p.parceiro}, sessao_versao = sessao_versao + 1 WHERE id = ${id}`;
  await audit(`usuario:${u.id}`, "usuario_editado", "usuario", id, p.perfil);
  redirect("/painel/equipe?ok=1");
}

async function novaSenha(fd: FormData) {
  "use server";
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id"));
  const senha = senhaProvisoria();
  const r = await sql`UPDATE usuarios SET senha_hash = ${hashPassword(senha)}, sessao_versao = sessao_versao + 1 WHERE id = ${id} RETURNING id`;
  if (!r.length) redirect("/painel/equipe");
  await audit(`usuario:${u.id}`, "senha_provisoria", "usuario", id);
  await guardarSegredo("usuario", id, senha);
  redirect(`/painel/equipe?nova=${id}`);
}

async function ativar(fd: FormData) {
  "use server";
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id"));
  if (id === u.id) redirect("/painel/equipe?erro=proprio");
  const ativo = fd.get("ativo") === "1";
  await sql`UPDATE usuarios SET ativo = ${ativo}, sessao_versao = sessao_versao + 1 WHERE id = ${id}`;
  await audit(`usuario:${u.id}`, ativo ? "usuario_reativado" : "usuario_desativado", "usuario", id);
  redirect("/painel/equipe?ok=1");
}

async function salvarParceiro(fd: FormData) {
  "use server";
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id")) || null;
  const nome = String(fd.get("nome") ?? "").trim().slice(0, 80);
  const contato = String(fd.get("contato") ?? "").trim().slice(0, 120);
  const pct = Number(String(fd.get("repasse") ?? "0").replace(",", "."));
  if (nome.length < 2 || !Number.isFinite(pct) || pct < 0 || pct > 100) redirect("/painel/equipe?erro=parceiro_dados");
  if (id) await sql`UPDATE parceiros SET nome = ${nome}, contato = ${contato}, repasse_pct = ${pct} WHERE id = ${id}`;
  else await sql`INSERT INTO parceiros (nome, contato, repasse_pct) VALUES (${nome}, ${contato}, ${pct})`;
  await audit(`usuario:${u.id}`, id ? "parceiro_editado" : "parceiro_criado", "parceiro", id, nome);
  redirect("/painel/equipe?ok=parceiro");
}

const ERROS: Record<string, string> = {
  dados: "Confira nome e e-mail.",
  email: "Já existe alguém com este e-mail.",
  parceiro: "Perfil parceiro precisa de um parceiro cadastrado (cadastre abaixo primeiro).",
  parceiro_dados: "Confira o nome do parceiro e o repasse (0 a 100%).",
  proprio: "Você não pode tirar o seu próprio acesso de administrador nem se desativar.",
};

const DESCRICAO: Record<Perfil, string> = {
  admin: "Tudo: estações, comandos, equipe e configurações.",
  operador: "Opera estações e recargas (comandos remotos). Não mexe em equipe nem cadastro.",
  parceiro: "Só as estações do próprio parceiro, sem comandos.",
};

export default async function Equipe({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; nova?: string }> }) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const pessoas = await sql<Pessoa[]>`
    SELECT u.id, u.nome, u.email, u.perfil, u.parceiro_id, p.nome AS parceiro, u.ativo, u.ultimo_acesso
    FROM usuarios u LEFT JOIN parceiros p ON p.id = u.parceiro_id ORDER BY u.ativo DESC, u.perfil, u.nome`;
  const parceiros = await sql<{ id: number; nome: string; contato: string; repasse_pct: string; estacoes: number }[]>`
    SELECT p.id, p.nome, p.contato, p.repasse_pct::text, (SELECT count(*)::int FROM estacoes e WHERE e.parceiro_id = p.id AND e.ativa) AS estacoes
    FROM parceiros p ORDER BY p.nome`;
  const novaId = Number(sp.nova) || 0;
  const nova = pessoas.find((p) => p.id === novaId);
  const senhaNova = nova ? await lerSegredo("usuario", nova.id) : "";

  const SelPerfil = ({ v, p }: { v?: Perfil; p?: number | null }) => (
    <>
      <select className="input" name="perfil" defaultValue={v ?? "operador"} style={{ height: 36 }}>
        {(["admin", "operador", "parceiro"] as Perfil[]).map((x) => <option key={x} value={x}>{PERFIL_NOME[x]}</option>)}
      </select>
      <select className="input" name="parceiro" defaultValue={p ?? ""} style={{ height: 36 }} title="Só para o perfil parceiro">
        <option value="">Parceiro (se for o caso)</option>
        {parceiros.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
      </select>
    </>
  );

  return (
    <>
      {sp.ok && <div className="aviso ok">{sp.ok === "parceiro" ? "Parceiro salvo." : "Salvo."}</div>}
      {sp.erro && <div className="aviso erro">{ERROS[sp.erro] ?? "Não foi possível salvar."}</div>}
      {nova && senhaNova && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-b">
            <b>Senha provisória de {nova.nome}</b>
            <p className="muted" style={{ fontSize: 12.5, margin: "4px 0 8px" }}>Aparece só agora. Repasse por um canal seguro; a pessoa troca em Minha conta depois de entrar.</p>
            <div className="segredo">{senhaNova}</div>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h"><h3>Equipe</h3><span className="muted" style={{ fontSize: 12.5 }}>{pessoas.filter((p) => p.ativo).length} ativos</span></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Pessoa</th><th>Perfil e parceiro</th><th>Último acesso</th><th></th></tr></thead>
            <tbody>
              {pessoas.map((p) => (
                <tr key={p.id} style={p.ativo ? undefined : { opacity: 0.55 }}>
                  <td colSpan={2}>
                    <form action={editar} className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <input type="hidden" name="id" value={p.id} />
                      <input className="input" name="nome" defaultValue={p.nome} maxLength={80} style={{ width: 180, height: 36 }} />
                      <span className="muted" style={{ fontSize: 12.5, width: 190, overflow: "hidden", textOverflow: "ellipsis" }}>{p.email}</span>
                      <SelPerfil v={p.perfil} p={p.parceiro_id} />
                      <button className="btn btn-ghost btn-sm">Salvar</button>
                    </form>
                  </td>
                  <td className="muted">{p.ultimo_acesso ? `há ${haQuanto(p.ultimo_acesso)}` : "nunca"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <form action={novaSenha}><input type="hidden" name="id" value={p.id} /><button className="btn btn-ghost btn-sm">Nova senha</button></form>
                      <form action={ativar}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="ativo" value={p.ativo ? "0" : "1"} />
                        <button className={`btn btn-sm ${p.ativo ? "btn-danger" : "btn-ghost"}`}>{p.ativo ? "Desativar" : "Reativar"}</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={convidar} className="panel-b" style={{ borderTop: "1px solid var(--line)" }}>
          <div className="box-title">Adicionar pessoa</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input className="input" name="nome" placeholder="Nome" required maxLength={80} style={{ width: 180, height: 36 }} />
            <input className="input" name="email" type="email" placeholder="E-mail" required maxLength={160} style={{ width: 220, height: 36 }} />
            <SelPerfil />
            <button className="btn btn-dark btn-sm">Adicionar</button>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            {(["admin", "operador", "parceiro"] as Perfil[]).map((x) => <div key={x}><b>{PERFIL_NOME[x]}:</b> {DESCRICAO[x]}</div>)}
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Parceiros (locais que hospedam estações)</h3></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Parceiro</th><th>Contato</th><th className="num">Repasse</th><th className="num">Estações</th><th></th></tr></thead>
            <tbody>
              {parceiros.length === 0 && <tr><td colSpan={5} className="muted">Nenhum parceiro cadastrado. Estações sem parceiro são da própria Viva.</td></tr>}
              {parceiros.map((p) => (
                <tr key={p.id}>
                  <td colSpan={3}>
                    <form action={salvarParceiro} className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <input type="hidden" name="id" value={p.id} />
                      <input className="input" name="nome" defaultValue={p.nome} maxLength={80} style={{ width: 200, height: 36 }} />
                      <input className="input" name="contato" defaultValue={p.contato} maxLength={120} placeholder="Contato" style={{ width: 200, height: 36 }} />
                      <input className="input mono" name="repasse" defaultValue={p.repasse_pct.replace(".", ",")} maxLength={6} style={{ width: 80, height: 36 }} />
                      <span className="muted">%</span>
                      <button className="btn btn-ghost btn-sm">Salvar</button>
                    </form>
                  </td>
                  <td className="num">{p.estacoes}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={salvarParceiro} className="panel-b" style={{ borderTop: "1px solid var(--line)" }}>
          <div className="box-title">Novo parceiro</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input className="input" name="nome" placeholder="Nome do local" required maxLength={80} style={{ width: 200, height: 36 }} />
            <input className="input" name="contato" placeholder="Contato" maxLength={120} style={{ width: 200, height: 36 }} />
            <input className="input mono" name="repasse" placeholder="Repasse %" maxLength={6} style={{ width: 110, height: 36 }} />
            <button className="btn btn-dark btn-sm">Cadastrar</button>
          </div>
        </form>
      </div>
    </>
  );
}
