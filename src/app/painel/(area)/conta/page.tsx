import { redirect } from "next/navigation";
import { requireUser, startSession, PERFIL_NOME } from "@/lib/session";
import { sql } from "@/lib/db";
import { hashPassword, verifyPassword, SENHA_MINIMA } from "@/lib/auth";
import { audit } from "@/lib/audit";

async function trocarSenha(fd: FormData) {
  "use server";
  const u = await requireUser();
  const atual = String(fd.get("atual") ?? "").slice(0, 200);
  const nova = String(fd.get("nova") ?? "");
  const [r] = await sql<{ senha_hash: string }[]>`SELECT senha_hash FROM usuarios WHERE id = ${u.id}`;
  if (!r || !verifyPassword(atual, r.senha_hash)) redirect("/painel/conta?erro=atual");
  if (nova.length < SENHA_MINIMA || nova.length > 200) redirect("/painel/conta?erro=curta");
  // Trocar a senha encerra as outras sessões (versão nova); esta continua.
  const [v] = await sql<{ v: number }[]>`
    UPDATE usuarios SET senha_hash = ${hashPassword(nova)}, sessao_versao = sessao_versao + 1 WHERE id = ${u.id} RETURNING sessao_versao AS v`;
  await startSession(u.id, v.v);
  await audit(`usuario:${u.id}`, "senha_trocada", "usuario", u.id);
  redirect("/painel/conta?ok=1");
}

export default async function Conta({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  return (
    <div style={{ maxWidth: 520 }}>
      {sp.ok && <div className="aviso ok">Senha trocada. As outras sessões foram encerradas.</div>}
      {sp.erro && <div className="aviso erro">{sp.erro === "atual" ? "Senha atual incorreta." : `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`}</div>}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-b">
          <b style={{ fontSize: 16 }}>{u.nome}</b>
          <div className="muted">{u.email} · {PERFIL_NOME[u.perfil]}{u.parceiro_nome ? ` · ${u.parceiro_nome}` : ""}</div>
        </div>
      </div>
      <form action={trocarSenha} className="panel">
        <div className="panel-h"><h3>Trocar senha</h3></div>
        <div className="panel-b">
          <div className="field"><label htmlFor="atual">Senha atual</label><input className="input" id="atual" name="atual" type="password" required maxLength={200} autoComplete="current-password" /></div>
          <div className="field"><label htmlFor="nova">Nova senha (mínimo {SENHA_MINIMA} caracteres)</label><input className="input" id="nova" name="nova" type="password" required minLength={SENHA_MINIMA} maxLength={200} autoComplete="new-password" /></div>
          <button className="btn btn-dark">Trocar senha</button>
        </div>
      </form>
    </div>
  );
}
