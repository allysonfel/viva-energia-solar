import { redirect } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { startSession, getUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { isBlocked, registerFailure, clearFailures, LIMITE_EMAIL, LIMITE_IP } from "@/lib/limits";
import { getSettings } from "@/lib/settings";
import { kwh, num } from "@/lib/format";
import { Ic } from "@/components/Ic";

async function login(fd: FormData) {
  "use server";
  await ensureSchema();
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const senha = String(fd.get("senha") ?? "").slice(0, 200);
  const chaveEmail = `login:${email}`;
  const chaveIp = `ip:${await clientIp()}`;
  if (await isBlocked([[chaveEmail, LIMITE_EMAIL], [chaveIp, LIMITE_IP]])) redirect("/painel/entrar?erro=bloqueado");

  const [u] = await sql<{ id: number; senha_hash: string; sessao_versao: number }[]>`
    SELECT id, senha_hash, sessao_versao FROM usuarios WHERE email = ${email} AND ativo`;
  if (!u || !verifyPassword(senha, u.senha_hash)) {
    await registerFailure(chaveEmail, chaveIp);
    await audit(`email:${email.slice(0, 3)}***`, "login_falhou");
    redirect("/painel/entrar?erro=1");
  }
  await clearFailures(chaveEmail);
  await sql`UPDATE usuarios SET ultimo_acesso = now() WHERE id = ${u.id}`;
  await startSession(u.id, u.sessao_versao, fd.get("manter") === "1");
  await audit(`usuario:${u.id}`, "login");
  redirect("/painel");
}

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string; esqueci?: string }> }) {
  if (await getUser()) redirect("/painel");
  const { erro, esqueci } = await searchParams;
  const s = await getSettings();
  const [n] = await sql<{ estacoes: number; wh: number; recargas: number }[]>`
    SELECT (SELECT count(*)::int FROM estacoes WHERE ativa) AS estacoes,
      coalesce((SELECT sum(energia_wh) FROM recargas WHERE inicio >= date_trunc('month', now())), 0)::bigint AS wh,
      (SELECT count(*)::int FROM recargas WHERE inicio >= date_trunc('month', now()) AND status <> 'recusada') AS recargas`;
  return (
    <div className="auth">
      <div className="auth-hero">
        <svg className="grid-lines" viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true">
          <g stroke="#C4F53A" strokeWidth="1" fill="none">
            <path d="M-20 620 C120 560 180 420 320 400 S520 300 640 180" />
            <path d="M-20 700 C140 640 220 500 360 470 S540 380 640 260" />
            <path d="M-20 540 C100 480 150 340 280 330 S500 220 640 100" />
          </g>
        </svg>
        <div className="brand">
          <span className="brand-mark"><Ic n="bolt" /></span>
          {s.empresa}
        </div>
        <div>
          <h1>Energia limpa na rua, controle total na mão.</h1>
          <p>Cada estação, cada recarga e cada kWh acompanhados em tempo real, com comando remoto dos carregadores.</p>
        </div>
        <div className="auth-stats">
          <div><b>{n.estacoes}</b><span>Estações ativas</span></div>
          <div><b>{kwh(n.wh, 0)}</b><span>kWh no mês</span></div>
          <div><b>{num(n.recargas)}</b><span>Recargas no mês</span></div>
        </div>
      </div>
      <div className="auth-form">
        <form className="auth-card" action={login}>
          <h2>Painel de gestão</h2>
          <p className="sub">Acesso da equipe {s.empresa} e parceiros.</p>
          {erro && <div className="aviso erro">{erro === "bloqueado" ? "Muitas tentativas. Aguarde 15 minutos." : "E-mail ou senha incorretos."}</div>}
          {esqueci && <div className="aviso info">Peça ao administrador uma senha provisória. Ele gera em Equipe, no seu nome.</div>}
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input className="input" id="email" type="email" name="email" required maxLength={160} autoComplete="username" />
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <input className="input" id="senha" type="password" name="senha" required maxLength={200} autoComplete="current-password" />
          </div>
          <div className="between" style={{ margin: "-4px 0 18px" }}>
            <label className="row" style={{ gap: 8, fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" name="manter" value="1" defaultChecked /> Manter conectado
            </label>
            <a className="link" href="/painel/entrar?esqueci=1">Esqueci minha senha</a>
          </div>
          <button className="btn btn-volt btn-block">Entrar</button>
          <div className="auth-foot">Acesso protegido. Cada usuário vê só o que o perfil permite.</div>
        </form>
      </div>
    </div>
  );
}
