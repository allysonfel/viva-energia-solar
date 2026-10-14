import Link from "next/link";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { clientIp } from "@/lib/request";
import { isBlocked, registerFailure } from "@/lib/limits";
import { enviarEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";

// Pede o link de redefinição. A resposta é sempre a mesma (não revela se o
// e-mail tem conta). O token vale 30 minutos e só o hash fica no banco.
async function pedir(fd: FormData) {
  "use server";
  await ensureSchema();
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const chaveIp = `recuperar:${await clientIp()}`;
  if (await isBlocked([[chaveIp, 5], [`recuperar:${email}`, 3]])) redirect("/recuperar?enviado=1");
  await registerFailure(chaveIp, `recuperar:${email}`);
  const [m] = await sql<{ id: number; nome: string }[]>`SELECT id, nome FROM motoristas WHERE email = ${email} AND ativo`;
  if (m) {
    const token = randomBytes(32).toString("base64url");
    await sql`
      INSERT INTO recuperacao_senha (motorista_id, token_hash, expira_em)
      VALUES (${m.id}, ${createHash("sha256").update(token).digest("hex")}, now() + interval '30 minutes')`;
    const s = await getSettings();
    const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
    await enviarEmail(email, `${s.empresa}: redefinir senha`,
      `Olá, ${m.nome.split(" ")[0]}.\n\nPara criar uma senha nova, abra o link abaixo (vale por 30 minutos):\n${base}/redefinir?t=${token}\n\nSe não foi você, ignore este e-mail.`);
  }
  redirect("/recuperar?enviado=1");
}

export default async function Recuperar({ searchParams }: { searchParams: Promise<{ enviado?: string }> }) {
  const { enviado } = await searchParams;
  return (
    <form action={pedir}>
      <Link className="link row" href="/entrar" style={{ gap: 4, marginBottom: 16 }}>Voltar</Link>
      <h2>Recuperar senha</h2>
      <p className="sub">Enviaremos um link seguro para redefinir sua senha.</p>
      {enviado ? (
        <div className="aviso ok">Se houver uma conta com esse e-mail, o link chega em instantes. Confira também a caixa de spam.</div>
      ) : (
        <>
          <div className="field"><label htmlFor="email">E-mail cadastrado</label><input className="input" id="email" name="email" type="email" required maxLength={160} /></div>
          <button className="btn btn-dark btn-block">Enviar link</button>
        </>
      )}
    </form>
  );
}
