import Link from "next/link";
import { redirect } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { getMotorista, iniciarSessaoMotorista, destinoSeguro } from "@/lib/motorista";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { isBlocked, registerFailure, clearFailures, LIMITE_EMAIL, LIMITE_IP } from "@/lib/limits";

async function entrar(fd: FormData) {
  "use server";
  await ensureSchema();
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const senha = String(fd.get("senha") ?? "").slice(0, 200);
  const voltar = destinoSeguro(fd.get("voltar"));
  const chaveEmail = `app:${email}`;
  const chaveIp = `ip:${await clientIp()}`;
  const q = voltar !== "/" ? `&voltar=${encodeURIComponent(voltar)}` : "";
  if (await isBlocked([[chaveEmail, LIMITE_EMAIL], [chaveIp, LIMITE_IP]])) redirect(`/entrar?erro=bloqueado${q}`);
  const [m] = await sql<{ id: number; senha_hash: string; sessao_versao: number }[]>`
    SELECT id, senha_hash, sessao_versao FROM motoristas WHERE email = ${email} AND ativo`;
  if (!m || !verifyPassword(senha, m.senha_hash)) {
    await registerFailure(chaveEmail, chaveIp);
    redirect(`/entrar?erro=1${q}`);
  }
  await clearFailures(chaveEmail);
  await sql`UPDATE motoristas SET ultimo_acesso = now() WHERE id = ${m.id}`;
  await iniciarSessaoMotorista(m.id, m.sessao_versao);
  await audit(`motorista:${m.id}`, "login");
  redirect(voltar);
}

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string; voltar?: string; ok?: string }> }) {
  const q = await searchParams;
  const voltar = destinoSeguro(q.voltar);
  if (await getMotorista()) redirect(voltar);
  return (
    <form action={entrar}>
      <h2>Bora recarregar</h2>
      <p className="sub">Entre para ver as estações perto de você.</p>
      {q.erro && <div className="aviso erro">{q.erro === "bloqueado" ? "Muitas tentativas. Aguarde 15 minutos." : "E-mail ou senha incorretos."}</div>}
      {q.ok === "senha" && <div className="aviso ok">Senha redefinida. Entre com a nova senha.</div>}
      {q.ok === "excluida" && <div className="aviso ok">Conta excluída. Seus dados pessoais foram apagados.</div>}
      {voltar.startsWith("/e/") && <div className="aviso info">Entre para iniciar a recarga nesta estação.</div>}
      <input type="hidden" name="voltar" value={voltar} />
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input className="input" id="email" type="email" name="email" required maxLength={160} autoComplete="username" />
      </div>
      <div className="field">
        <label htmlFor="senha">Senha</label>
        <input className="input" id="senha" type="password" name="senha" required maxLength={200} autoComplete="current-password" />
      </div>
      <div className="between" style={{ margin: "-4px 0 18px" }}>
        <span />
        <Link className="link" href="/recuperar">Esqueci minha senha</Link>
      </div>
      <button className="btn btn-volt btn-block">Entrar</button>
      <div className="auth-foot">
        Primeira vez por aqui? <Link className="link" href={`/cadastro${voltar !== "/" ? `?voltar=${encodeURIComponent(voltar)}` : ""}`}>Criar conta</Link>
      </div>
      <div className="auth-foot" style={{ marginTop: 6 }}>
        É da equipe? <Link className="link" href="/painel/entrar">Painel de gestão</Link>
      </div>
    </form>
  );
}
