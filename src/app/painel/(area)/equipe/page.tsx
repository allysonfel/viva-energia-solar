import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import Link from "next/link";
import { requireUser, PERFIL_NOME, ABAS, ABAS_COM_ESCOPO, abasPermitidas, type Perfil, type Aba } from "@/lib/session";
import { sql } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { guardarSegredo, lerSegredo } from "@/lib/segredo";
import { haQuanto } from "@/lib/format";
import { FormPessoa } from "./FormPessoa";

type Pessoa = { id: number; nome: string; email: string; perfil: Perfil; parceiro_id: number | null; parceiro: string | null; abas: string[] | null; ativo: boolean; ultimo_acesso: Date | null };

// Senha provisória legível (sem letras que confundem), mostrada uma vez para o admin repassar.
function senhaProvisoria(): string {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(12), (b) => a[b % a.length]).join("").replace(/(.{4})(?!$)/g, "$1-");
}

// Perfil, parceiro e abas lidos campo a campo. Admin não tem parceiro nem
// lista de abas (vê tudo); as abas marcadas ficam só entre as permitidas.
function lerPessoa(fd: FormData) {
  const p = String(fd.get("perfil") ?? "");
  const perfil: Perfil = p === "admin" ? "admin" : p === "parceiro" ? "parceiro" : "operador";
  const parceiro = perfil === "admin" ? null : Number(fd.get("parceiro")) || null;
  const permitidas = abasPermitidas(perfil, parceiro);
  const marcadas = fd.getAll("aba").map(String);
  return {
    nome: String(fd.get("nome") ?? "").trim().slice(0, 80),
    email: String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 160),
    perfil,
    parceiro,
    abas: perfil === "admin" ? null : permitidas.filter((a) => marcadas.includes(a)),
  };
}

const resumo = (p: ReturnType<typeof lerPessoa>) =>
  `${p.perfil}${p.parceiro ? ` parceiro ${p.parceiro}` : ""}${p.abas ? ` abas ${p.abas.join(",") || "nenhuma"}` : ""}`;

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
  if (p.parceiro && !(await parceiroValido(p.parceiro))) redirect("/painel/equipe?erro=parceiro");
  const [existe] = await sql`SELECT 1 FROM usuarios WHERE email = ${p.email}`;
  if (existe) redirect("/painel/equipe?erro=email");
  const senha = senhaProvisoria();
  const [n] = await sql<{ id: number }[]>`
    INSERT INTO usuarios (nome, email, senha_hash, perfil, parceiro_id, abas)
    VALUES (${p.nome}, ${p.email}, ${hashPassword(senha)}, ${p.perfil}, ${p.parceiro}, ${p.abas}) RETURNING id`;
  await audit(`usuario:${u.id}`, "usuario_criado", "usuario", n.id, resumo(p));
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
  if (p.parceiro && !(await parceiroValido(p.parceiro))) redirect("/painel/equipe?erro=parceiro");
  if (id === u.id && p.perfil !== "admin") redirect("/painel/equipe?erro=proprio");
  const r = await sql`
    UPDATE usuarios SET nome = ${p.nome}, perfil = ${p.perfil}, parceiro_id = ${p.parceiro}, abas = ${p.abas}, sessao_versao = sessao_versao + 1
    WHERE id = ${id} RETURNING id`;
  if (!r.length) redirect("/painel/equipe");
  await audit(`usuario:${u.id}`, "usuario_editado", "usuario", id, resumo(p));
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
  parceiro: "Escolha o parceiro em \"Estações que vê\" (se ele ainda não existe, cadastre em Parceiros, mais abaixo).",
  parceiro_dados: "Confira o nome do parceiro e o repasse (0 a 100%).",
  proprio: "Você não pode tirar o seu próprio acesso de administrador nem se desativar.",
};

export default async function Equipe({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; nova?: string; editar?: string; adicionar?: string }> }) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const pessoas = await sql<Pessoa[]>`
    SELECT u.id, u.nome, u.email, u.perfil, u.parceiro_id, p.nome AS parceiro, u.abas, u.ativo, u.ultimo_acesso
    FROM usuarios u LEFT JOIN parceiros p ON p.id = u.parceiro_id ORDER BY u.ativo DESC, u.perfil, u.nome`;
  const parceiros = await sql<{ id: number; nome: string; contato: string; repasse_pct: string; estacoes: number }[]>`
    SELECT p.id, p.nome, p.contato, p.repasse_pct::text, (SELECT count(*)::int FROM estacoes e WHERE e.parceiro_id = p.id AND e.ativa) AS estacoes
    FROM parceiros p ORDER BY p.nome`;
  const novaId = Number(sp.nova) || 0;
  const nova = pessoas.find((p) => p.id === novaId);
  const senhaNova = nova ? await lerSegredo("usuario", nova.id) : "";

  const abas = (Object.keys(ABAS) as Aba[]).map((id) => ({ id, nome: ABAS[id], escopo: ABAS_COM_ESCOPO.includes(id) }));
  const listaParceiros = parceiros.map((x) => ({ id: x.id, nome: x.nome }));
  // Abas que a pessoa vê de fato (mesma regra do login).
  const abasDe = (p: Pessoa) => {
    const permitidas = abasPermitidas(p.perfil, p.parceiro_id);
    return p.perfil === "admin" || !p.abas ? permitidas : permitidas.filter((a) => p.abas!.includes(a));
  };
  const editando = pessoas.find((p) => p.id === Number(sp.editar));

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

      {(editando || sp.adicionar) && (
        <div className="panel" style={{ marginBottom: 16 }} id="pessoa">
          <div className="panel-h"><h3>{editando ? `Editar ${editando.nome}` : "Adicionar pessoa"}</h3><Link className="link" href="/painel/equipe">Cancelar</Link></div>
          <div className="panel-b">
            <FormPessoa
              key={editando?.id ?? "nova"}
              acao={editando ? editar : convidar}
              abas={abas}
              parceiros={listaParceiros}
              pessoa={editando ? { id: editando.id, nome: editando.nome, email: editando.email, perfil: editando.perfil, parceiro_id: editando.parceiro_id, abas: abasDe(editando) } : undefined}
            />
          </div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h">
          <h3>Equipe</h3>
          <div className="row" style={{ gap: 12 }}>
            <span className="muted" style={{ fontSize: 12.5 }}>{pessoas.filter((p) => p.ativo).length} ativos</span>
            {!sp.adicionar && <Link className="btn btn-dark btn-sm" href="/painel/equipe?adicionar=1#pessoa">Adicionar pessoa</Link>}
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Pessoa</th><th>Perfil</th><th>Estações</th><th>Abas</th><th>Último acesso</th><th></th></tr></thead>
            <tbody>
              {pessoas.map((p) => (
                <tr key={p.id} style={p.ativo ? undefined : { opacity: 0.55 }}>
                  <td><b>{p.nome}</b><div className="muted" style={{ fontSize: 12 }}>{p.email}</div></td>
                  <td>{PERFIL_NOME[p.perfil]}</td>
                  <td className="muted">{p.perfil === "admin" || !p.parceiro ? "Todas" : `Só ${p.parceiro}`}</td>
                  <td className="muted" style={{ fontSize: 12.5, minWidth: 180, maxWidth: 280, whiteSpace: "normal" }}>
                    {p.perfil === "admin" ? "Todas" : abasDe(p).map((a) => ABAS[a]).join(", ") || "Só visão geral"}
                  </td>
                  <td className="muted">{p.ultimo_acesso ? `há ${haQuanto(p.ultimo_acesso)}` : "nunca"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <Link className="btn btn-ghost btn-sm" href={`/painel/equipe?editar=${p.id}#pessoa`}>Editar</Link>
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
