import Link from "next/link";
import type { Settings } from "@/lib/settings";
import { cnpjFormatado, celularFormatado } from "@/lib/cpf";

// Quem vende, como falar com a gente e quem intermedeia o pagamento: o
// intermediador (SyncPay) exige isso visível onde o motorista paga.
export function Empresa({ s, intermediador, politica = true }: { s: Settings; intermediador: string | null; politica?: boolean }) {
  const whats = s.suporteWhatsapp ? celularFormatado(s.suporteWhatsapp.slice(2)) : "";
  return (
    <div className="empresa-rodape">
      <div>
        <b>{s.razaoSocial || s.empresa}</b>
        {s.cnpj && <> · CNPJ {cnpjFormatado(s.cnpj)}</>}
      </div>
      {(whats || s.suporteEmail) && (
        <div>
          Atendimento:{" "}
          {whats && <a href={`https://wa.me/${s.suporteWhatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp {whats}</a>}
          {whats && s.suporteEmail && " · "}
          {s.suporteEmail && <a href={`mailto:${s.suporteEmail}`}>{s.suporteEmail}</a>}
        </div>
      )}
      {intermediador && <div>Pagamentos intermediados pela {intermediador}, que só processa a cobrança. O serviço e a devolução do saldo são de responsabilidade da {s.empresa}.</div>}
      {politica && (
        <div>
          <Link href="/reembolso">Política de reembolso</Link> · <Link href="/privacidade">Privacidade</Link>
        </div>
      )}
    </div>
  );
}
