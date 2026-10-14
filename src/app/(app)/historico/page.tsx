import Link from "next/link";
import { requireMotorista } from "@/lib/motorista";
import { historico, CO2_POR_KWH } from "@/lib/app";
import { brl, kwh, duracao, quando } from "@/lib/format";
import { Ic } from "@/components/Ic";

export default async function Historico() {
  const m = await requireMotorista();
  const lista = await historico(m.id);
  const mesIni = new Date();
  mesIni.setDate(1);
  mesIni.setHours(0, 0, 0, 0);
  const doMes = lista.filter((r) => new Date(r.inicio) >= mesIni);
  const wh = doMes.reduce((s, r) => s + r.energia_wh, 0);
  const nomeMes = new Date().toLocaleDateString("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" });
  return (
    <div className="sec-pad">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div className="box" style={{ margin: 0 }}><small className="muted">Energia em {nomeMes}</small><div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{kwh(wh)} kWh</div></div>
        <div className="box" style={{ margin: 0 }}><small className="muted">CO₂ evitado</small><div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{kwh(wh * CO2_POR_KWH)} kg</div></div>
      </div>
      <div className="box">
        {lista.length === 0 && (
          <div className="empty">
            <div className="em-ic"><Ic n="bolt" /></div>
            <b>Nenhuma recarga ainda</b>
            <div className="muted" style={{ fontSize: 13 }}>Encontre uma estação no mapa e faça a primeira.</div>
          </div>
        )}
        {lista.map((r) => (
          <Link key={r.id} className="list-item" href={r.status === "em_andamento" ? `/recarga/${r.id}` : `/recibo/${r.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <span className="li-ic"><Ic n="bolt" /></span>
            <div className="li-main">
              <b>{r.estacao}</b>
              <small>{quando(r.inicio)} · {r.conector ?? `conector ${r.conector_numero}`} · {duracao(r.inicio, r.fim)}</small>
              {r.status !== "concluida" && <div><span className={`badge ${r.status === "em_andamento" ? "b-blue" : "b-offline"}`} style={{ marginTop: 4 }}>{r.status === "em_andamento" ? "em andamento" : "interrompida"}</span></div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <b className="mono">{brl(r.valor_centavos)}</b><br />
              <small className="muted mono">{kwh(r.energia_wh)} kWh</small>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
