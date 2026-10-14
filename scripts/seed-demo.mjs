// Dados de demonstração (desenvolvimento e apresentação): as 6 estações do
// protótipo como carregadores SIMULADOS, 3 parceiros, um operador e um
// parceiro de teste, e o histórico de recargas dos últimos 25 dias.
// Só roda em banco sem estações. Rodar com o sistema já tendo subido uma vez
// (as tabelas são criadas na primeira subida):
//   DATABASE_URL=... node scripts/seed-demo.mjs
import postgres from "postgres";
import { randomBytes, scryptSync } from "crypto";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Defina DATABASE_URL.");
const sql = postgres(url, { ssl: /localhost|127\.0\.0\.1|railway\.internal/.test(url) ? false : "prefer", onnotice: () => {} });

const hash = (s) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(s, salt, 64).toString("hex")}`;
};

const [{ n }] = await sql`SELECT count(*)::int AS n FROM estacoes`;
if (n > 0) {
  console.log("Já existem estações: nada feito (o seed só roda em banco vazio).");
  process.exit(0);
}

const parceiros = {};
for (const [nome, contato, pct] of [
  ["Hotel Litoral Tambaú", "Recepção (83) 3000-0000", 15],
  ["Condomínio Altiplano Park", "Síndico", 10],
  ["Posto parceiro BR-230", "Gerente do posto", 12],
]) {
  const [p] = await sql`INSERT INTO parceiros (nome, contato, repasse_pct) VALUES (${nome}, ${contato}, ${pct}) RETURNING id`;
  parceiros[nome] = p.id;
}

const ESTACOES = [
  ["VIVA-JPA-01", "Viva Manaíra", "Av. Gov. Flávio Ribeiro Coutinho, 805", "Manaíra", -7.0945, -34.8341, null, [["CCS2", 60], ["Tipo 2", 22]]],
  ["VIVA-JPA-02", "Viva Tambaú", "Av. Almirante Tamandaré, 229", "Tambaú", -7.1153, -34.8228, "Hotel Litoral Tambaú", [["CCS2", 40], ["CCS2", 40]]],
  ["VIVA-JPA-03", "Viva Epitácio", "Av. Epitácio Pessoa, 3100", "Tambauzinho", -7.1196, -34.8497, null, [["CCS2", 120], ["CHAdeMO", 50]]],
  ["VIVA-JPA-04", "Viva Altiplano", "Av. N. Sra. dos Navegantes, 1210", "Altiplano", -7.1353, -34.8262, "Condomínio Altiplano Park", [["Tipo 2", 22], ["Tipo 2", 22]]],
  ["VIVA-JPA-05", "Viva Bancários", "Rua Bancário Sérgio Guerra, 360", "Bancários", -7.1489, -34.8441, null, [["Tipo 2", 22]]],
  ["VIVA-JPA-06", "Viva BR-230 Cabedelo", "BR-230, km 4", "Intermares, Cabedelo", -7.0538, -34.8460, "Posto parceiro BR-230", [["CCS2", 60], ["Tipo 2", 22]]],
];

const ids = [];
for (const [codigo, nome, end, bairro, lat, lng, parceiro, cons] of ESTACOES) {
  const [e] = await sql`
    INSERT INTO estacoes (codigo, nome, endereco, bairro, cidade, lat, lng, parceiro_id, simulada, preco_kwh_centavos, custo_kwh_centavos)
    VALUES (${codigo}, ${nome}, ${end}, ${bairro}, ${bairro.includes("Cabedelo") ? "Cabedelo" : "João Pessoa"}, ${lat}, ${lng},
      ${parceiro ? parceiros[parceiro] : null}, true, 189, 98)
    RETURNING id`;
  for (const [i, [tipo, kw]] of cons.entries()) {
    await sql`INSERT INTO conectores (estacao_id, numero, tipo, potencia_w) VALUES (${e.id}, ${i + 1}, ${tipo}, ${kw * 1000})`;
  }
  ids.push({ id: e.id, cons });
}

// Cartões de teste (os "cartões RFID" dos motoristas de demonstração).
for (const t of ["VIVA-OPERACAO", "RFID-ANA-01", "RFID-RAFA-02", "RFID-JU-03"]) {
  await sql`INSERT INTO tags (id_tag, descricao, tipo) VALUES (${t}, 'Cartão de demonstração', 'operacao') ON CONFLICT DO NOTHING`;
}

// Histórico: 25 dias, mais recargas à noite e no fim de semana.
const agora = Date.now();
let total = 0;
for (let d = 25; d >= 1; d--) {
  for (const [k, e] of ids.entries()) {
    const n = 2 + Math.floor(Math.random() * (k === 1 ? 7 : k === 4 ? 3 : 5));
    for (let i = 0; i < n; i++) {
      const [tipo, kw] = e.cons[Math.floor(Math.random() * e.cons.length)];
      const conector = e.cons.findIndex((c) => c[0] === tipo && c[1] === kw) + 1;
      const hora = [7, 8, 9, 12, 13, 17, 18, 19, 20, 21, 22][Math.floor(Math.random() * 11)];
      const inicio = new Date(agora - d * 86_400_000 + (hora - 12) * 3_600_000 + Math.floor(Math.random() * 3_600_000));
      const wh = Math.round((8 + Math.random() * 32) * 1000);
      const potenciaMedia = Math.min(kw, 45) * 1000 * (0.6 + Math.random() * 0.3);
      const fim = new Date(inicio.getTime() + (wh / potenciaMedia) * 3_600_000);
      const tag = ["RFID-ANA-01", "RFID-RAFA-02", "RFID-JU-03", "VIVA-OPERACAO"][Math.floor(Math.random() * 4)];
      const interrompida = Math.random() < 0.04;
      await sql`
        INSERT INTO recargas (estacao_id, conector_numero, id_tag, origem, status, inicio, fim, medidor_inicio_wh, medidor_fim_wh,
          energia_wh, preco_kwh_centavos, custo_kwh_centavos, valor_centavos, motivo_fim)
        VALUES (${e.id}, ${conector}, ${tag}, 'carregador', ${interrompida ? "interrompida" : "concluida"}, ${inicio}, ${fim},
          ${1_000_000}, ${1_000_000 + wh}, ${wh}, 189, 98, ${Math.round((wh * 189) / 1000)}, ${interrompida ? "PowerLoss" : "EVDisconnected"})`;
      total++;
    }
  }
}

// Usuários de demonstração (só em ambiente de teste: senha conhecida).
const demo = [
  ["Carla (operação)", "operacao@demo.local", "operador", null],
  ["Hotel Litoral Tambaú", "hotel@demo.local", "parceiro", parceiros["Hotel Litoral Tambaú"]],
];
for (const [nome, email, perfil, parceiro] of demo) {
  await sql`INSERT INTO usuarios (nome, email, senha_hash, perfil, parceiro_id) VALUES (${nome}, ${email}, ${hash("viva-demo-2026")}, ${perfil}, ${parceiro}) ON CONFLICT (email) DO NOTHING`;
}

console.log(`Pronto: ${ids.length} estações simuladas, 3 parceiros, ${total} recargas de histórico.`);
console.log("Usuários de demonstração (senha viva-demo-2026): operacao@demo.local, hotel@demo.local.");
console.log("Reinicie o sistema para os carregadores simulados conectarem.");
await sql.end();
