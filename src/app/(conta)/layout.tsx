import { sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { kwh, num } from "@/lib/format";
import { Ic } from "@/components/Ic";

// Moldura das telas de entrar, cadastro e recuperação (visual do protótipo).
export default async function ContaLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const [n] = await sql<{ estacoes: number; wh: number; recargas: number }[]>`
    SELECT (SELECT count(*)::int FROM estacoes WHERE ativa) AS estacoes,
      coalesce((SELECT sum(energia_wh) FROM recargas WHERE inicio >= date_trunc('month', now())), 0)::bigint AS wh,
      (SELECT count(*)::int FROM recargas WHERE inicio >= date_trunc('month', now()) AND status <> 'recusada') AS recargas`;
  return (
    <div className="auth">
      <div className="auth-hero">
        <svg className="grid-lines" viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true">
          <g stroke="#C4F53A" strokeWidth="1" fill="none">
            <path d="M-20 620 C120 560 180 420 320 400 S520 300 640 180" />
            <path d="M-20 700 C140 640 220 500 360 470 S540 380 640 260" />
            <path d="M-20 540 C100 480 150 340 280 330 S500 220 640 100" />
          </g>
        </svg>
        <div className="brand">
          <span className="brand-mark"><Ic n="bolt" /></span>
          {s.empresa}
        </div>
        <div>
          <h1>Energia limpa na rua, controle total na mão.</h1>
          <p>Encontre uma estação, aponte a câmera para o QR code e recarregue. Você acompanha cada kWh em tempo real.</p>
        </div>
        <div className="auth-stats">
          <div><b>{n.estacoes}</b><span>Estações ativas</span></div>
          <div><b>{kwh(n.wh, 0)}</b><span>kWh no mês</span></div>
          <div><b>{num(n.recargas)}</b><span>Recargas no mês</span></div>
        </div>
      </div>
      <div className="auth-form">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}
