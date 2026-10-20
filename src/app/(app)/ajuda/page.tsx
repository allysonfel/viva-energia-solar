import Link from "next/link";
import { requireMotorista } from "@/lib/motorista";
import { getSettings } from "@/lib/settings";
import { brl } from "@/lib/format";
import { Ic } from "@/components/Ic";
import { Empresa } from "@/components/Empresa";
import { provedorPagamentos } from "@/lib/pagamentos";

export default async function Ajuda() {
  await requireMotorista();
  const s = await getSettings();
  const faq: [string, string][] = [
    ["Como inicio uma recarga?", "Toque em Ler QR, aponte para o código no carregador e confirme. O cabo precisa estar conectado ao carro."],
    ["Preciso de saldo?", `Sim. A recarga é paga pela carteira do app: é preciso ter pelo menos ${brl(s.saldoMinimoCentavos)} para iniciar. Adicione crédito por Pix ou cartão.`],
    ["Como o valor é calculado?", "Você paga só a energia entregue ao carro (kWh) pela tarifa da estação. O valor aparece ao vivo durante a recarga."],
    ["Cheguei e a estação está ocupada", "O mapa mostra no topo as 2 estações livres mais perto de você (com a localização liberada) ou da região que está na tela. Na tela de cada estação também aparecem as livres mais próximas dela."],
    ["A recarga parou sozinha", "Isso acontece quando a bateria chega ao limite do carro, quando o cabo é desconectado ou quando o saldo acaba. O valor cobrado é só da energia entregue."],
    ["Posso pedir o saldo de volta?", "Sim, sem taxa. Peça pelo atendimento: devolvemos por Pix para uma chave no CPF do titular, em até 7 dias úteis. Crédito dos últimos 7 dias ainda não usado volta por inteiro. Detalhes na Política de reembolso, abaixo."],
    ["Uma recarga foi cobrada errado", "Avise o atendimento em até 30 dias com o número da recarga (está no recibo). Confirmado o erro, a diferença volta para a carteira em até 5 dias úteis."],
  ];
  return (
    <div className="sec-pad">
      <Link className="link row" href="/perfil" style={{ gap: 4, marginBottom: 10 }}><Ic n="back" />Perfil</Link>
      <div className="box" style={{ padding: "4px 16px" }}>
        {faq.map(([p, r]) => (
          <details key={p} className="faq">
            <summary>{p}<Ic n="right" /></summary>
            <p>{r}</p>
          </details>
        ))}
      </div>
      <div className="box">
        <div className="box-title">Falar com a gente</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Problema no carregador? Informe o código da estação (impresso no equipamento).</div>
        {s.suporteWhatsapp && (
          <a className="btn btn-dark btn-block" href={`https://wa.me/${s.suporteWhatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        )}
        {s.suporteEmail && (
          <a className="btn btn-ghost btn-block" href={`mailto:${s.suporteEmail}`} style={{ marginTop: 8 }}>E-mail: {s.suporteEmail}</a>
        )}
        {!s.suporteWhatsapp && !s.suporteEmail && <div className="muted" style={{ fontSize: 13 }}>Canal de atendimento em configuração.</div>}
      </div>
      <Empresa s={s} intermediador={provedorPagamentos().intermediador} />
    </div>
  );
}
