// Central OCPP 1.6J. Recebe as conexões dos carregadores (via server.mjs),
// responde às mensagens deles e envia comandos da operação.
//
// As conexões abertas ficam em globalThis: o Next empacota o instrumentation
// e as rotas separadamente, então estado de módulo não seria compartilhado
// entre quem recebe a conexão (instrumentation) e quem manda comando (painel).
import "server-only";
import type { WebSocket } from "ws";
import { createHmac, timingSafeEqual } from "crypto";
import { sql, ensureSchema } from "../db";
import { verifyPassword } from "../auth";
import { getSettings } from "../settings";
import { abrirAviso, resolverAviso } from "../avisos";
import { cobrarRecarga } from "../carteira";
import { tarifasDaEstacao, precoNoHorario } from "../tarifas";
import { avisarMotorista, avisarProgresso } from "../notificar";
import { brl } from "../format";
import { lerFrame, lerMedidor, type Call } from "./tipos";

type Pendente = { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
type Conexao = { ws: WebSocket; estacaoId: number; codigo: string; pendentes: Map<string, Pendente>; vivo: boolean; msgs: number[] };
// Pedido de início remoto: liga a transação que o carregador abrir à origem (painel/app).
// voucher = id em motorista_vouchers (voucher resgatado que o motorista escolheu usar).
type Intencao = { idTag: string; origem: "painel" | "app"; usuarioId: number | null; motoristaId: number | null; voucher?: number | null; expira: number };

type Estado = { conexoes: Map<string, Conexao>; intencoes: Map<string, Intencao>; seq: number };
const g = globalThis as unknown as { __vivaCentral?: Estado };
const estado: Estado = (g.__vivaCentral ??= { conexoes: new Map(), intencoes: new Map(), seq: 0 });

export class ErroOcpp extends Error {
  constructor(public codigo: "offline" | "sem_resposta" | "erro", msg: string) {
    super(msg);
  }
}

// ---------------------------------------------------------------- autenticação

// Senha dos carregadores simulados: derivada do SESSION_SECRET, nunca guardada.
export function senhaSimulada(codigo: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update("simulador:" + codigo).digest("base64url").slice(0, 32);
}

const iguais = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const falhas = new Map<string, number[]>();

// Perfil de segurança 1 do OCPP: Basic com usuário = código da estação e a
// senha cadastrada. 10 falhas em 15 min por IP bloqueiam a origem.
export async function autenticar(codigo: string, authorization: string | undefined, ip: string | undefined): Promise<boolean> {
  const chave = ip ?? "?";
  const agora = Date.now();
  const lista = (falhas.get(chave) ?? []).filter((t) => agora - t < 15 * 60_000);
  if (lista.length >= 10) return false;
  await ensureSchema();
  const [e] = await sql<{ id: number; ocpp_senha_hash: string | null; simulada: boolean; ativa: boolean }[]>`
    SELECT id, ocpp_senha_hash, simulada, ativa FROM estacoes WHERE codigo = ${codigo}`;
  let ok = false;
  if (e?.ativa && authorization?.startsWith("Basic ")) {
    const dec = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const i = dec.indexOf(":");
    const usuario = dec.slice(0, i), senha = dec.slice(i + 1);
    if (i > 0 && usuario === codigo) {
      ok = e.simulada ? iguais(senha, senhaSimulada(codigo)) : verifyPassword(senha, e.ocpp_senha_hash);
    }
  }
  if (!ok) {
    lista.push(agora);
    falhas.set(chave, lista);
    console.warn(`[ocpp] conexão recusada para ${codigo.slice(0, 40)} (${chave})`);
  }
  return ok;
}

// ---------------------------------------------------------------- conexão

const registrar = (estacaoId: number, direcao: "entrada" | "saida", acao: string | null, conteudo: unknown) =>
  sql`INSERT INTO ocpp_mensagens (estacao_id, direcao, acao, conteudo) VALUES (${estacaoId}, ${direcao}, ${acao}, ${sql.json(conteudo as never)})`.catch(() => {});

// Os ouvintes entram na hora (o carregador manda o BootNotification logo ao
// conectar; mensagem sem ouvinte se perde) e tudo passa por uma fila: a
// preparação da conexão primeiro, depois as mensagens na ordem em que chegaram
// (StartTransaction antes do MeterValues da mesma recarga).
export function conectar(ws: WebSocket, codigo: string) {
  let c: Conexao | null = null;
  let fechou = false;
  let fila: Promise<unknown> = Promise.resolve();
  const enfileirar = (f: () => Promise<unknown>) => {
    fila = fila.then(f).catch((err) => console.error(`[ocpp] ${codigo} erro:`, err instanceof Error ? err.message : err));
  };
  const msgs: number[] = [];

  ws.on("message", (dados, binario) => {
    if (binario) return;
    // Freio: mais de 30 mensagens em 10 s é carregador com defeito ou abuso.
    const t = Date.now();
    while (msgs.length && t - msgs[0] > 10_000) msgs.shift();
    msgs.push(t);
    if (msgs.length > 30) return;
    const texto = dados.toString();
    enfileirar(async () => {
      if (c) await tratar(c, texto);
    });
  });
  ws.on("pong", () => {
    if (c) c.vivo = true;
  });
  ws.on("close", () => {
    fechou = true;
    enfileirar(async () => {
      if (c) await desconectado(c);
    });
  });
  ws.on("error", () => {});

  enfileirar(async () => {
    const [e] = await sql<{ id: number }[]>`SELECT id FROM estacoes WHERE codigo = ${codigo}`;
    if (!e) return ws.close(1008);
    // Reconexão: a conexão antiga do mesmo carregador sai.
    const antiga = estado.conexoes.get(codigo);
    if (antiga) {
      antiga.ws.removeAllListeners("close");
      antiga.ws.terminate();
      for (const p of antiga.pendentes.values()) p.reject(new ErroOcpp("offline", "Conexão substituída"));
    }
    c = { ws, estacaoId: e.id, codigo, pendentes: new Map(), vivo: true, msgs };
    if (fechou) return;
    estado.conexoes.set(codigo, c);
    await sql`UPDATE estacoes SET conectada = true, conectada_em = now(), ultimo_contato = now() WHERE id = ${e.id}`;
    await resolverAviso("offline", { estacao: e.id });
    console.log(`[ocpp] ${codigo} conectado`);
  });
}

async function desconectado(c: Conexao) {
  if (estado.conexoes.get(c.codigo) !== c) return;
  estado.conexoes.delete(c.codigo);
  for (const p of c.pendentes.values()) p.reject(new ErroOcpp("offline", "Carregador desconectou"));
  await sql`UPDATE estacoes SET conectada = false WHERE id = ${c.estacaoId}`.catch(() => {});
  console.log(`[ocpp] ${c.codigo} desconectado`);
}

// Ping a cada 30 s: quem não responder é derrubado (a estação vira offline).
export function rotinaPing() {
  for (const c of estado.conexoes.values()) {
    if (!c.vivo) {
      c.ws.terminate();
      continue;
    }
    c.vivo = false;
    try {
      c.ws.ping();
    } catch {}
  }
}

export const estaConectada = (codigo: string) => estado.conexoes.has(codigo);

// ---------------------------------------------------------------- entrada

function responder(c: Conexao, id: string, payload: Record<string, unknown>, acao: string) {
  const frame = [3, id, payload];
  c.ws.send(JSON.stringify(frame));
  registrar(c.estacaoId, "saida", acao, frame);
}

function erro(c: Conexao, id: string, codigoErro: string, texto: string) {
  const frame = [4, id, codigoErro, texto, {}];
  c.ws.send(JSON.stringify(frame));
  registrar(c.estacaoId, "saida", null, frame);
}

async function tratar(c: Conexao, texto: string) {
  const f = lerFrame(texto);
  if (!f) {
    console.warn(`[ocpp] ${c.codigo} mensagem inválida`);
    return;
  }
  await sql`UPDATE estacoes SET ultimo_contato = now() WHERE id = ${c.estacaoId}`;
  if (f[0] === 3 || f[0] === 4) {
    registrar(c.estacaoId, "entrada", null, f);
    const p = c.pendentes.get(f[1]);
    if (!p) return;
    c.pendentes.delete(f[1]);
    clearTimeout(p.timer);
    if (f[0] === 3) p.resolve(f[2]);
    else p.reject(new ErroOcpp("erro", `${f[2]}: ${f[3]}`.slice(0, 200)));
    return;
  }
  const [, id, acao, payload] = f as Call;
  registrar(c.estacaoId, "entrada", acao, f);
  const h = HANDLERS[acao];
  if (!h) return erro(c, id, "NotImplemented", `Ação ${acao.slice(0, 40)} não suportada`);
  try {
    const r = await h(c, payload);
    responder(c, id, r, acao);
  } catch (err) {
    console.error(`[ocpp] ${c.codigo} ${acao}:`, err instanceof Error ? err.message : err);
    erro(c, id, "InternalError", "Erro ao processar");
  }
}

const str = (v: unknown, max = 50) => (typeof v === "string" ? v.slice(0, max) : "");
const int = (v: unknown) => (Number.isInteger(Number(v)) ? Number(v) : null);

// Horário mandado pelo carregador, se for plausível; senão, o do servidor.
function horario(v: unknown): Date {
  const d = new Date(String(v ?? ""));
  const t = d.getTime();
  return Number.isFinite(t) && t > Date.now() - 7 * 86_400_000 && t < Date.now() + 5 * 60_000 ? d : new Date();
}

// Cartão aceito? Cartões da operação ficam em "tags"; o cartão virtual do
// motorista é o id_tag dele e só vale com conta ativa e saldo mínimo.
async function statusTag(idTag: string): Promise<{ status: "Accepted" | "Invalid" | "Blocked"; motorista: number | null }> {
  const [t] = await sql<{ ativa: boolean }[]>`SELECT ativa FROM tags WHERE id_tag = ${idTag}`;
  if (t) return { status: t.ativa ? "Accepted" : "Blocked", motorista: null };
  const [m] = await sql<{ id: number; ativo: boolean; saldo_centavos: number }[]>`SELECT id, ativo, saldo_centavos FROM motoristas WHERE id_tag = ${idTag}`;
  if (!m) return { status: "Invalid", motorista: null };
  const s = await getSettings();
  return { status: m.ativo && m.saldo_centavos >= s.saldoMinimoCentavos ? "Accepted" : "Blocked", motorista: m.id };
}

const valor = (energiaWh: number, precoKwh: number) => Math.round((energiaWh * precoKwh) / 1000);

type Handler = (c: Conexao, p: Record<string, unknown>) => Promise<Record<string, unknown>>;

const HANDLERS: Record<string, Handler> = {
  async BootNotification(c, p) {
    const s = await getSettings();
    await sql`
      UPDATE estacoes SET fabricante = ${str(p.chargePointVendor, 20)}, modelo = ${str(p.chargePointModel, 20)},
        firmware = ${str(p.firmwareVersion, 50)}, numero_serie = ${str(p.chargePointSerialNumber || p.chargeBoxSerialNumber, 25)}
      WHERE id = ${c.estacaoId}`;
    // Depois de aceitar, pede leituras do medidor no intervalo configurado.
    setTimeout(() => {
      enviar(c.codigo, "ChangeConfiguration", { key: "MeterValueSampleInterval", value: String(s.leituraSeg) }, 20_000).catch(() => {});
    }, 1500);
    return { status: "Accepted", currentTime: new Date().toISOString(), interval: s.heartbeatSeg };
  },

  async Heartbeat() {
    return { currentTime: new Date().toISOString() };
  },

  async StatusNotification(c, p) {
    const n = int(p.connectorId);
    const status = str(p.status, 20) || "Unavailable";
    const codErro = str(p.errorCode, 30) || "NoError";
    if (n === 0) {
      await sql`UPDATE estacoes SET status_geral = ${status}, erro_geral = ${codErro} WHERE id = ${c.estacaoId}`;
    } else if (n !== null && n >= 1 && n <= 20) {
      // Conector que a central ainda não conhecia entra com tipo a revisar.
      await sql`
        INSERT INTO conectores (estacao_id, numero, status, erro, atualizado_em) VALUES (${c.estacaoId}, ${n}, ${status}, ${codErro}, now())
        ON CONFLICT (estacao_id, numero) DO UPDATE SET status = EXCLUDED.status, erro = EXCLUDED.erro, atualizado_em = now()`;
    }
    if (status === "Faulted") {
      const [e] = await sql<{ nome: string }[]>`SELECT nome FROM estacoes WHERE id = ${c.estacaoId}`;
      await abrirAviso("falha", { estacao: c.estacaoId }, `${e?.nome ?? c.codigo} com falha`, `Conector ${n || "geral"}: ${codErro}`);
    } else if (status === "Available") {
      await resolverAviso("falha", { estacao: c.estacaoId });
    }
    return {};
  },

  async Authorize(_c, p) {
    return { idTagInfo: { status: (await statusTag(str(p.idTag, 20))).status } };
  },

  async StartTransaction(c, p) {
    const n = int(p.connectorId) ?? 0;
    const idTag = str(p.idTag, 20);
    const medidor = Math.max(0, int(p.meterStart) ?? 0);
    const inicio = horario(p.timestamp);
    const tag = await statusTag(idTag);
    const st = tag.status;
    const chave = `${c.codigo}:${n}`;
    const intencao = estado.intencoes.get(chave);
    const daIntencao = intencao && intencao.idTag === idTag && intencao.expira > Date.now() ? intencao : null;
    if (daIntencao) estado.intencoes.delete(chave);
    const [e] = await sql<{ preco_kwh_centavos: number; custo_kwh_centavos: number }[]>`
      SELECT preco_kwh_centavos, custo_kwh_centavos FROM estacoes WHERE id = ${c.estacaoId}`;
    // Tarifa do horário de início; voucher (se o motorista escolheu) aplicado em %.
    const tarifa = precoNoHorario(await tarifasDaEstacao(c.estacaoId), e?.preco_kwh_centavos ?? 0, inicio);
    const motoristaId = daIntencao?.motoristaId ?? tag.motorista;
    const { id, fechadas } = await sql.begin(async (tx) => {
      let voucher: { mv: number; voucher_id: number; pct: number } | null = null;
      if (st === "Accepted" && motoristaId && daIntencao?.voucher) {
        const [v] = await tx<{ mv: number; voucher_id: number; pct: number }[]>`
          SELECT mv.id AS mv, v.id AS voucher_id, v.pct FROM motorista_vouchers mv JOIN vouchers v ON v.id = mv.voucher_id
          WHERE mv.id = ${daIntencao.voucher} AND mv.motorista_id = ${motoristaId} AND mv.recarga_id IS NULL AND v.ativo
            AND (v.valido_ate IS NULL OR v.valido_ate >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
            AND (v.estacao_id IS NULL OR v.estacao_id = ${c.estacaoId})
            AND (v.limite_usos IS NULL OR (SELECT count(*) FROM motorista_vouchers u WHERE u.voucher_id = v.id AND u.recarga_id IS NOT NULL) < v.limite_usos)
          FOR UPDATE OF mv`;
        voucher = v ?? null;
      }
      const preco = voucher ? Math.round((tarifa.preco * (100 - voucher.pct)) / 100) : tarifa.preco;
      // Recarga aberta esquecida no mesmo conector (carregador reiniciou sem
      // mandar o Stop) é fechada como interrompida antes de abrir a nova.
      const fechadas = await tx<{ id: number }[]>`
        UPDATE recargas SET status = 'interrompida', fim = ${inicio}, motivo_fim = 'NovaTransacao', atualizado_em = now()
        WHERE estacao_id = ${c.estacaoId} AND conector_numero = ${n} AND status = 'em_andamento' RETURNING id`;
      const [r] = await tx<{ id: number }[]>`
        INSERT INTO recargas (estacao_id, conector_numero, id_tag, motorista_id, origem, usuario_id, status, inicio,
          medidor_inicio_wh, preco_kwh_centavos, preco_cheio_centavos, tarifa_nome, voucher_id, desconto_pct, custo_kwh_centavos, fim, motivo_fim)
        VALUES (${c.estacaoId}, ${n}, ${idTag}, ${motoristaId}, ${daIntencao?.origem ?? "carregador"},
          ${daIntencao?.usuarioId ?? null}, ${st === "Accepted" ? "em_andamento" : "recusada"}, ${inicio}, ${medidor},
          ${preco}, ${tarifa.preco}, ${tarifa.nome}, ${voucher?.voucher_id ?? null}, ${voucher?.pct ?? 0},
          ${e?.custo_kwh_centavos ?? 0}, ${st === "Accepted" ? null : inicio}, ${st === "Accepted" ? null : "TagRecusada"})
        RETURNING id`;
      if (voucher) await tx`UPDATE motorista_vouchers SET recarga_id = ${r.id}, usado_em = now() WHERE id = ${voucher.mv}`;
      return { id: r.id, fechadas };
    });
    for (const f of fechadas) await cobrarRecarga(f.id);
    if (motoristaId) {
      const [x] = await sql<{ nome: string; preco: number }[]>`SELECT e.nome, r.preco_kwh_centavos AS preco FROM recargas r JOIN estacoes e ON e.id = r.estacao_id WHERE r.id = ${id}`;
      if (st === "Accepted") avisarMotorista(motoristaId, "Recarga iniciada", `${x?.nome ?? "Estação"} · conector ${n} · ${brl(x?.preco ?? 0)}/kWh`, `/recarga/${id}`);
      else avisarMotorista(motoristaId, "Recarga não liberada", "O saldo da carteira está abaixo do mínimo. Adicione crédito e tente de novo.", "/carteira");
    }
    return { transactionId: id, idTagInfo: { status: st } };
  },

  async MeterValues(c, p) {
    const tx = int(p.transactionId);
    if (tx === null) return {};
    const [r] = await sql<{ id: number; medidor_inicio_wh: number; preco_kwh_centavos: number; motorista_id: number | null; parada_solicitada: boolean }[]>`
      SELECT id, medidor_inicio_wh, preco_kwh_centavos, motorista_id, parada_solicitada FROM recargas
      WHERE id = ${tx} AND estacao_id = ${c.estacaoId} AND status = 'em_andamento'`;
    if (!r) return {};
    const leituras = Array.isArray(p.meterValue) ? (p.meterValue as { timestamp?: unknown; sampledValue?: unknown }[]).slice(0, 20) : [];
    for (const l of leituras) {
      const m = lerMedidor(Array.isArray(l.sampledValue) ? (l.sampledValue as never[]).slice(0, 40) : []);
      if (m.energiaWh === null) continue;
      const energia = Math.max(0, m.energiaWh - r.medidor_inicio_wh);
      await sql`INSERT INTO leituras (recarga_id, em, medidor_wh, potencia_w, soc) VALUES (${r.id}, ${horario(l.timestamp)}, ${m.energiaWh}, ${m.potenciaW}, ${m.soc})`;
      await sql`
        UPDATE recargas SET energia_wh = ${energia}, potencia_w = ${m.potenciaW ?? 0}, soc = coalesce(${m.soc}, soc),
          valor_centavos = ${valor(energia, r.preco_kwh_centavos)}, atualizado_em = now()
        WHERE id = ${r.id}`;
    }
    if (r.motorista_id && !r.parada_solicitada) {
      await pararSeSaldoAcabou(c, r.id, r.motorista_id);
      avisarProgresso(r.id);
    }
    return {};
  },

  async StopTransaction(c, p) {
    const tx = int(p.transactionId);
    const medidor = int(p.meterStop);
    const fim = horario(p.timestamp);
    const motivo = str(p.reason, 30) || "Local";
    if (tx !== null) {
      const [r] = await sql<{ id: number; medidor_inicio_wh: number; preco_kwh_centavos: number; status: string }[]>`
        SELECT id, medidor_inicio_wh, preco_kwh_centavos, status FROM recargas WHERE id = ${tx} AND estacao_id = ${c.estacaoId}`;
      if (r && r.status === "em_andamento") {
        const energia = medidor === null ? null : Math.max(0, medidor - r.medidor_inicio_wh);
        // Parada por queda de energia, emergência ou falha conta como interrompida.
        const interrompida = ["EmergencyStop", "PowerLoss", "Reboot", "HardReset", "UnlockCommand", "Other"].includes(motivo);
        await sql`
          UPDATE recargas SET status = ${interrompida ? "interrompida" : "concluida"}, fim = ${fim}, motivo_fim = ${motivo},
            medidor_fim_wh = ${medidor}, energia_wh = coalesce(${energia}, energia_wh), potencia_w = 0,
            valor_centavos = ${energia === null ? sql`valor_centavos` : valor(energia, r.preco_kwh_centavos)}, atualizado_em = now()
          WHERE id = ${r.id}`;
        await cobrarRecarga(r.id);
        await resolverAviso("recarga_longa", { estacao: c.estacaoId, recarga: r.id });
        const [f] = await sql<{ motorista_id: number | null; energia_wh: number; valor_centavos: number; status: string; parada_solicitada: boolean }[]>`
          SELECT motorista_id, energia_wh, valor_centavos, status, parada_solicitada FROM recargas WHERE id = ${r.id}`;
        if (f?.motorista_id) {
          const titulo = f.parada_solicitada ? "Recarga encerrada: saldo acabou" : f.status === "interrompida" ? "Recarga interrompida" : "Recarga concluída";
          avisarMotorista(f.motorista_id, titulo, `${(f.energia_wh / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kWh · ${brl(f.valor_centavos)}. Toque para ver o recibo.`, `/recibo/${r.id}`);
        }
      }
    }
    // Depois de debitar, o saldo pode estar abaixo do mínimo: isso não
    // recusa o Stop (a recarga já acabou), então responde Accepted.
    return str(p.idTag, 20) ? { idTagInfo: { status: "Accepted" } } : {};
  },

  async DataTransfer() {
    return { status: "UnknownVendorId" };
  },
  async DiagnosticsStatusNotification() {
    return {};
  },
  async FirmwareStatusNotification() {
    return {};
  },
};

// Saldo vai acabar antes da próxima leitura: pede para o carregador parar
// (uma vez). A conta usa a potência atual até a próxima leitura (+5 s de
// folga), para não estourar o saldo. Não espera a resposta aqui: ela chega
// pela mesma fila desta conexão, que está ocupada com esta mensagem.
async function pararSeSaldoAcabou(c: Conexao, recargaId: number, motoristaId: number) {
  const [x] = await sql<{ valor_centavos: number; saldo_centavos: number; potencia_w: number; preco_kwh_centavos: number }[]>`
    SELECT r.valor_centavos, m.saldo_centavos, r.potencia_w, r.preco_kwh_centavos FROM recargas r JOIN motoristas m ON m.id = r.motorista_id
    WHERE r.id = ${recargaId} AND m.id = ${motoristaId}`;
  if (!x) return;
  const s = await getSettings();
  const proximaWh = (x.potencia_w * (s.leituraSeg + 5)) / 3600;
  if (x.valor_centavos + valor(proximaWh, x.preco_kwh_centavos) < x.saldo_centavos) return;
  await sql`UPDATE recargas SET parada_solicitada = true WHERE id = ${recargaId}`;
  avisarMotorista(motoristaId, "Seu saldo está acabando", "A recarga vai parar agora para não passar do saldo da carteira.", `/recarga/${recargaId}`);
  console.log(`[ocpp] ${c.codigo} recarga #${recargaId}: saldo acabou, pedindo parada`);
  enviar(c.codigo, "RemoteStopTransaction", { transactionId: recargaId }).catch(() => {});
  sql`INSERT INTO comandos (estacao_id, acao, descricao, payload, status) VALUES (${c.estacaoId}, 'RemoteStopTransaction', ${`Parar recarga #${recargaId} (saldo acabou)`}, ${sql.json({ transactionId: recargaId })}, 'enviado')`.catch(() => {});
}

// ---------------------------------------------------------------- saída

// Manda um pedido ao carregador e espera a resposta (padrão 30 s).
export function enviar(codigo: string, acao: string, payload: Record<string, unknown>, timeoutMs = 30_000): Promise<Record<string, unknown>> {
  const c = estado.conexoes.get(codigo);
  if (!c) return Promise.reject(new ErroOcpp("offline", "Estação offline"));
  const id = `v${Date.now().toString(36)}${(++estado.seq).toString(36)}`;
  const frame = [2, id, acao, payload];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      c.pendentes.delete(id);
      reject(new ErroOcpp("sem_resposta", "Carregador não respondeu"));
    }, timeoutMs);
    c.pendentes.set(id, { resolve, reject, timer });
    c.ws.send(JSON.stringify(frame), (err) => {
      if (!err) return;
      clearTimeout(timer);
      c.pendentes.delete(id);
      reject(new ErroOcpp("offline", "Falha ao enviar"));
    });
    registrar(c.estacaoId, "saida", acao, frame);
  });
}

// Marca quem pediu o início remoto, para a transação herdar a origem.
export function registrarIntencao(codigo: string, conector: number, i: Omit<Intencao, "expira">) {
  estado.intencoes.set(`${codigo}:${conector}`, { ...i, expira: Date.now() + 3 * 60_000 });
}

// Rotina: estação sem contato além do limite vira aviso; limpa diagnóstico velho.
export async function rotinaOffline() {
  const s = await getSettings();
  const offline = await sql<{ id: number; nome: string; ultimo_contato: Date | null }[]>`
    SELECT id, nome, ultimo_contato FROM estacoes
    WHERE ativa AND NOT conectada AND (ultimo_contato IS NULL OR ultimo_contato < now() - make_interval(mins => ${s.offlineMinutos}))
      AND (ultimo_contato IS NOT NULL OR criado_em < now() - make_interval(mins => ${s.offlineMinutos}))`;
  for (const e of offline) {
    await abrirAviso("offline", { estacao: e.id }, `${e.nome} offline`, e.ultimo_contato ? "Sem comunicação com a central." : "Nunca se conectou à central.");
  }
  // Recarga aberta há mais de 12 h: carregador pode ter caído sem mandar o fim.
  const longas = await sql<{ id: number; estacao_id: number; nome: string }[]>`
    SELECT r.id, r.estacao_id, e.nome FROM recargas r JOIN estacoes e ON e.id = r.estacao_id
    WHERE r.status = 'em_andamento' AND r.inicio < now() - interval '12 hours'`;
  for (const r of longas) {
    await abrirAviso("recarga_longa", { estacao: r.estacao_id, recarga: r.id }, `Recarga #${r.id} aberta há mais de 12 h`, `${r.nome}: confira o carregador ou pare a recarga pelo painel.`);
  }
  await sql`DELETE FROM ocpp_mensagens WHERE em < now() - interval '7 days'`;
}
