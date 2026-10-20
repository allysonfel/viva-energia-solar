import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { provedorPagamentos } from "@/lib/pagamentos";
import { Empresa } from "@/components/Empresa";

// Gerada a cada acesso (usa os dados da empresa do banco; no build não há banco).
export const dynamic = "force-dynamic";

// Política de reembolso do saldo. Regras definidas pela Logos (2026-10-20);
// TEXTO A REVISAR COM A VIVA ENERGIA antes do lançamento.
export default async function Reembolso() {
  const s = await getSettings();
  const intermediador = provedorPagamentos().intermediador;
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 60px", height: "100%", overflow: "auto" }}>
      <Link className="link" href="/carteira">Voltar</Link>
      <h1 style={{ fontSize: 26, margin: "16px 0 6px" }}>Política de reembolso</h1>
      <p className="muted" style={{ marginBottom: 20 }}>{s.empresa} · carteira pré-paga do app de recarga</p>
      {[
        ["Como funciona o saldo", "O crédito que você coloca na carteira fica guardado em reais e não expira. Cada recarga desconta só a energia entregue ao carro (kWh) pela tarifa da estação."],
        ["Desistência em até 7 dias", "Crédito colocado nos últimos 7 dias e ainda não usado pode ser devolvido por inteiro, sem precisar dar motivo (Código de Defesa do Consumidor, art. 49)."],
        ["Devolução do saldo a qualquer momento", "Depois desse prazo, o saldo que sobrou também pode ser devolvido, sem taxa. Peça pelo atendimento. A devolução é feita por Pix para uma chave no CPF do titular da conta, em até 7 dias úteis, e o valor sai da carteira assim que o pedido é aceito."],
        ["Cobrança errada numa recarga", "Se uma recarga foi cobrada sem entregar energia ou com valor que não confere, avise o atendimento em até 30 dias com o número da recarga (está no recibo). Confirmado o erro, a diferença volta para a carteira em até 5 dias úteis."],
        ["Vouchers e promoções", "Descontos de voucher e créditos promocionais valem só dentro do app e não são convertidos em dinheiro."],
        ["Encerrar a conta", "Para excluir a conta, a carteira precisa estar zerada. Se houver saldo, peça a devolução antes; a exclusão é feita logo depois."],
        ["Pagamento contestado", "Pix contestado no banco (MED) ou estornado depois do crédito: o valor correspondente sai da carteira e, se a carteira não tiver saldo, novas recargas ficam bloqueadas até a situação ser resolvida."],
      ].map(([t, x]) => (
        <section key={t} style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, marginBottom: 6 }}>{t}</h2>
          <p style={{ lineHeight: 1.6 }}>{x}</p>
        </section>
      ))}
      <Empresa s={s} intermediador={intermediador} politica={false} />
    </div>
  );
}
