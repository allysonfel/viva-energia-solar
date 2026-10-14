// Comandos da operação para os carregadores. Cada comando fica registrado
// (quem pediu, o que foi, a resposta) e aparece no histórico da estação.
import "server-only";
import { sql } from "../db";
import { enviar, registrarIntencao, ErroOcpp } from "./central";

export const ID_TAG_OPERACAO = "VIVA-OPERACAO";

type Resultado = { ok: boolean; texto: string };

async function executar(
  estacao: { id: number; codigo: string },
  usuarioId: number | null,
  acao: string,
  descricao: string,
  payload: Record<string, unknown>,
  aceito: (r: Record<string, unknown>) => boolean = (r) => r.status === "Accepted",
): Promise<Resultado> {
  const [cmd] = await sql<{ id: number }[]>`
    INSERT INTO comandos (estacao_id, usuario_id, acao, descricao, payload)
    VALUES (${estacao.id}, ${usuarioId}, ${acao}, ${descricao}, ${sql.json(payload as never)}) RETURNING id`;
  try {
    const r = await enviar(estacao.codigo, acao, payload);
    const ok = aceito(r);
    await sql`UPDATE comandos SET status = ${ok ? "aceito" : "recusado"}, resposta = ${sql.json(r as never)}, respondido_em = now() WHERE id = ${cmd.id}`;
    return { ok, texto: ok ? `${descricao}: aceito pelo carregador` : `${descricao}: recusado pelo carregador (${String(r.status ?? "sem status")})` };
  } catch (err) {
    const tipo = err instanceof ErroOcpp ? err.codigo : "erro";
    await sql`UPDATE comandos SET status = ${tipo}, resposta = ${sql.json({ erro: err instanceof Error ? err.message : "erro" })}, respondido_em = now() WHERE id = ${cmd.id}`;
    const texto = tipo === "offline" ? "a estação está offline" : tipo === "sem_resposta" ? "o carregador não respondeu" : "o carregador devolveu erro";
    return { ok: false, texto: `${descricao}: ${texto}` };
  }
}

export const reiniciar = (e: { id: number; codigo: string }, uid: number | null, tipo: "Soft" | "Hard" = "Soft") =>
  executar(e, uid, "Reset", tipo === "Soft" ? "Reiniciar" : "Reiniciar (forçado)", { type: tipo });

export async function iniciarRecarga(e: { id: number; codigo: string }, uid: number | null, conector: number, idTag = ID_TAG_OPERACAO, motoristaId: number | null = null, voucher: number | null = null) {
  registrarIntencao(e.codigo, conector, { idTag, origem: motoristaId ? "app" : "painel", usuarioId: uid, motoristaId, voucher });
  return executar(e, uid, "RemoteStartTransaction", `Iniciar recarga no conector ${conector}`, { connectorId: conector, idTag });
}

export const pararRecarga = (e: { id: number; codigo: string }, uid: number | null, transacao: number) =>
  executar(e, uid, "RemoteStopTransaction", `Parar recarga #${transacao}`, { transactionId: transacao });

// Habilitar/desabilitar a estação inteira (conector 0). "Scheduled" = vai
// valer quando a recarga em curso terminar.
export async function disponibilidade(e: { id: number; codigo: string }, uid: number | null, habilitar: boolean) {
  const r = await executar(
    e, uid, "ChangeAvailability", habilitar ? "Habilitar" : "Desabilitar",
    { connectorId: 0, type: habilitar ? "Operative" : "Inoperative" },
    (x) => x.status === "Accepted" || x.status === "Scheduled",
  );
  if (r.ok) await sql`UPDATE estacoes SET habilitada = ${habilitar} WHERE id = ${e.id}`;
  return r;
}

// Potência máxima da estação: perfil ChargePointMaxProfile no conector 0.
export async function limitarPotencia(e: { id: number; codigo: string }, uid: number | null, watts: number) {
  const r = await executar(e, uid, "SetChargingProfile", `Limitar potência a ${(watts / 1000).toLocaleString("pt-BR")} kW`, {
    connectorId: 0,
    csChargingProfiles: {
      chargingProfileId: 1,
      stackLevel: 0,
      chargingProfilePurpose: "ChargePointMaxProfile",
      chargingProfileKind: "Absolute",
      chargingSchedule: {
        startSchedule: new Date().toISOString(),
        chargingRateUnit: "W",
        chargingSchedulePeriod: [{ startPeriod: 0, limit: watts }],
      },
    },
  });
  if (r.ok) await sql`UPDATE estacoes SET limite_w = ${watts} WHERE id = ${e.id}`;
  return r;
}

// Pede ao carregador para mandar de novo o status (útil depois de reconectar).
export const pedirStatus = (e: { id: number; codigo: string }, uid: number | null) =>
  executar(e, uid, "TriggerMessage", "Atualizar status", { requestedMessage: "StatusNotification" });
