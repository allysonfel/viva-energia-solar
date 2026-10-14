import Link from "next/link";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { hashPassword, SENHA_MINIMA } from "@/lib/auth";
import { cpfValido, celularValido } from "@/lib/cpf";
import { getMotorista, iniciarSessaoMotorista, destinoSeguro } from "@/lib/motorista";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { isBlocked, registerFailure } from "@/lib/limits";
import { TIPOS_CONECTOR } from "@/lib/ocpp/tipos";

// Cartão virtual: "M" + 12 caracteres aleatórios (idTag do OCPP aceita até 20).
const novoIdTag = () => "M" + Array.from(randomBytes(12), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

async function cadastrar(fd: FormData) {
  "use server";
  await ensureSchema();
  const voltar = destinoSeguro(fd.get("voltar"));
  const erro = (e: string) => redirect(`/cadastro?erro=${e}${voltar !== "/" ? `&voltar=${encodeURIComponent(voltar)}` : ""}`);
  // Freio contra cadastro em massa: 10 tentativas por IP a cada 15 min.
  const chaveIp = `cadastro:${await clientIp()}`;
  if (await isBlocked([[chaveIp, 10]])) erro("bloqueado");
  await registerFailure(chaveIp);

  const nome = String(fd.get("nome") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const cpf = cpfValido(fd.get("cpf"));
  const celular = celularValido(fd.get("celular"));
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const senha = String(fd.get("senha") ?? "");
  const veiculo = String(fd.get("veiculo") ?? "").trim().slice(0, 60);
  const conectores = fd.getAll("conectores").map(String).filter((c) => TIPOS_CONECTOR.includes(c)).slice(0, 6);
  if (nome.length < 2 || !nome.includes(" ")) erro("nome");
  if (!cpf) erro("cpf");
  if (!celular) erro("celular");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erro("email");
  if (senha.length < SENHA_MINIMA || senha.length > 200) erro("senha");
  if (fd.get("aceite") !== "1") erro("aceite");
  const [existe] = await sql`SELECT 1 FROM motoristas WHERE email = ${email} OR cpf = ${cpf}`;
  if (existe) erro("existe");

  const [m] = await sql<{ id: number; sessao_versao: number }[]>`
    INSERT INTO motoristas (nome, cpf, celular, email, senha_hash, veiculo, conectores, id_tag, aceita_promocoes, consentimento_em)
    VALUES (${nome}, ${cpf}, ${celular}, ${email}, ${hashPassword(senha)}, ${veiculo}, ${conectores}, ${novoIdTag()},
      ${fd.get("promocoes") === "1"}, now())
    RETURNING id, sessao_versao`;
  await audit(`motorista:${m.id}`, "cadastro", "motorista", m.id);
  await iniciarSessaoMotorista(m.id, m.sessao_versao);
  redirect(voltar === "/" ? "/carteira?bemvindo=1" : voltar);
}

const ERROS: Record<string, string> = {
  nome: "Informe nome e sobrenome.",
  cpf: "CPF inválido.",
  celular: "Celular inválido. Use DDD + número.",
  email: "E-mail inválido.",
  senha: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`,
  aceite: "Para criar a conta, aceite os termos e o aviso de privacidade.",
  existe: "Já existe uma conta com este e-mail ou CPF. Entre ou recupere a senha.",
  bloqueado: "Muitas tentativas seguidas. Aguarde 15 minutos.",
};

export default async function Cadastro({ searchParams }: { searchParams: Promise<{ erro?: string; voltar?: string }> }) {
  const q = await searchParams;
  const voltar = destinoSeguro(q.voltar);
  if (await getMotorista()) redirect(voltar);
  return (
    <form action={cadastrar}>
      <Link className="link row" href="/entrar" style={{ gap: 4, marginBottom: 16 }}>Voltar</Link>
      <h2>Criar conta</h2>
      <p className="sub">Leva menos de um minuto.</p>
      {q.erro && <div className="aviso erro">{ERROS[q.erro] ?? "Confira os dados."}</div>}
      <input type="hidden" name="voltar" value={voltar} />
      <div className="field"><label htmlFor="nome">Nome completo</label><input className="input" id="nome" name="nome" required maxLength={80} autoComplete="name" /></div>
      <div className="two">
        <div className="field"><label htmlFor="cpf">CPF</label><input className="input" id="cpf" name="cpf" required maxLength={14} inputMode="numeric" placeholder="000.000.000-00" /></div>
        <div className="field"><label htmlFor="celular">Celular</label><input className="input" id="celular" name="celular" required maxLength={16} inputMode="tel" placeholder="(83) 90000-0000" autoComplete="tel" /></div>
      </div>
      <div className="field"><label htmlFor="email">E-mail</label><input className="input" id="email" name="email" type="email" required maxLength={160} autoComplete="email" /></div>
      <div className="field"><label htmlFor="senha">Senha (mínimo {SENHA_MINIMA} caracteres)</label><input className="input" id="senha" name="senha" type="password" required minLength={SENHA_MINIMA} maxLength={200} autoComplete="new-password" /></div>
      <div className="field"><label htmlFor="veiculo">Seu veículo</label><input className="input" id="veiculo" name="veiculo" maxLength={60} placeholder="Ex.: BYD Dolphin" list="veiculos" /></div>
      <datalist id="veiculos">
        {["BYD Dolphin", "BYD Dolphin Mini", "BYD Seal", "BYD Song Plus", "BYD Yuan Plus", "Volvo EX30", "GWM Ora 03", "Renault Kwid E-Tech", "Chevrolet Bolt"].map((v) => <option key={v} value={v} />)}
      </datalist>
      <div className="field">
        <label>Conectores que o carro aceita</label>
        <div className="chips" style={{ flexWrap: "wrap" }}>
          {["CCS2", "Tipo 2", "CHAdeMO", "GB/T"].map((c) => (
            <label key={c} className="chip"><input type="checkbox" name="conectores" value={c} defaultChecked={c === "CCS2" || c === "Tipo 2"} /> {c}</label>
          ))}
        </div>
      </div>
      <label className="row" style={{ gap: 8, fontSize: 13, alignItems: "flex-start", marginBottom: 8 }}>
        <input type="checkbox" name="aceite" value="1" required style={{ marginTop: 3 }} />
        <span>Li e aceito os termos de uso e o <Link className="link" href="/privacidade" target="_blank">aviso de privacidade</Link>.</span>
      </label>
      <label className="row" style={{ gap: 8, fontSize: 13, marginBottom: 16 }}>
        <input type="checkbox" name="promocoes" value="1" /> Quero receber promoções e vouchers (opcional)
      </label>
      <button className="btn btn-volt btn-block">Criar conta e entrar</button>
    </form>
  );
}
