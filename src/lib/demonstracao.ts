// Demonstração viva: o histórico do seed (scripts/seed-demo.mjs) para no dia
// em que foi gerado, e em poucos dias "Hoje" e "Últimos 7 dias" ficam
// vazios. Ao abrir o painel, completa as recargas das estações SIMULADAS até
// a hora atual, no mesmo padrão do seed, com a tarifa de cada horário.
// Só age se houver histórico de demonstração (cartões MDEMO e MDEMO-OP, só
// do seed e daqui; recargas feitas pelo app têm o cartão de cada cliente) em
// estação simulada; na operação real (sem estação simulada) não faz nada.
import "server-only";
import { randomInt } from "crypto";
import { sql } from "./db";
import { precoNoHorario, type Tarifa } from "./tarifas";

const HORAS = [7, 8, 9, 12, 13, 17, 18, 19, 20, 21, 22];
const MAX_DIAS = 30;
let ultimaVez = 0;

const sorteio = (max: number) => randomInt(0, 1_000_000) / 1_000_000 * max;

export async function manterDemonstracaoViva(): Promise<void> {
  if (Date.now() - ultimaVez < 5 * 60_000) return;
  ultimaVez = Date.now();
  try {
    await completar();
  } catch (e) {
    console.error("[demonstração] falha ao completar histórico:", e instanceof Error ? e.message : e);
  }
}

async function completar() {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('viva_demonstracao')::bigint)`;
    const [m] = await tx<{ ate: Date | null }[]>`
      SELECT max(r.inicio) AS ate FROM recargas r JOIN estacoes e ON e.id = r.estacao_id
      WHERE e.simulada AND r.id_tag IN ('MDEMO', 'MDEMO-OP')`;
    if (!m?.ate) return;
    const agora = Date.now();
    const desde = Math.max(new Date(m.ate).getTime(), agora - MAX_DIAS * 86_400_000);
    if (agora - desde < 3_600_000) return;

    const estacoes = await tx<{ id: number; nome: string; preco_kwh_centavos: number; custo_kwh_centavos: number; conectores: { numero: number; potencia_w: number }[] }[]>`
      SELECT e.id, e.nome, e.preco_kwh_centavos, e.custo_kwh_centavos,
        (SELECT json_agg(json_build_object('numero', c.numero, 'potencia_w', c.potencia_w) ORDER BY c.numero) FROM conectores c WHERE c.estacao_id = e.id) AS conectores
      FROM estacoes e WHERE e.ativa AND e.simulada ORDER BY e.id`;
    const motoristas = (await tx<{ id: number }[]>`SELECT id FROM motoristas WHERE id_tag LIKE 'MDEMO%' AND cpf IS NOT NULL`).map((x) => x.id);
    if (!estacoes.length || !motoristas.length) return;
    const tarifas = new Map<number, Tarifa[]>();
    for (const t of await tx<(Tarifa & { estacao_id: number })[]>`
      SELECT et.estacao_id, t.id, t.nome, t.hora_inicio, t.hora_fim, t.preco_kwh_centavos, t.cor FROM tarifas t JOIN estacao_tarifas et ON et.tarifa_id = t.id`) {
      tarifas.set(t.estacao_id, [...(tarifas.get(t.estacao_id) ?? []), t]);
    }

    // Dia a dia (meia-noite de Brasília), só os horários entre o último gerado e agora.
    const dia0 = Math.floor((desde - 3 * 3_600_000) / 86_400_000) * 86_400_000 + 3 * 3_600_000;
    let n = 0;
    for (let dia = dia0; dia < agora; dia += 86_400_000) {
      for (const [k, e] of estacoes.entries()) {
        if (!e.conectores?.length) continue;
        const quantas = 2 + Math.floor(sorteio(k % 3 === 1 ? 7 : k % 3 === 2 ? 3 : 5));
        for (let i = 0; i < quantas; i++) {
          const inicio = new Date(dia + HORAS[randomInt(0, HORAS.length)] * 3_600_000 + randomInt(0, 3_600_000));
          const c = e.conectores[randomInt(0, e.conectores.length)];
          const wh = Math.round((8 + sorteio(32)) * 1000);
          const fim = new Date(inicio.getTime() + (wh / (Math.min(c.potencia_w, 45_000) * (0.6 + sorteio(0.3)))) * 3_600_000);
          if (inicio.getTime() <= desde || fim.getTime() >= agora) continue;
          const t = precoNoHorario(tarifas.get(e.id) ?? [], e.preco_kwh_centavos, inicio);
          const valor = Math.round((wh * t.preco) / 1000);
          // 92% de clientes do app; o resto, da operação (sem cobrança).
          const motorista = sorteio(1) < 0.92 ? motoristas[randomInt(0, motoristas.length)] : null;
          const interrompida = sorteio(1) < 0.04;
          const [r] = await tx<{ id: number }[]>`
            INSERT INTO recargas (estacao_id, conector_numero, id_tag, motorista_id, origem, status, inicio, fim, medidor_inicio_wh, medidor_fim_wh,
              energia_wh, preco_kwh_centavos, preco_cheio_centavos, tarifa_nome, custo_kwh_centavos, valor_centavos, motivo_fim)
            VALUES (${e.id}, ${c.numero}, ${motorista ? "MDEMO" : "MDEMO-OP"}, ${motorista}, ${motorista ? "app" : "painel"},
              ${interrompida ? "interrompida" : "concluida"}, ${inicio}, ${fim}, 1000000, ${1_000_000 + wh}, ${wh}, ${t.preco}, ${t.preco}, ${t.nome},
              ${e.custo_kwh_centavos}, ${motorista ? valor : 0}, ${interrompida ? "PowerLoss" : "EVDisconnected"})
            RETURNING id`;
          if (motorista) {
            await tx`INSERT INTO carteira_movimentos (motorista_id, tipo, valor_centavos, descricao, recarga_id, criado_em)
              VALUES (${motorista}, 'recarga', ${-valor}, ${`Recarga #${r.id} · ${e.nome}`}, ${r.id}, ${fim})`;
          }
          n++;
        }
      }
    }
    if (!n) return;
    // Cliente de demonstração com saldo baixo ganha um Pix simulado, como no seed.
    const baixos = await tx<{ id: number; saldo: number }[]>`
      SELECT motorista_id AS id, sum(valor_centavos)::int AS saldo FROM carteira_movimentos
      WHERE motorista_id = ANY(${motoristas}) GROUP BY motorista_id HAVING sum(valor_centavos) < 10000`;
    for (const b of baixos) {
      const valor = Math.min(200000, Math.ceil((-b.saldo + 30000 + sorteio(15000)) / 1000) * 1000);
      const [p] = await tx<{ id: number }[]>`
        INSERT INTO pagamentos (motorista_id, metodo, valor_centavos, provedor, provedor_id, status, pago_em)
        VALUES (${b.id}, 'pix', ${valor}, 'simulado', ${`DEMO-${b.id}-${Date.now()}`}, 'pago', now()) RETURNING id`;
      await tx`INSERT INTO carteira_movimentos (motorista_id, tipo, valor_centavos, descricao, pagamento_id) VALUES (${b.id}, 'credito', ${valor}, 'Crédito via Pix', ${p.id})`;
    }
    await tx`UPDATE motoristas m SET saldo_centavos = (SELECT coalesce(sum(valor_centavos), 0) FROM carteira_movimentos c WHERE c.motorista_id = m.id)
      WHERE m.id = ANY(${motoristas})`;
  });
}
