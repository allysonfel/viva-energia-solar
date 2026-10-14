import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMotorista } from "@/lib/motorista";
import { recargaDoMotorista, CO2_POR_KWH } from "@/lib/app";
import { brl, kwh, duracao, quando } from "@/lib/format";
import { Ic } from "@/components/Ic";

const MOTIVO: Record<string, string> = {
  EVDisconnected: "Cabo desconectado do carro",
  Remote: "Encerrada pelo app",
  Local: "Encerrada no carregador",
  PowerLoss: "Queda de energia no local",
  EmergencyStop: "Parada de emergência",
  Reboot: "Carregador reiniciou",
  SoftReset: "Carregador reiniciou",
  HardReset: "Carregador reiniciou",
  Other: "Falha no carregador",
  NovaTransacao: "Encerrada pelo carregador",
};

export default async function Recibo({ params }: { params: Promise<{ id: string }> }) {
  const m = await requireMotorista();
  const r = await recargaDoMotorista(Number((await params).id), m.id);
  if (!r) notFound();
  if (r.status === "em_andamento") redirect(`/recarga/${r.id}`);
  const interrompida = r.status === "interrompida";
  return (
    <div className="sec-pad">
      <div className="receipt">
        <div className="rh">
          <div className="ok" style={interrompida ? { background: "var(--amber-bg)", color: "#9A5E0B" } : undefined}><Ic n={interrompida ? "alert" : "check"} /></div>
          <h3 style={{ fontSize: 20, fontWeight: 800 }}>{interrompida ? "Recarga interrompida" : "Recarga concluída"}</h3>
          <div className="muted" style={{ fontSize: 13 }}>{r.estacao} · {quando(r.inicio)}</div>
        </div>
        <div className="rl">
          <div><span className="muted">Recarga</span><span>#{r.id}</span></div>
          <div><span className="muted">Energia entregue</span><span>{kwh(r.energia_wh)} kWh</span></div>
          <div><span className="muted">Duração</span><span>{duracao(r.inicio, r.fim)}</span></div>
          <div><span className="muted">Tarifa</span><span>{brl(r.preco_kwh_centavos)}/kWh</span></div>
          {r.motivo_fim && <div><span className="muted">Fim</span><span>{r.parada_solicitada ? "Saldo da carteira acabou" : MOTIVO[r.motivo_fim] ?? r.motivo_fim}</span></div>}
          <div><span className="muted">CO₂ evitado</span><span>{kwh(r.energia_wh * CO2_POR_KWH)} kg</span></div>
          <div><span>Total</span><span>{brl(r.valor_centavos)}</span></div>
        </div>
      </div>
      {interrompida && <div className="aviso alerta" style={{ marginTop: 12 }}>Você pagou só a energia entregue. Se precisar, fale com a gente em Ajuda.</div>}
      <div className="box" style={{ marginTop: 12 }}>
        <div className="between"><span className="muted">Saldo na carteira</span><b className="mono">{brl(m.saldo_centavos)}</b></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Link className="btn btn-ghost" href="/historico">Minhas recargas</Link>
        <Link className="btn btn-dark" href="/">Voltar ao mapa</Link>
      </div>
    </div>
  );
}
