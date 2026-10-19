// Aplica os números da operação passados pelo Miguel em 2026-10-16 num banco
// que já tem os dados de demonstração (o seed só roda em banco vazio):
// R$ 1,70/kWh em todas as estações, custo da energia R$ 0,85/kWh, repasse de
// 50% para cada parceiro e preço único (grade de faixas de horário vazia).
// O histórico de DEMONSTRAÇÃO (recargas dos clientes @demo.local e da
// operação) é recalculado com o preço novo, junto com o extrato e o saldo
// desses clientes. Recargas de qualquer outra conta não são tocadas.
//
// Sem --aplicar só mostra o que mudaria. Tudo numa transação.
//   DATABASE_URL=... node scripts/aplicar-operacao.mjs [--aplicar]
import postgres from "postgres";

const PRECO = 170; // centavos por kWh
const CUSTO = 85;
const REPASSE = 50;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Defina DATABASE_URL.");
const aplicar = process.argv.includes("--aplicar");
const sql = postgres(url, { ssl: /localhost|127\.0\.0\.1|railway\.internal/.test(url) ? false : "prefer", onnotice: () => {} });

// Recargas de demonstração: clientes do seed ou cartão da operação, já encerradas.
const DEMO = sql`(r.motorista_id IN (SELECT id FROM motoristas WHERE email LIKE '%@demo.local') OR (r.motorista_id IS NULL AND r.id_tag = 'VIVA-OPERACAO'))
  AND r.status IN ('concluida', 'interrompida') AND r.energia_wh IS NOT NULL`;

const [antes] = await sql`
  SELECT (SELECT count(*)::int FROM estacoes) AS estacoes,
         (SELECT count(*)::int FROM parceiros) AS parceiros,
         (SELECT count(*)::int FROM tarifas) AS faixas,
         (SELECT count(*)::int FROM recargas r WHERE ${DEMO}) AS recargas,
         (SELECT count(*)::int FROM recargas r WHERE NOT (${DEMO})) AS outras`;
console.log(`Estações: ${antes.estacoes} → R$ ${(PRECO / 100).toFixed(2).replace(".", ",")}/kWh, custo R$ ${(CUSTO / 100).toFixed(2).replace(".", ",")}`);
console.log(`Parceiros: ${antes.parceiros} → repasse ${REPASSE}%`);
console.log(`Faixas de horário: ${antes.faixas} → 0 (preço único)`);
console.log(`Recargas de demonstração recalculadas: ${antes.recargas} (outras ${antes.outras} ficam como estão)`);

if (!aplicar) {
  console.log("\nNada gravado. Rode com --aplicar para gravar.");
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx`UPDATE estacoes SET preco_kwh_centavos = ${PRECO}, custo_kwh_centavos = ${CUSTO}`;
  await tx`UPDATE parceiros SET repasse_pct = ${REPASSE}`;
  await tx`DELETE FROM tarifas`;
  // preco_kwh_centavos é o preço já com o desconto do voucher; preco_cheio, sem.
  await tx`
    UPDATE recargas r SET preco_cheio_centavos = ${PRECO}, tarifa_nome = NULL, custo_kwh_centavos = ${CUSTO},
      preco_kwh_centavos = round(${PRECO} * (100 - r.desconto_pct) / 100.0),
      valor_centavos = round(r.energia_wh * round(${PRECO} * (100 - r.desconto_pct) / 100.0) / 1000.0)
    WHERE ${DEMO}`;
  await tx`
    UPDATE carteira_movimentos c SET valor_centavos = -r.valor_centavos
    FROM recargas r WHERE c.recarga_id = r.id AND c.tipo = 'recarga' AND r.valor_centavos > 0 AND ${DEMO}`;
  await tx`
    UPDATE motoristas m SET saldo_centavos = (SELECT coalesce(sum(valor_centavos), 0) FROM carteira_movimentos c WHERE c.motorista_id = m.id)
    WHERE m.email LIKE '%@demo.local'`;
  await tx`INSERT INTO audit_log (ator, acao, entidade, detalhe)
    VALUES ('sistema:script', 'operacao_aplicada', 'configuracao', ${`R$ ${PRECO / 100}/kWh, custo ${CUSTO / 100}, repasse ${REPASSE}%, sem faixas, ${antes.recargas} recargas de demonstração recalculadas`})`;
});
console.log("\nGravado.");
await sql.end();
