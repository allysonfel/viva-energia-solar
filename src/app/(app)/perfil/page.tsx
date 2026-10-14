import Link from "next/link";
import { requireMotorista } from "@/lib/motorista";
import { cpfMascarado, celularFormatado } from "@/lib/cpf";
import { iniciais } from "@/lib/format";
import { SENHA_MINIMA } from "@/lib/auth";
import { Ic } from "@/components/Ic";
import { salvarPerfil, trocarSenhaApp, sairApp } from "../acoes";

const MSG: Record<string, [string, string]> = {
  "ok:1": ["ok", "Perfil salvo."],
  "ok:senha": ["ok", "Senha trocada. Outras sessões foram encerradas."],
  "erro:celular": ["erro", "Celular inválido."],
  "erro:atual": ["erro", "Senha atual incorreta."],
  "erro:nova": ["erro", `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`],
};

export default async function Perfil({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const m = await requireMotorista();
  const q = await searchParams;
  const msg = q.ok ? MSG[`ok:${q.ok}`] : q.erro ? MSG[`erro:${q.erro}`] : null;
  return (
    <div className="sec-pad">
      {msg && <div className={`aviso ${msg[0]}`}>{msg[1]}</div>}
      <div className="profile-head">
        <div className="avatar">{iniciais(m.nome)}</div>
        <div>
          <b style={{ fontSize: 17 }}>{m.nome}</b>
          <div className="muted" style={{ fontSize: 13 }}>{m.email} · {celularFormatado(m.celular)}</div>
          <div className="muted" style={{ fontSize: 12 }}>CPF {cpfMascarado(m.cpf)}</div>
        </div>
      </div>

      <form action={salvarPerfil} className="box">
        <div className="box-title">Meu veículo e contato</div>
        <div className="field"><label htmlFor="veiculo">Veículo</label><input className="input" id="veiculo" name="veiculo" defaultValue={m.veiculo} maxLength={60} /></div>
        <div className="two">
          <div className="field"><label htmlFor="placa">Placa</label><input className="input mono" id="placa" name="placa" defaultValue={m.placa} maxLength={8} /></div>
          <div className="field"><label htmlFor="celular">Celular</label><input className="input" id="celular" name="celular" defaultValue={celularFormatado(m.celular)} maxLength={16} inputMode="tel" /></div>
        </div>
        <div className="field">
          <label>Conectores do carro</label>
          <div className="chips" style={{ flexWrap: "wrap" }}>
            {["CCS2", "Tipo 2", "CHAdeMO", "GB/T"].map((c) => (
              <label key={c} className="chip"><input type="checkbox" name="conectores" value={c} defaultChecked={m.conectores.includes(c)} /> {c}</label>
            ))}
          </div>
        </div>
        <label className="set-row" style={{ cursor: "pointer" }}>
          <div><b>Avisos de recarga</b><small>Quando começar, terminar ou parar</small></div>
          <input type="checkbox" name="avisos" value="1" defaultChecked={m.avisos_recarga} />
        </label>
        <label className="set-row" style={{ cursor: "pointer" }}>
          <div><b>Promoções e vouchers</b><small>Descontos por horário e novidades</small></div>
          <input type="checkbox" name="promocoes" value="1" defaultChecked={m.aceita_promocoes} />
        </label>
        <button className="btn btn-dark btn-block" style={{ marginTop: 10 }}>Salvar</button>
      </form>

      <div className="box" style={{ padding: "4px 16px" }}>
        <Link className="list-item" href="/ajuda" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="li-ic"><Ic n="help" /></span><div className="li-main"><b>Ajuda e suporte</b><small>Dúvidas frequentes e atendimento</small></div><Ic n="right" />
        </Link>
        <Link className="list-item" href="/privacidade" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="li-ic"><Ic n="shield" /></span><div className="li-main"><b>Privacidade e dados</b><small>Como usamos seus dados (LGPD)</small></div><Ic n="right" />
        </Link>
      </div>

      <form action={trocarSenhaApp} className="box">
        <div className="box-title">Trocar senha</div>
        <div className="field"><label htmlFor="atual">Senha atual</label><input className="input" id="atual" name="atual" type="password" required maxLength={200} autoComplete="current-password" /></div>
        <div className="field"><label htmlFor="nova">Nova senha</label><input className="input" id="nova" name="nova" type="password" required minLength={SENHA_MINIMA} maxLength={200} autoComplete="new-password" /></div>
        <button className="btn btn-ghost btn-block">Trocar senha</button>
      </form>

      <form action={sairApp}>
        <button className="btn btn-danger btn-block"><Ic n="logout" />Sair da conta</button>
      </form>
    </div>
  );
}
