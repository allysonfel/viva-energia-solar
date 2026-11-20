// E-mails da conta do motorista (2026-11-20): pedido de nova senha e aviso de
// senha alterada. Mesma identidade do recibo (verde-escuro, logo branca, botão
// verde-limão), um botão só, validade em destaque, "não foi você" e suporte no
// rodapé, sem propaganda. Sempre com versão em texto puro.
import "server-only";
import { enviarEmail } from "./email";
import { getSettings } from "./settings";

const TZ = "America/Sao_Paulo";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const base = () => (process.env.APP_URL ?? "").replace(/\/$/, "");
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || "";
const quando = (d: Date) => {
  const dia = d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
};

type Suporte = { whatsapp: string; email: string; texto: string; html: string };
async function dadosEmpresa() {
  const s = await getSettings();
  const zap = s.suporteWhatsapp.replace(/\D/g, "");
  const suporte: Suporte = {
    whatsapp: zap ? `https://wa.me/${zap}` : "",
    email: s.suporteEmail,
    texto: [zap ? `WhatsApp: https://wa.me/${zap}` : "", s.suporteEmail ? `E-mail: ${s.suporteEmail}` : ""].filter(Boolean).join("\n"),
    html: [
      zap ? `<a href="https://wa.me/${zap}" style="color:#C4F53A;text-decoration:none">WhatsApp</a>` : "",
      s.suporteEmail ? `<a href="mailto:${esc(s.suporteEmail)}" style="color:#C4F53A;text-decoration:none">${esc(s.suporteEmail)}</a>` : "",
    ].filter(Boolean).join(" · "),
  };
  const legal = [s.razaoSocial, s.cnpj ? `CNPJ ${s.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}` : ""].filter(Boolean).join(" · ");
  return { empresa: s.empresa, suporte, legal };
}

// Molde único: topo com a logo, selo, título, texto, botão, observações e rodapé.
function molde(o: {
  empresa: string; titulo: string; selo: string; seloCor: [string, string]; paragrafos: string[];
  botao?: { texto: string; href: string }; destaque?: string; notas: string[]; suporte: Suporte; legal: string;
}) {
  const b = base();
  const p = (t: string) => `<p style="margin:0 0 12px;color:#3E4F47;font-size:15px;line-height:1.55">${t}</p>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.titulo)}</title></head>
<body style="margin:0;padding:0;background:#EEF8F2;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF8F2;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:#062A1E;padding:22px 28px"><img src="${b}/logo-viva-branco.png" alt="${esc(o.empresa)}" height="40" style="display:block;height:40px;width:auto;border:0"></td></tr>
<tr><td style="padding:26px 28px 4px">
<div style="display:inline-block;background:${o.seloCor[0]};color:${o.seloCor[1]};font-size:12px;font-weight:bold;padding:5px 12px;border-radius:99px">${esc(o.selo)}</div>
<h1 style="margin:14px 0 12px;font-size:22px;line-height:1.3;color:#062A1E">${esc(o.titulo)}</h1>
${o.paragrafos.map(p).join("\n")}
</td></tr>
${o.botao ? `<tr><td align="center" style="padding:10px 28px 6px"><a href="${o.botao.href}" style="display:inline-block;background:#C4F53A;color:#1E2A05;font-weight:bold;font-size:16px;text-decoration:none;padding:14px 30px;border-radius:12px">${esc(o.botao.texto)}</a></td></tr>` : ""}
${o.destaque ? `<tr><td align="center" style="padding:8px 28px 0;font-size:13px;color:#177148;font-weight:bold">${o.destaque}</td></tr>` : ""}
<tr><td style="padding:20px 28px 26px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F8F6;border-radius:12px"><tr><td style="padding:14px 16px;font-size:13px;line-height:1.55;color:#5B6B63">
${o.notas.map((n) => `<p style="margin:0 0 8px">${n}</p>`).join("\n")}
</td></tr></table>
</td></tr>
<tr><td style="background:#062A1E;padding:18px 28px;color:#A9C4B6;font-size:12px;line-height:1.7">
${o.suporte.html ? `Precisa de ajuda? ${o.suporte.html}<br>` : ""}${esc(o.empresa)}${o.legal ? ` · ${esc(o.legal)}` : ""}<br>Este é um e-mail automático, não responda.
</td></tr>
</table></td></tr></table></body></html>`;
}

export async function enviarEmailRedefinirSenha(para: string, nome: string, token: string): Promise<boolean> {
  const { empresa, suporte, legal } = await dadosEmpresa();
  const link = `${base()}/redefinir?t=${token}`;
  const nomeCurto = primeiroNome(nome);
  const texto = [
    `Olá${nomeCurto ? `, ${nomeCurto}` : ""}.`, "",
    `Recebemos um pedido para criar uma nova senha na sua conta ${empresa} (${para}).`,
    "Sua senha ainda não foi alterada.", "",
    "Para criar a nova senha, abra o link abaixo:", link, "",
    "O link vale por 30 minutos e só funciona uma vez.", "",
    "Não pediu? Pode ignorar este e-mail: sua senha continua a mesma e ninguém entra na sua conta sem ela.",
    ...(suporte.texto ? ["", "Precisa de ajuda?", suporte.texto] : []),
    "", empresa, "Este é um e-mail automático, não responda.",
  ].join("\n");
  const html = molde({
    empresa, legal, suporte,
    titulo: "Crie sua nova senha",
    selo: "Redefinir senha", seloCor: ["#E7F4EC", "#177148"],
    paragrafos: [
      `Olá${nomeCurto ? `, <b style="color:#062A1E">${esc(nomeCurto)}</b>` : ""}! Recebemos um pedido para criar uma nova senha na sua conta <b style="color:#062A1E">${esc(para)}</b>.`,
      "Sua senha ainda não foi alterada. Para criar a nova, toque no botão:",
    ],
    botao: { texto: "Criar nova senha", href: link },
    destaque: "O link vale por 30 minutos e só funciona uma vez.",
    notas: [
      "<b style=\"color:#062A1E\">Não pediu?</b> Pode ignorar este e-mail. Sua senha continua a mesma e ninguém entra na sua conta sem ela.",
      `O botão não abre? Copie e cole no navegador:<br><a href="${link}" style="color:#177148;word-break:break-all">${esc(link)}</a>`,
    ],
  });
  return enviarEmail(para, `Crie sua nova senha da ${empresa}`, texto, html);
}

export async function enviarEmailSenhaAlterada(para: string, nome: string, em: Date): Promise<boolean> {
  const { empresa, suporte, legal } = await dadosEmpresa();
  const nomeCurto = primeiroNome(nome);
  const momento = quando(em);
  const texto = [
    `Olá${nomeCurto ? `, ${nomeCurto}` : ""}.`, "",
    `A senha da sua conta ${empresa} (${para}) foi alterada em ${momento}.`,
    "Por segurança, encerramos as sessões abertas nos outros aparelhos.", "",
    "Foi você? Então está tudo certo, não precisa fazer nada.", "",
    `Não foi você? Fale com a gente agora${suporte.texto ? ":\n" + suporte.texto : " pelo app, em Ajuda."}`,
    "", empresa, "Este é um e-mail automático, não responda.",
  ].join("\n");
  const html = molde({
    empresa, legal, suporte,
    titulo: "Sua senha foi alterada",
    selo: "Aviso de segurança", seloCor: ["#FFF3D6", "#9A5E0B"],
    paragrafos: [
      `Olá${nomeCurto ? `, <b style="color:#062A1E">${esc(nomeCurto)}</b>` : ""}! A senha da sua conta <b style="color:#062A1E">${esc(para)}</b> foi alterada em <b style="color:#062A1E">${esc(momento)}</b>.`,
      "Por segurança, encerramos as sessões abertas nos outros aparelhos. Foi você? Então está tudo certo, não precisa fazer nada.",
    ],
    botao: suporte.whatsapp ? { texto: "Não fui eu: falar com o suporte", href: suporte.whatsapp } : undefined,
    notas: [
      suporte.whatsapp
        ? "<b style=\"color:#062A1E\">Não foi você?</b> Toque no botão acima e fale com a gente agora para bloquearmos o acesso."
        : "<b style=\"color:#062A1E\">Não foi você?</b> Fale com a gente agora pelo app, em Ajuda, para bloquearmos o acesso.",
      "Nunca pedimos sua senha por e-mail, WhatsApp ou telefone.",
    ],
  });
  return enviarEmail(para, `Sua senha da ${empresa} foi alterada`, texto, html);
}
