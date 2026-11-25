import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { provedorPagamentos } from "@/lib/pagamentos";
import { Empresa } from "@/components/Empresa";
import { brl } from "@/lib/format";

// Gerada a cada acesso (usa os dados da empresa do banco; no build não há banco).
export const dynamic = "force-dynamic";

// Termos de uso que o motorista aceita no cadastro. Pedido do Miguel (2026-11-25):
// deixar claro que o valor pago vira crédito e fica na carteira para recargas futuras.
// TEXTO A REVISAR COM A VIVA ENERGIA.
export default async function Termos() {
  const s = await getSettings();
  const intermediador = provedorPagamentos().intermediador;
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 60px", height: "100%", overflow: "auto" }}>
      <Link className="link" href="/">Voltar</Link>
      <h1 style={{ fontSize: 26, margin: "16px 0 6px" }}>Termos de uso</h1>
      <p className="muted" style={{ marginBottom: 20 }}>{s.empresa} · app de recarga de veículos elétricos</p>
      {[
        ["O serviço", `O app mostra as estações de recarga da ${s.empresa}, libera a recarga no carregador escolhido e cobra pela carteira do app. Ao criar a conta, você aceita estes termos, o Aviso de privacidade e a Política de reembolso.`],
        ["Sua conta", "A conta é pessoal, no CPF do titular, com dados verdadeiros. Não compartilhe sua senha: recargas feitas com a sua conta são cobradas da sua carteira."],
        ["Crédito na carteira", "Todo valor pago por Pix ou cartão vira crédito na carteira do app, em reais, e é usado só para recargas nas estações da rede. O pagamento não é de uma recarga específica: é a compra de crédito."],
        ["O que sobra fica para a próxima recarga", "Cada recarga desconta da carteira só o que foi usado: a energia entregue ao carro pela tarifa da estação, mais a taxa de ativação e a taxa de ociosidade, quando a estação tiver. O crédito que não for usado numa recarga continua na carteira para as recargas seguintes e não expira. Ao adicionar crédito, você declara estar ciente e de acordo que o valor fica guardado na carteira para uso em recargas futuras."],
        ["Saldo para recarregar", `Para iniciar uma recarga é preciso ter pelo menos ${brl(s.saldoMinimoCentavos)} na carteira. Se o saldo acabar durante a recarga, ela é encerrada automaticamente e você paga só o que foi entregue.`],
        ["Devolução do saldo", "O pedido de devolução do saldo, a desistência em até 7 dias e a correção de cobrança errada seguem a Política de reembolso."],
        ["Uso das estações", "Siga as instruções da estação, use o conector compatível com o seu carro e retire o carro quando a recarga terminar, para liberar a vaga. Danos causados ao equipamento por mau uso podem ser cobrados."],
        ["Mudanças nestes termos", "Estes termos podem ser atualizados. A versão em vigor fica sempre nesta página, com o link no cadastro e na carteira."],
      ].map(([t, x]) => (
        <section key={t} style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, marginBottom: 6 }}>{t}</h2>
          <p style={{ lineHeight: 1.6 }}>{x}</p>
        </section>
      ))}
      <Empresa s={s} intermediador={intermediador} />
    </div>
  );
}
