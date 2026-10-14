import Link from "next/link";
import { getSettings } from "@/lib/settings";

// Aviso de privacidade do app. TEXTO A REVISAR COM A VIVA ENERGIA antes de publicar.
export default async function Privacidade() {
  const s = await getSettings();
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 60px", height: "100%", overflow: "auto" }}>
      <Link className="link" href="/">Voltar</Link>
      <h1 style={{ fontSize: 26, margin: "16px 0 6px" }}>Aviso de privacidade</h1>
      <p className="muted" style={{ marginBottom: 20 }}>{s.empresa} · app de recarga de veículos elétricos</p>
      {[
        ["Quais dados usamos", "Nome, CPF, celular, e-mail, veículo e conectores, histórico de recargas (estação, horário, energia e valor), saldo e movimentos da carteira e, se você permitir, sua localização no momento (só no aparelho, para mostrar as estações mais perto; não guardamos)."],
        ["Para quê", "Criar e proteger sua conta, liberar e cobrar as recargas, emitir recibos, dar suporte, cumprir obrigações fiscais e, se você aceitar, enviar promoções e vouchers."],
        ["Pagamentos", "Pix e cartão são processados pelo intermediador de pagamento. O número completo do cartão não passa pelos nossos servidores nem fica guardado conosco."],
        ["Com quem compartilhamos", "Com o intermediador de pagamento (para cobrar) e com os parceiros donos dos locais das estações, apenas com números agregados de uso, sem seus dados pessoais."],
        ["Por quanto tempo", "Enquanto a conta estiver ativa e, depois, pelo prazo exigido por lei para registros fiscais e de consumo."],
        ["Seus direitos (LGPD)", "Você pode pedir acesso, correção, cópia ou exclusão dos seus dados e desistir das promoções a qualquer momento, pelo app (Perfil) ou pelo atendimento."],
      ].map(([t, x]) => (
        <section key={t} style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, marginBottom: 6 }}>{t}</h2>
          <p style={{ lineHeight: 1.6 }}>{x}</p>
        </section>
      ))}
    </div>
  );
}
