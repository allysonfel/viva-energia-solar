import Link from "next/link";
import { requireMotorista } from "@/lib/motorista";
import { cpfMascarado, celularFormatado } from "@/lib/cpf";
import { iniciais } from "@/lib/format";
import { SENHA_MINIMA } from "@/lib/auth";
import { Ic } from "@/components/Ic";
import { salvarDados, salvarVeiculo, salvarTema, trocarSenhaApp, sairApp, excluirConta } from "../acoes";
import { FotoPerfil } from "./FotoPerfil";
import { temaDoMotorista } from "@/lib/tema";
import { inscreverPushApp } from "@/app/acoes-push";
import { vapidPublica } from "@/lib/push";
import { AtivarAvisos } from "@/components/AtivarAvisos";
import { BotaoSair } from "@/components/BotaoSair";

const MSG: Record<string, [string, string]> = {
  "ok:1": ["ok", "Veículo e preferências salvos."],
  "ok:dados": ["ok", "Dados atualizados."],
  "ok:foto": ["ok", "Foto removida."],
  "ok:tema": ["ok", "Aparência atualizada."],
  "erro:nome": ["erro", "Informe nome e sobrenome."],
  "erro:email": ["erro", "E-mail inválido."],
  "erro:email-uso": ["erro", "Esse e-mail já está em outra conta."],
  "erro:senha-email": ["erro", "Para trocar o e-mail, confirme com a sua senha atual."],
  "erro:bloqueado": ["erro", "Muitas tentativas com a senha errada. Espere 15 minutos."],
  "ok:senha": ["ok", "Senha trocada. Outras sessões foram encerradas."],
  "erro:celular": ["erro", "Celular inválido."],
  "erro:atual": ["erro", "Senha atual incorreta."],
  "erro:nova": ["erro", `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`],
  "erro:excluir": ["erro", "Para excluir, confirme marcando a caixa e digite sua senha."],
  "erro:saldo": ["erro", "Você ainda tem saldo na carteira. Peça a devolução em Ajuda antes de excluir a conta."],
  "erro:recarga": ["erro", "Encerre a recarga em andamento antes de excluir a conta."],
};

export default async function Perfil({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const m = await requireMotorista();
  const q = await searchParams;
  const msg = q.ok ? MSG[`ok:${q.ok}`] : q.erro ? MSG[`erro:${q.erro}`] : null;
  const tema = await temaDoMotorista();
  return (
    <div className="sec-pad">
      {msg && <div className={`aviso ${msg[0]}`}>{msg[1]}</div>}
      <div className="profile-head">
        <FotoPerfil iniciais={iniciais(m.nome)} fotoEm={m.foto_em ? new Date(m.foto_em).toISOString() : null} />
        <div>
          <b style={{ fontSize: 17 }}>{m.nome}</b>
          <div className="muted" style={{ fontSize: 13 }}>{m.email} · {celularFormatado(m.celular)}</div>
          <div className="muted" style={{ fontSize: 12 }}>CPF {cpfMascarado(m.cpf)}</div>
        </div>
      </div>

      <form action={salvarDados} className="box">
        <div className="box-title">Meus dados</div>
        <div className="field"><label htmlFor="nome">Nome completo</label><input className="input" id="nome" name="nome" defaultValue={m.nome} maxLength={80} required autoComplete="name" /></div>
        <div className="field"><label htmlFor="email">E-mail (usado para entrar)</label><input className="input" id="email" name="email" type="email" defaultValue={m.email} maxLength={160} required autoComplete="email" /></div>
        <div className="field"><label htmlFor="celular">Celular</label><input className="input" id="celular" name="celular" defaultValue={celularFormatado(m.celular)} maxLength={16} inputMode="tel" required autoComplete="tel" /></div>
        <details className="senha-email">
          <summary className="muted">Vai trocar o e-mail? Confirme com a senha</summary>
          <div className="field" style={{ marginTop: 8 }}><label htmlFor="senha-dados">Senha atual</label><input className="input" id="senha-dados" name="senha" type="password" maxLength={200} autoComplete="current-password" /></div>
        </details>
        <div className="muted" style={{ fontSize: 12, margin: "4px 0 10px" }}>O CPF não pode ser alterado pelo app. Se estiver errado, fale com o atendimento.</div>
        <button className="btn btn-dark btn-block">Salvar dados</button>
      </form>

      <form action={salvarVeiculo} className="box">
        <div className="box-title">Meu veículo</div>
        <div className="field"><label htmlFor="veiculo">Veículo</label><input className="input" id="veiculo" name="veiculo" defaultValue={m.veiculo} maxLength={60} /></div>
        <div className="field"><label htmlFor="placa">Placa</label><input className="input mono" id="placa" name="placa" defaultValue={m.placa} maxLength={8} /></div>
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

      <form action={salvarTema} className="box">
        <div className="box-title">Aparência</div>
        <div className="tema-opcoes">
          {([["auto", "Automático", "phone"], ["claro", "Claro", "sun"], ["escuro", "Escuro", "moon"]] as const).map(([v, rotulo, ic]) => (
            <button key={v} name="tema" value={v} className={tema === v ? "on" : ""} aria-pressed={tema === v}><Ic n={ic} />{rotulo}</button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>No automático, o app fica escuro quando o celular estiver no modo escuro.</div>
      </form>

      <div className="box" style={{ padding: "4px 16px" }}>
        <AtivarAvisos vapid={vapidPublica()} inscrever={inscreverPushApp} />
      </div>

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

      <div className="box">
        <div className="box-title">Seus dados (LGPD)</div>
        <a className="btn btn-ghost btn-block" href="/api/app/meus-dados"><Ic n="download" />Baixar meus dados</a>
        <details style={{ marginTop: 12 }}>
          <summary className="muted" style={{ fontSize: 13, cursor: "pointer" }}>Excluir minha conta</summary>
          <form action={excluirConta} style={{ marginTop: 10 }}>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Seus dados pessoais são apagados. O histórico de recargas e pagamentos fica guardado sem o seu nome, como exige a lei. Não dá para desfazer.</p>
            <label className="row" style={{ gap: 8, fontSize: 13, marginBottom: 8 }}><input type="checkbox" name="confirmo" value="1" /> Quero excluir minha conta</label>
            <div className="field"><label htmlFor="senha-exc">Sua senha</label><input className="input" id="senha-exc" name="senha" type="password" required maxLength={200} autoComplete="current-password" /></div>
            <button className="btn btn-danger btn-block">Excluir conta</button>
          </form>
        </details>
      </div>

      <BotaoSair acao={sairApp} className="btn btn-danger btn-block"><Ic n="logout" />Sair da conta</BotaoSair>
    </div>
  );
}
