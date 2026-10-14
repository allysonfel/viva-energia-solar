// Dados de demonstração (desenvolvimento e apresentação): as 6 estações do
// protótipo como carregadores SIMULADOS, 3 parceiros, as 4 faixas de tarifa,
// 2 vouchers, os 12 clientes do protótipo (senha viva-demo-2026) com
// carteira, um operador e um parceiro de teste, e o histórico dos últimos 25 dias.
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

// Cartões da operação (recargas de teste/serviço, sem cobrança).
for (const t of ["VIVA-OPERACAO", "RFID-TECNICO-01"]) {
  await sql`INSERT INTO tags (id_tag, descricao, tipo) VALUES (${t}, 'Cartão da operação', 'operacao') ON CONFLICT DO NOTHING`;
}

// Faixas de tarifa do protótipo.
const TARIFAS = [["Madrugada", 0, 6, 149, "#BFEBD5"], ["Comercial", 6, 18, 189, "#34B37A"], ["Ponta", 18, 21, 239, "#0B3B2A"], ["Noite", 21, 24, 179, "#7BCFA6"]];
for (const [nome, ini, fim, preco, cor] of TARIFAS) {
  await sql`INSERT INTO tarifas (nome, hora_inicio, hora_fim, preco_kwh_centavos, cor) VALUES (${nome}, ${ini}, ${fim}, ${preco}, ${cor})`;
}
const tarifaDe = (d) => {
  const h = new Date(d.getTime() - 3 * 3_600_000).getUTCHours();
  return TARIFAS.find(([, i, f]) => h >= i && h < f);
};

const [vBoas] = await sql`INSERT INTO vouchers (codigo, pct, descricao, limite_usos) VALUES ('VIVA20', 20, 'Boas-vindas · primeira recarga', 500) RETURNING id`;
await sql`INSERT INTO vouchers (codigo, pct, descricao, valido_ate) VALUES ('MADRUGADA10', 10, 'Recarregue de madrugada', ${new Date(Date.now() + 60 * 86_400_000)})`;

// Clientes do protótipo, com CPF válido gerado e a senha de demonstração.
const cpf = () => {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(dv(9));
  d.push(dv(10));
  return d.join("");
};
const CLIENTES = [["Ana Beatriz Lins", "BYD Dolphin"], ["Rafael Cavalcanti", "Volvo EX30"], ["Juliana Maia", "BYD Seal"], ["Pedro Henrique Queiroga", "GWM Ora 03"],
  ["Camila Nóbrega", "BYD Song Plus"], ["Thiago Ramalho", "Chevrolet Bolt"], ["Larissa Diniz", "Renault Kwid E-Tech"], ["Bruno Wanderley", "BYD Dolphin Mini"],
  ["Marina Gadelha", "Volvo EX30"], ["Felipe Albuquerque", "BYD Yuan Plus"], ["Letícia Brito", "GWM Ora 03"], ["Gustavo Farias", "BYD Dolphin"]];
const senhaDemo = hash("viva-demo-2026");
const motoristas = [];
for (const [i, [nome, veiculo]] of CLIENTES.entries()) {
  const email = nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@demo.local";
  const [m] = await sql`
    INSERT INTO motoristas (nome, cpf, celular, email, senha_hash, veiculo, conectores, id_tag, consentimento_em, aceita_promocoes)
    VALUES (${nome}, ${cpf()}, ${"8399" + String(1000000 + i * 7919).slice(0, 7)}, ${email}, ${senhaDemo}, ${veiculo}, ${["CCS2", "Tipo 2"]},
      ${"MDEMO" + String(i).padStart(3, "0")}, now() - interval '40 days', ${i % 2 === 0})
    RETURNING id`;
  motoristas.push(m.id);
}
// Cada cliente começou com R$ 2.000 de crédito (Pix) para cobrir o histórico.
for (const id of motoristas) {
  const [p] = await sql`
    INSERT INTO pagamentos (motorista_id, metodo, valor_centavos, provedor, provedor_id, status, pago_em, criado_em)
    VALUES (${id}, 'pix', 200000, 'simulado', ${"SEED" + id}, 'pago', now() - interval '30 days', now() - interval '30 days') RETURNING id`;
  await sql`INSERT INTO carteira_movimentos (motorista_id, tipo, valor_centavos, descricao, pagamento_id, criado_em) VALUES (${id}, 'credito', 200000, 'Crédito via Pix', ${p.id}, now() - interval '30 days')`;
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
      // 92% das recargas são de clientes do app; o resto, da operação (sem cobrança).
      const motorista = Math.random() < 0.92 ? motoristas[Math.floor(Math.random() * motoristas.length)] : null;
      const interrompida = Math.random() < 0.04;
      const [nomeT, , , preco] = tarifaDe(inicio);
      const valor = Math.round((wh * preco) / 1000);
      const [r] = await sql`
        INSERT INTO recargas (estacao_id, conector_numero, id_tag, motorista_id, origem, status, inicio, fim, medidor_inicio_wh, medidor_fim_wh,
          energia_wh, preco_kwh_centavos, preco_cheio_centavos, tarifa_nome, custo_kwh_centavos, valor_centavos, motivo_fim)
        VALUES (${e.id}, ${conector}, ${motorista ? "MDEMO" : "VIVA-OPERACAO"}, ${motorista}, ${motorista ? "app" : "painel"},
          ${interrompida ? "interrompida" : "concluida"}, ${inicio}, ${fim}, ${1_000_000}, ${1_000_000 + wh}, ${wh}, ${preco}, ${preco}, ${nomeT}, 98,
          ${valor}, ${interrompida ? "PowerLoss" : "EVDisconnected"})
        RETURNING id`;
      if (motorista) {
        await sql`INSERT INTO carteira_movimentos (motorista_id, tipo, valor_centavos, descricao, recarga_id, criado_em)
          VALUES (${motorista}, 'recarga', ${-valor}, ${`Recarga #${r.id} · ${ESTACOES[k][1]}`}, ${r.id}, ${fim})`;
      }
      total++;
    }
  }
}

// Quem gastou mais que o crédito inicial ganha outro Pix para fechar com saldo positivo.
const devedores = await sql`
  SELECT motorista_id AS id, sum(valor_centavos)::bigint AS saldo FROM carteira_movimentos GROUP BY motorista_id HAVING sum(valor_centavos) < 5000`;
for (const d of devedores) {
  const valor = Math.ceil((-Number(d.saldo) + 3000 + Math.random() * 15000) / 1000) * 1000;
  const [p] = await sql`
    INSERT INTO pagamentos (motorista_id, metodo, valor_centavos, provedor, provedor_id, status, pago_em, criado_em)
    VALUES (${d.id}, 'pix', ${Math.min(valor, 200000)}, 'simulado', ${"SEED2-" + d.id}, 'pago', now() - interval '10 days', now() - interval '10 days') RETURNING id`;
  await sql`INSERT INTO carteira_movimentos (motorista_id, tipo, valor_centavos, descricao, pagamento_id, criado_em) VALUES (${d.id}, 'credito', ${Math.min(valor, 200000)}, 'Crédito via Pix', ${p.id}, now() - interval '10 days')`;
}
// Saldo = soma do extrato.
await sql`UPDATE motoristas m SET saldo_centavos = (SELECT coalesce(sum(valor_centavos), 0) FROM carteira_movimentos c WHERE c.motorista_id = m.id)`;
// Ana já resgatou o VIVA20.
await sql`INSERT INTO motorista_vouchers (motorista_id, voucher_id) VALUES (${motoristas[0]}, ${vBoas.id})`;

// Usuários de demonstração (só em ambiente de teste: senha conhecida).
const demo = [
  ["Carla (operação)", "operacao@demo.local", "operador", null],
  ["Hotel Litoral Tambaú", "hotel@demo.local", "parceiro", parceiros["Hotel Litoral Tambaú"]],
];
for (const [nome, email, perfil, parceiro] of demo) {
  await sql`INSERT INTO usuarios (nome, email, senha_hash, perfil, parceiro_id) VALUES (${nome}, ${email}, ${hash("viva-demo-2026")}, ${perfil}, ${parceiro}) ON CONFLICT (email) DO NOTHING`;
}

console.log(`Pronto: ${ids.length} estações simuladas, 3 parceiros, 4 faixas de tarifa, 2 vouchers, ${motoristas.length} clientes, ${total} recargas de histórico.`);
console.log("Senha de demonstração viva-demo-2026: painel operacao@demo.local e hotel@demo.local; app ana@demo.local (e os outros clientes, primeiro nome @demo.local).");
console.log("Reinicie o sistema para os carregadores simulados conectarem.");
await sql.end();
