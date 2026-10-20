import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getSettings, saveSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { centavosDe } from "@/lib/format";
import { cnpjValido, cnpjFormatado } from "@/lib/cpf";
import { EMAIL } from "@/lib/settings";

const faixa = (v: FormDataEntryValue | null, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

async function salvar(fd: FormData) {
  "use server";
  const u = await requireUser(["admin"]);
  const empresa = String(fd.get("empresa") ?? "").trim().slice(0, 40);
  const offlineMinutos = faixa(fd.get("offline"), 1, 120);
  const heartbeatSeg = faixa(fd.get("heartbeat"), 10, 3600);
  const leituraSeg = faixa(fd.get("leitura"), 5, 600);
  const saldoMinimoCentavos = centavosDe(fd.get("saldo_minimo"));
  let suporteWhatsapp = String(fd.get("whatsapp") ?? "").replace(/\D/g, "");
  if (suporteWhatsapp.length === 10 || suporteWhatsapp.length === 11) suporteWhatsapp = "55" + suporteWhatsapp;
  if (empresa.length < 2 || offlineMinutos === null || heartbeatSeg === null || leituraSeg === null) redirect("/painel/configuracoes?erro=1");
  if (saldoMinimoCentavos === null || saldoMinimoCentavos < 100 || saldoMinimoCentavos > 50000) redirect("/painel/configuracoes?erro=1");
  if (suporteWhatsapp && !/^\d{12,13}$/.test(suporteWhatsapp)) redirect("/painel/configuracoes?erro=1");
  const razaoSocial = String(fd.get("razao_social") ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
  const cnpjTexto = String(fd.get("cnpj") ?? "").trim();
  const cnpj = cnpjTexto ? cnpjValido(cnpjTexto) : "";
  const suporteEmail = String(fd.get("email_suporte") ?? "").trim().toLowerCase().slice(0, 254);
  if (cnpj === null || (suporteEmail && !EMAIL.test(suporteEmail))) redirect("/painel/configuracoes?erro=1");
  const taxa = Number(String(fd.get("taxa") ?? "").replace(",", "."));
  if (!Number.isFinite(taxa) || taxa < 0 || taxa > 15) redirect("/painel/configuracoes?erro=1");
  await saveSettings({ empresa, offlineMinutos, heartbeatSeg, leituraSeg, saldoMinimoCentavos, suporteWhatsapp, suporteEmail, razaoSocial, cnpj, taxaPagamentoBp: Math.round(taxa * 100) });
  await audit(`usuario:${u.id}`, "configuracoes_salvas", null, null, `offline ${offlineMinutos} min, heartbeat ${heartbeatSeg} s, leitura ${leituraSeg} s`);
  redirect("/painel/configuracoes?ok=1");
}

export default async function Configuracoes({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const s = await getSettings();
  return (
    <form action={salvar} className="panel" style={{ maxWidth: 640 }}>
      <div className="panel-h"><h3>Operação</h3></div>
      <div className="panel-b">
        {sp.ok && <div className="aviso ok">Configurações salvas.</div>}
        {sp.erro && <div className="aviso erro">Confira os valores (fora da faixa permitida, CNPJ ou e-mail inválido).</div>}
        <div className="field"><label htmlFor="empresa">Nome da empresa</label><input className="input" id="empresa" name="empresa" defaultValue={s.empresa} maxLength={40} required /></div>
        <div className="field"><label htmlFor="razao_social">Razão social (aparece na carteira e nas políticas do app)</label><input className="input" id="razao_social" name="razao_social" defaultValue={s.razaoSocial} maxLength={100} /></div>
        <div className="field"><label htmlFor="cnpj">CNPJ</label><input className="input mono" id="cnpj" name="cnpj" defaultValue={s.cnpj ? cnpjFormatado(s.cnpj) : ""} maxLength={18} placeholder="00.000.000/0000-00" inputMode="numeric" /></div>
        <div className="field">
          <label htmlFor="offline">Avisar estação offline depois de (minutos)</label>
          <input className="input mono" id="offline" name="offline" type="number" min={1} max={120} defaultValue={s.offlineMinutos} />
        </div>
        <div className="field">
          <label htmlFor="heartbeat">Intervalo do Heartbeat dos carregadores (segundos)</label>
          <input className="input mono" id="heartbeat" name="heartbeat" type="number" min={10} max={3600} defaultValue={s.heartbeatSeg} />
        </div>
        <div className="field">
          <label htmlFor="leitura">Intervalo das leituras do medidor durante a recarga (segundos)</label>
          <input className="input mono" id="leitura" name="leitura" type="number" min={5} max={600} defaultValue={s.leituraSeg} />
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Heartbeat e leituras valem quando cada carregador se reconectar (são enviados no BootNotification).</p>
        <div className="box-title">App do motorista</div>
        <div className="field">
          <label htmlFor="saldo_minimo">Saldo mínimo para iniciar recarga (R$)</label>
          <input className="input mono" id="saldo_minimo" name="saldo_minimo" defaultValue={(s.saldoMinimoCentavos / 100).toFixed(2).replace(".", ",")} maxLength={8} />
        </div>
        <div className="field">
          <label htmlFor="whatsapp">WhatsApp do atendimento (aparece em Ajuda)</label>
          <input className="input mono" id="whatsapp" name="whatsapp" defaultValue={s.suporteWhatsapp} maxLength={16} placeholder="83 99999-0000" />
        </div>
        <div className="field">
          <label htmlFor="email_suporte">E-mail do atendimento (Ajuda e política de reembolso)</label>
          <input className="input" id="email_suporte" name="email_suporte" type="email" defaultValue={s.suporteEmail} maxLength={254} placeholder="atendimento@vivaenergia.com.br" />
        </div>
        <div className="box-title">Relatórios</div>
        <div className="field">
          <label htmlFor="taxa">Taxa média do pagamento (Pix + cartão), em %</label>
          <input className="input mono" id="taxa" name="taxa" defaultValue={String(s.taxaPagamentoBp / 100).replace(".", ",")} maxLength={6} />
        </div>
        <button className="btn btn-dark">Salvar</button>
      </div>
    </form>
  );
}
