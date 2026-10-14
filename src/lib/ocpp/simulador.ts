// Carregadores simulados. Cada estação marcada como "simulada" ganha um
// carregador virtual que conecta na própria central (/ocpp/<código>) como um
// equipamento de verdade: manda BootNotification, Heartbeat, status, abre e
// fecha transações e envia o medidor. Responde aos comandos da operação.
// Serve para desenvolver e demonstrar sem hardware; liga só com
// OCPP_SIMULADOR=sim (ou em desenvolvimento).
import "server-only";
import WebSocket from "ws";
import { sql } from "../db";
import { senhaSimulada } from "./central";
import { lerFrame, type Call } from "./tipos";

type Transacao = { id: number; inicio: number; medidorInicio: number; idTag: string };
type Conector = {
  numero: number;
  potenciaW: number;
  status: string;
  tx: Transacao | null;
  // Carro plugado: bateria (Wh), carga atual (%) e potência máxima que ele aceita.
  carro: { bateriaWh: number; soc: number; maxW: number } | null;
  ultimaLeitura: number;
};
export type Virtual = {
  codigo: string;
  ws: WebSocket | null;
  ligado: boolean;
  conectado: boolean;
  medidorWh: number;
  limiteW: number | null;
  inoperante: boolean;
  falha: boolean;
  heartbeatSeg: number;
  leituraSeg: number;
  conectores: Conector[];
  pendentes: Map<string, (r: Record<string, unknown> | null) => void>;
  timers: NodeJS.Timeout[];
  log: { em: number; texto: string }[];
};

type Estado = { virtuais: Map<string, Virtual>; seq: number };
const g = globalThis as unknown as { __vivaSimulador?: Estado };
const estado: Estado = (g.__vivaSimulador ??= { virtuais: new Map(), seq: 0 });

export const simuladorLigado = () => process.env.OCPP_SIMULADOR === "sim" || process.env.NODE_ENV !== "production";

const anotar = (v: Virtual, texto: string) => {
  v.log.unshift({ em: Date.now(), texto });
  v.log.length = Math.min(v.log.length, 30);
};

function chamar(v: Virtual, acao: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!v.ws || v.ws.readyState !== WebSocket.OPEN) return Promise.resolve(null);
  const id = `s${(++estado.seq).toString(36)}`;
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      v.pendentes.delete(id);
      resolve(null);
    }, 20_000);
    v.pendentes.set(id, (r) => {
      clearTimeout(t);
      resolve(r);
    });
    v.ws!.send(JSON.stringify([2, id, acao, payload]));
  });
}

const status = (v: Virtual, conector: number, s: string, erro = "NoError") => {
  if (conector > 0) {
    const c = v.conectores.find((x) => x.numero === conector);
    if (c) c.status = s;
  }
  return chamar(v, "StatusNotification", { connectorId: conector, errorCode: erro, status: s, timestamp: new Date().toISOString() });
};

// ---------------------------------------------------------------- ciclo

function limpar(v: Virtual) {
  v.timers.forEach(clearInterval);
  v.timers = [];
}

export async function ligar(codigo: string) {
  const [e] = await sql<{ id: number; limite_w: number | null; habilitada: boolean }[]>`
    SELECT id, limite_w, habilitada FROM estacoes WHERE codigo = ${codigo} AND simulada AND ativa`;
  if (!e) return;
  const cons = await sql<{ numero: number; potencia_w: number }[]>`SELECT numero, potencia_w FROM conectores WHERE estacao_id = ${e.id} ORDER BY numero`;
  let v = estado.virtuais.get(codigo);
  if (!v) {
    v = {
      codigo, ws: null, ligado: true, conectado: false, medidorWh: 1_000_000 + Math.floor(Math.random() * 500_000),
      limiteW: e.limite_w, inoperante: !e.habilitada, falha: false, heartbeatSeg: 60, leituraSeg: 30,
      conectores: cons.map((c) => ({ numero: c.numero, potenciaW: c.potencia_w, status: "Available", tx: null, carro: null, ultimaLeitura: 0 })),
      pendentes: new Map(), timers: [], log: [],
    };
    estado.virtuais.set(codigo, v);
  } else {
    // Conectores podem ter mudado no cadastro.
    for (const c of cons) {
      const x = v.conectores.find((k) => k.numero === c.numero);
      if (x) x.potenciaW = c.potencia_w;
      else v.conectores.push({ numero: c.numero, potenciaW: c.potencia_w, status: "Available", tx: null, carro: null, ultimaLeitura: 0 });
    }
    v.conectores = v.conectores.filter((x) => cons.some((c) => c.numero === x.numero));
  }
  v.ligado = true;
  if (v.ws && v.ws.readyState <= WebSocket.OPEN) return;
  const porta = process.env.PORT || "3000";
  const auth = Buffer.from(`${codigo}:${senhaSimulada(codigo)}`).toString("base64");
  const ws = new WebSocket(`ws://127.0.0.1:${porta}/ocpp/${encodeURIComponent(codigo)}`, ["ocpp1.6"], {
    headers: { Authorization: `Basic ${auth}` },
  });
  v.ws = ws;
  const vv = v;
  ws.on("open", () => aberto(vv).catch((err) => console.error("[simulador]", err instanceof Error ? err.message : err)));
  ws.on("message", (d) => mensagem(vv, d.toString()));
  ws.on("close", () => {
    vv.conectado = false;
    limpar(vv);
    if (vv.ws === ws) vv.ws = null;
    // Caiu sem ninguém mandar desligar: tenta de novo, como um equipamento real.
    if (vv.ligado) setTimeout(() => vv.ligado && ligar(codigo).catch(() => {}), 5_000);
  });
  ws.on("error", (err) => anotar(vv, `Erro de conexão: ${err.message}`));
}

async function aberto(v: Virtual) {
  v.conectado = true;
  anotar(v, "Conectado à central");
  const r = await chamar(v, "BootNotification", {
    chargePointVendor: "Viva (simulado)", chargePointModel: "SIM-DC", firmwareVersion: "sim-1.0", chargePointSerialNumber: v.codigo,
  });
  v.heartbeatSeg = Math.min(Math.max(Number(r?.interval) || 60, 10), 3600);
  await status(v, 0, v.falha ? "Faulted" : v.inoperante ? "Unavailable" : "Available", v.falha ? "OtherError" : "NoError");
  for (const c of v.conectores) {
    const s = c.tx ? "Charging" : v.falha ? "Faulted" : v.inoperante ? "Unavailable" : c.carro ? "Preparing" : "Available";
    await status(v, c.numero, s);
  }
  v.timers.push(setInterval(() => chamar(v, "Heartbeat", {}), v.heartbeatSeg * 1000));
  v.timers.push(setInterval(() => medir(v).catch(() => {}), 5_000));
}

export function desligar(codigo: string) {
  const v = estado.virtuais.get(codigo);
  if (!v) return;
  v.ligado = false;
  anotar(v, "Desligado (sem comunicação)");
  v.ws?.close();
}

// ---------------------------------------------------------------- recarga

async function comecar(v: Virtual, c: Conector, idTag: string) {
  if (!c.carro) c.carro = { bateriaWh: 60_000, soc: 20 + Math.floor(Math.random() * 30), maxW: [50_000, 80_000, 150_000][Math.floor(Math.random() * 3)] };
  await status(v, c.numero, "Preparing");
  const a = await chamar(v, "Authorize", { idTag });
  if ((a?.idTagInfo as { status?: string } | undefined)?.status !== "Accepted") {
    anotar(v, `Cartão ${idTag} recusado no conector ${c.numero}`);
    return false;
  }
  const r = await chamar(v, "StartTransaction", { connectorId: c.numero, idTag, meterStart: v.medidorWh, timestamp: new Date().toISOString() });
  const id = Number(r?.transactionId);
  if (!Number.isInteger(id) || (r?.idTagInfo as { status?: string } | undefined)?.status !== "Accepted") {
    await status(v, c.numero, "Available");
    return false;
  }
  c.tx = { id, inicio: Date.now(), medidorInicio: v.medidorWh, idTag };
  c.ultimaLeitura = Date.now();
  await status(v, c.numero, "Charging");
  anotar(v, `Recarga #${id} iniciada no conector ${c.numero}`);
  return true;
}

async function terminar(v: Virtual, c: Conector, motivo: string) {
  if (!c.tx) return;
  const tx = c.tx;
  c.tx = null;
  await chamar(v, "StopTransaction", { transactionId: tx.id, meterStop: v.medidorWh, timestamp: new Date().toISOString(), reason: motivo, idTag: tx.idTag });
  anotar(v, `Recarga #${tx.id} encerrada (${motivo})`);
  if (motivo !== "Other") {
    await status(v, c.numero, "Finishing");
    c.carro = null;
    await status(v, c.numero, v.inoperante ? "Unavailable" : "Available");
  }
}

// Potência que cada conector entrega agora: limitada pelo conector, pelo
// carro (que reduz acima de 80%) e pelo limite da estação dividido entre
// quem está carregando.
function potencia(v: Virtual, c: Conector): number {
  if (!c.tx || !c.carro) return 0;
  const ativos = v.conectores.filter((x) => x.tx).length || 1;
  let w = Math.min(c.potenciaW, c.carro.maxW, v.limiteW ? v.limiteW / ativos : Infinity);
  if (c.carro.soc > 80) w *= Math.max(0.15, (100 - c.carro.soc) / 20);
  return Math.round(w);
}

async function medir(v: Virtual) {
  for (const c of v.conectores) {
    if (!c.tx || !c.carro) continue;
    const w = potencia(v, c);
    const wh = Math.round((w * 5) / 3600);
    v.medidorWh += wh;
    c.carro.soc = Math.min(100, c.carro.soc + (wh / c.carro.bateriaWh) * 100);
    if (Date.now() - c.ultimaLeitura >= v.leituraSeg * 1000) {
      c.ultimaLeitura = Date.now();
      await chamar(v, "MeterValues", {
        connectorId: c.numero,
        transactionId: c.tx.id,
        meterValue: [{
          timestamp: new Date().toISOString(),
          sampledValue: [
            { value: String(v.medidorWh), measurand: "Energy.Active.Import.Register", unit: "Wh", context: "Sample.Periodic" },
            { value: String(w), measurand: "Power.Active.Import", unit: "W" },
            { value: String(Math.round(c.carro.soc)), measurand: "SoC", unit: "Percent" },
          ],
        }],
      });
    }
    if (c.carro.soc >= 100) await terminar(v, c, "EVDisconnected");
  }
}

// ---------------------------------------------------------------- comandos recebidos

async function mensagem(v: Virtual, texto: string) {
  const f = lerFrame(texto);
  if (!f) return;
  if (f[0] === 3 || f[0] === 4) {
    const p = v.pendentes.get(f[1]);
    if (p) {
      v.pendentes.delete(f[1]);
      p(f[0] === 3 ? f[2] : null);
    }
    return;
  }
  const [, id, acao, payload] = f as Call;
  const responder = (r: Record<string, unknown>) => v.ws?.send(JSON.stringify([3, id, r]));
  const conector = (n: unknown) => v.conectores.find((c) => c.numero === Number(n));
  anotar(v, `Comando recebido: ${acao}`);

  switch (acao) {
    case "Reset": {
      responder({ status: "Accepted" });
      for (const c of v.conectores) await terminar(v, c, payload.type === "Hard" ? "HardReset" : "SoftReset");
      setTimeout(() => v.ws?.close(), 500); // reconecta sozinho em 5 s
      return;
    }
    case "RemoteStartTransaction": {
      const c = conector(payload.connectorId) ?? v.conectores.find((x) => x.status === "Available");
      const ok = !!c && !c.tx && !v.inoperante && !v.falha && (c.status === "Available" || c.status === "Preparing");
      responder({ status: ok ? "Accepted" : "Rejected" });
      if (ok) await comecar(v, c!, String(payload.idTag ?? ""));
      return;
    }
    case "RemoteStopTransaction": {
      const c = v.conectores.find((x) => x.tx?.id === Number(payload.transactionId));
      responder({ status: c ? "Accepted" : "Rejected" });
      if (c) await terminar(v, c, "Remote");
      return;
    }
    case "ChangeAvailability": {
      const inoperante = payload.type === "Inoperative";
      const carregando = v.conectores.some((c) => c.tx);
      responder({ status: carregando && inoperante ? "Scheduled" : "Accepted" });
      v.inoperante = inoperante;
      if (!carregando || !inoperante) {
        await status(v, 0, inoperante ? "Unavailable" : "Available");
        for (const c of v.conectores) if (!c.tx) await status(v, c.numero, inoperante ? "Unavailable" : c.carro ? "Preparing" : "Available");
      }
      return;
    }
    case "SetChargingProfile": {
      const per = (payload.csChargingProfiles as { chargingSchedule?: { chargingSchedulePeriod?: { limit?: number }[] } })?.chargingSchedule?.chargingSchedulePeriod?.[0];
      const limite = Number(per?.limit);
      responder({ status: Number.isFinite(limite) && limite > 0 ? "Accepted" : "Rejected" });
      if (Number.isFinite(limite) && limite > 0) v.limiteW = limite;
      return;
    }
    case "ChangeConfiguration": {
      if (payload.key === "MeterValueSampleInterval" && Number(payload.value) >= 5) v.leituraSeg = Number(payload.value);
      responder({ status: "Accepted" });
      return;
    }
    case "GetConfiguration":
      responder({ configurationKey: [{ key: "MeterValueSampleInterval", readonly: false, value: String(v.leituraSeg) }, { key: "HeartbeatInterval", readonly: false, value: String(v.heartbeatSeg) }] });
      return;
    case "TriggerMessage": {
      responder({ status: "Accepted" });
      if (payload.requestedMessage === "StatusNotification") for (const c of v.conectores) await status(v, c.numero, c.status);
      if (payload.requestedMessage === "Heartbeat") await chamar(v, "Heartbeat", {});
      return;
    }
    default:
      v.ws?.send(JSON.stringify([4, id, "NotImplemented", "Não suportado no simulador", {}]));
  }
}

// ---------------------------------------------------------------- ações do painel do simulador

export async function plugarEPassarCartao(codigo: string, numero: number, idTag: string) {
  const v = estado.virtuais.get(codigo);
  const c = v?.conectores.find((x) => x.numero === numero);
  if (!v || !c || !v.conectado) return "O carregador simulado está desligado.";
  if (c.tx) return "Esse conector já está carregando.";
  if (v.inoperante || v.falha) return "A estação está indisponível.";
  return (await comecar(v, c, idTag)) ? null : "O cartão foi recusado pela central.";
}

export async function plugarCarro(codigo: string, numero: number) {
  const v = estado.virtuais.get(codigo);
  const c = v?.conectores.find((x) => x.numero === numero);
  if (!v || !c || !v.conectado || c.tx || c.carro) return;
  c.carro = { bateriaWh: 60_000, soc: 20 + Math.floor(Math.random() * 30), maxW: [50_000, 80_000, 150_000][Math.floor(Math.random() * 3)] };
  await status(v, numero, "Preparing");
  anotar(v, `Carro conectado no conector ${numero}`);
}

export async function desplugar(codigo: string, numero: number) {
  const v = estado.virtuais.get(codigo);
  const c = v?.conectores.find((x) => x.numero === numero);
  if (!v || !c) return;
  if (c.tx) await terminar(v, c, "EVDisconnected");
  else if (c.carro) {
    c.carro = null;
    await status(v, numero, v.inoperante ? "Unavailable" : "Available");
  }
}

export async function simularFalha(codigo: string, falha: boolean) {
  const v = estado.virtuais.get(codigo);
  if (!v) return;
  v.falha = falha;
  if (falha) {
    for (const c of v.conectores) await terminar(v, c, "Other");
    await status(v, 0, "Faulted", "GroundFailure");
    for (const c of v.conectores) await status(v, c.numero, "Faulted", "GroundFailure");
    anotar(v, "Falha simulada (GroundFailure)");
  } else {
    await status(v, 0, v.inoperante ? "Unavailable" : "Available");
    for (const c of v.conectores) {
      c.carro = null;
      await status(v, c.numero, v.inoperante ? "Unavailable" : "Available");
    }
    anotar(v, "Falha resolvida");
  }
}

export function estadoSimulador(codigo: string) {
  const v = estado.virtuais.get(codigo);
  if (!v) return null;
  return {
    ligado: v.ligado,
    conectado: v.conectado,
    falha: v.falha,
    limiteW: v.limiteW,
    medidorWh: v.medidorWh,
    conectores: v.conectores.map((c) => ({ numero: c.numero, status: c.status, tx: c.tx?.id ?? null, soc: c.carro ? Math.round(c.carro.soc) : null, potenciaW: potencia(v, c) })),
    log: v.log.slice(0, 12),
  };
}

// Na subida do servidor: liga todos os simulados ativos.
export async function iniciarSimuladores() {
  if (!simuladorLigado()) return;
  const lista = await sql<{ codigo: string }[]>`SELECT codigo FROM estacoes WHERE simulada AND ativa`;
  for (const e of lista) await ligar(e.codigo).catch(() => {});
  if (lista.length) console.log(`[simulador] ${lista.length} carregadores simulados ligados`);
}
