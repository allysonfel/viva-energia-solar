// Recibo da recarga por e-mail (pedido do André, 2026-11-20): sai uma vez por
// recarga, quando ela fecha de vez (cobrada e, se a estação cobra ociosidade,
// depois do cabo sair). Identidade visual da Viva: verde-escuro, logo branca,
// botão verde-limão. Vai com versão em texto puro (entrega melhor).
import "server-only";
import { sql } from "./db";
import { enviarEmail } from "./email";
import { getSettings } from "./settings";
import { brl, kwh, duracao } from "./format";

type Dados = {
  id: number; status: string; inicio: Date; fim: Date | null; energia_wh: number; valor_centavos: number;
  preco_kwh_centavos: number; preco_cheio_centavos: number | null; tarifa_nome: string | null; desconto_pct: number;
  taxa_ativacao_centavos: number; ociosidade_minutos: number; ociosidade_centavos: number; motivo_fim: string | null;
  estacao: string; endereco: string; conector_numero: number; nome: string; email: string; saldo_centavos: number;
};

const TZ = "America/Sao_Paulo";
const dataHora = (d: Date) => d.toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Marca a recarga como enviada ANTES de mandar (uma vez só, mesmo com duas
// chamadas ao mesmo tempo). Não manda para estação simulada (demonstração).
export async function enviarReciboRecarga(recargaId: number): Promise<void> {
  const [r] = await sql<Dados[]>`
    UPDATE recargas r SET recibo_email_em = now()
    FROM estacoes e, motoristas m
    WHERE r.id = ${recargaId} AND e.id = r.estacao_id AND m.id = r.motorista_id
      AND r.recibo_email_em IS NULL AND r.status IN ('concluida', 'interrompida') AND r.valor_centavos > 0
      AND (r.ociosidade_status IS NULL OR r.ociosidade_status = 'cobrada')
      AND NOT e.simulada AND m.ativo AND m.email IS NOT NULL
    RETURNING r.id, r.status, r.inicio, r.fim, r.energia_wh, r.valor_centavos, r.preco_kwh_centavos, r.preco_cheio_centavos,
      r.tarifa_nome, r.desconto_pct, r.taxa_ativacao_centavos, r.ociosidade_minutos, r.ociosidade_centavos, r.motivo_fim,
      e.nome AS estacao, concat_ws(' · ', nullif(e.endereco, ''), nullif(e.bairro, ''), nullif(e.cidade, '')) AS endereco,
      r.conector_numero, m.nome, m.email, m.saldo_centavos`;
  if (!r) return;
  const s = await getSettings();
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const ativacao = r.energia_wh > 0 ? r.taxa_ativacao_centavos : 0;
  const energia = r.valor_centavos - ativacao - r.ociosidade_centavos;
  const interrompida = r.status === "interrompida";
  const titulo = interrompida ? "Recarga interrompida" : "Recarga concluída";
  const linhas: [string, string][] = [
    ["Recarga", `#${r.id}`],
    ["Estação", `${r.estacao} · conector ${r.conector_numero}`],
    ["Início", dataHora(r.inicio)],
    ["Duração", duracao(r.inicio, r.fim)],
    ["Energia entregue", `${kwh(r.energia_wh)} kWh`],
    [`Tarifa${r.tarifa_nome ? ` ${r.tarifa_nome.toLowerCase()}` : ""}`, `${brl(r.preco_cheio_centavos ?? r.preco_kwh_centavos)}/kWh`],
    ...(r.desconto_pct ? ([["Desconto do voucher", `-${r.desconto_pct}%`]] as [string, string][]) : []),
    ["Energia", brl(energia)],
    ...(ativacao ? ([["Taxa de ativação", brl(ativacao)]] as [string, string][]) : []),
    ...(r.ociosidade_centavos ? ([[`Ociosidade (${r.ociosidade_minutos} min)`, brl(r.ociosidade_centavos)]] as [string, string][]) : []),
  ];
  const primeiro = r.nome.trim().split(/\s+/)[0];
  const rodape = [s.razaoSocial, s.cnpj ? `CNPJ ${s.cnpj}` : "", s.suporteEmail, s.suporteWhatsapp ? `WhatsApp ${s.suporteWhatsapp}` : ""].filter(Boolean).join(" · ");

  const texto = [
    `Olá, ${primeiro}.`, "", `${titulo}. Seu recibo:`, "",
    ...linhas.map(([a, b]) => `${a}: ${b}`), `Total: ${brl(r.valor_centavos)}`, `Saldo na carteira: ${brl(r.saldo_centavos)}`, "",
    `Ver no app: ${base}/recibo/${r.id}`, "", s.empresa, rodape, "", "Este é um e-mail automático, não responda.",
  ].join("\n");

  const tr = (a: string, b: string) =>
    `<tr><td style="padding:9px 0;color:#5B6B63;font-size:14px;border-bottom:1px solid #E6ECE8">${esc(a)}</td><td align="right" style="padding:9px 0 9px 12px;font-size:14px;color:#062A1E;${/^[#R\-\d]/.test(b) ? "font-family:'Courier New',monospace;" : ""}border-bottom:1px solid #E6ECE8">${esc(b)}</td></tr>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#EEF8F2;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF8F2;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:#062A1E;padding:22px 28px"><img src="${base}/logo-viva-branco.png" alt="${esc(s.empresa)}" height="40" style="display:block;height:40px;width:auto;border:0"></td></tr>
<tr><td style="padding:26px 28px 6px">
<div style="display:inline-block;background:${interrompida ? "#FFF3D6" : "#C4F53A"};color:${interrompida ? "#9A5E0B" : "#1E2A05"};font-size:12px;font-weight:bold;padding:5px 12px;border-radius:99px">${esc(titulo)}</div>
<h1 style="margin:14px 0 4px;font-size:22px;color:#062A1E">Olá, ${esc(primeiro)}!</h1>
<p style="margin:0;color:#5B6B63;font-size:14px;line-height:1.5">Este é o recibo da sua recarga em <b style="color:#062A1E">${esc(r.estacao)}</b>${r.endereco ? `<br>${esc(r.endereco)}` : ""}.</p>
</td></tr>
<tr><td style="padding:14px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas.map(([a, b]) => tr(a, b)).join("")}
<tr><td style="padding:14px 0 4px;font-size:16px;font-weight:bold;color:#062A1E">Total</td><td align="right" style="padding:14px 0 4px;font-size:20px;font-weight:bold;color:#177148;font-family:'Courier New',monospace">${brl(r.valor_centavos)}</td></tr>
</table></td></tr>
<tr><td style="padding:10px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF8F2;border-radius:12px"><tr><td style="padding:12px 16px;font-size:14px;color:#5B6B63">Saldo na carteira</td><td align="right" style="padding:12px 16px;font-size:15px;font-weight:bold;color:#062A1E;font-family:'Courier New',monospace">${brl(r.saldo_centavos)}</td></tr></table></td></tr>
${interrompida ? `<tr><td style="padding:12px 28px 0;font-size:13px;color:#9A5E0B">Você pagou só pelo que foi entregue. Se precisar, fale com a gente pelo app, em Ajuda.</td></tr>` : ""}
<tr><td align="center" style="padding:24px 28px 28px"><a href="${base}/recibo/${r.id}" style="display:inline-block;background:#C4F53A;color:#1E2A05;font-weight:bold;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:12px">Ver recibo no app</a></td></tr>
<tr><td style="background:#062A1E;padding:18px 28px;color:#A9C4B6;font-size:12px;line-height:1.6">${esc(s.empresa)}${rodape ? `<br>${esc(rodape)}` : ""}<br>Este é um e-mail automático, não responda.</td></tr>
</table></td></tr></table></body></html>`;

  const ok = await enviarEmail(r.email, `${s.empresa}: recibo da recarga #${r.id} · ${brl(r.valor_centavos)}`, texto, html);
  // Não saiu (sem chave ou erro do provedor): libera para tentar de novo depois.
  if (!ok) await sql`UPDATE recargas SET recibo_email_em = NULL WHERE id = ${r.id}`;
}
