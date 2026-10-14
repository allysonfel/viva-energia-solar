import Link from "next/link";
import { redirect } from "next/navigation";
import { createHash } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { hashPassword, SENHA_MINIMA } from "@/lib/auth";
import { audit } from "@/lib/audit";

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

async function tokenValido(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const [r] = await sql<{ id: number; motorista_id: number }[]>`
    SELECT id, motorista_id FROM recuperacao_senha WHERE token_hash = ${hashToken(token)} AND usado_em IS NULL AND expira_em > now()`;
  return r ?? null;
}

async function redefinir(fd: FormData) {
  "use server";
  await ensureSchema();
  const token = String(fd.get("t") ?? "");
  const senha = String(fd.get("senha") ?? "");
  const r = await tokenValido(token);
  if (!r) redirect("/redefinir?erro=link");
  if (senha.length < SENHA_MINIMA || senha.length > 200) redirect(`/redefinir?t=${encodeURIComponent(token)}&erro=senha`);
  // Senha nova derruba as sessões abertas (versão nova) e o link não vale de novo.
  await sql.begin(async (tx) => {
    await tx`UPDATE recuperacao_senha SET usado_em = now() WHERE id = ${r.id}`;
    await tx`UPDATE motoristas SET senha_hash = ${hashPassword(senha)}, sessao_versao = sessao_versao + 1 WHERE id = ${r.motorista_id}`;
  });
  await audit(`motorista:${r.motorista_id}`, "senha_redefinida", "motorista", r.motorista_id);
  redirect("/entrar?ok=senha");
}

export default async function Redefinir({ searchParams }: { searchParams: Promise<{ t?: string; erro?: string }> }) {
  const q = await searchParams;
  await ensureSchema();
  const valido = q.t ? await tokenValido(q.t) : null;
  return (
    <form action={redefinir}>
      <h2>Nova senha</h2>
      {!valido ? (
        <>
          <div className="aviso erro">Este link expirou ou já foi usado. Peça outro.</div>
          <Link className="btn btn-dark btn-block" href="/recuperar">Pedir novo link</Link>
        </>
      ) : (
        <>
          <p className="sub">Crie uma senha com pelo menos {SENHA_MINIMA} caracteres.</p>
          {q.erro === "senha" && <div className="aviso erro">A senha precisa ter pelo menos {SENHA_MINIMA} caracteres.</div>}
          <input type="hidden" name="t" value={q.t} />
          <div className="field"><label htmlFor="senha">Nova senha</label><input className="input" id="senha" name="senha" type="password" required minLength={SENHA_MINIMA} maxLength={200} autoComplete="new-password" /></div>
          <button className="btn btn-volt btn-block">Salvar senha</button>
        </>
      )}
    </form>
  );
}
