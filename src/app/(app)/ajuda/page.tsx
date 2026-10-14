import Link from "next/link";
import { requireMotorista } from "@/lib/motorista";
import { getSettings } from "@/lib/settings";
import { brl } from "@/lib/format";
import { Ic } from "@/components/Ic";

export default async function Ajuda() {
  await requireMotorista();
  const s = await getSettings();
  const faq: [string, string][] = [
    ["Como inicio uma recarga?", "Toque em Ler QR, aponte para o código no carregador e confirme. O cabo precisa estar conectado ao carro."],
    ["Preciso de saldo?", `Sim. A recarga é paga pela carteira do app: é preciso ter pelo menos ${brl(s.saldoMinimoCentavos)} para iniciar. Adicione crédito por Pix ou cartão.`],
    ["Como o valor é calculado?", "Você paga só a energia entregue ao carro (kWh) pela tarifa da estação. O valor aparece ao vivo durante a recarga."],
    ["A recarga parou sozinha", "Isso acontece quando a bateria chega ao limite do carro, quando o cabo é desconectado ou quando o saldo acaba. O valor cobrado é só da energia entregue."],
    ["Posso pedir o saldo de volta?", "Sim. O saldo não utilizado pode ser devolvido pelo mesmo meio de pagamento. Fale com a gente."],
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
        {s.suporteWhatsapp ? (
          <a className="btn btn-dark btn-block" href={`https://wa.me/${s.suporteWhatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>Canal de atendimento em configuração.</div>
        )}
      </div>
    </div>
  );
}
