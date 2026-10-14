// Envio de e-mail (recuperação de senha, recibo). Com RESEND_API_KEY usa o
// Resend; sem chave, em desenvolvimento escreve no log do servidor e em
// produção avisa que não enviou (a tela segue com mensagem genérica).
import "server-only";

export async function enviarEmail(para: string, assunto: string, texto: string): Promise<boolean> {
  const chave = process.env.RESEND_API_KEY?.trim();
  const de = process.env.EMAIL_REMETENTE?.trim() || "Viva Energia <nao-responda@vivaenergia.local>";
  if (!chave) {
    if (process.env.NODE_ENV !== "production") console.log(`[email simulado] para ${para}: ${assunto}\n${texto}`);
    else console.warn("[email] RESEND_API_KEY não configurada; e-mail não enviado");
    return false;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: de, to: [para], subject: assunto, text: texto }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.error("[email] falha no envio:", r.status);
    return r.ok;
  } catch (err) {
    console.error("[email] erro:", err instanceof Error ? err.message : err);
    return false;
  }
}
