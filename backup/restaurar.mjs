// Restauração de um backup.
//
//   node restaurar.mjs --listar
//   node restaurar.mjs --baixar [chave]          salva o .dump descriptografado
//   node restaurar.mjs --destino <url> [chave] --confirmar
//
// Sem chave, usa o backup mais recente. Precisa de BACKUP_CHAVE_PRIVADA
// (AGE-SECRET-KEY-1..., do cofre da Logos) e das variáveis do bucket.
//
// --destino apaga e recria as tabelas no banco indicado. Teste a restauração
// num banco novo (staging ou local) antes de pensar em produção.
import { writeFileSync } from "node:fs";
import { Decrypter } from "age-encryption";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import postgres from "postgres";
import { exigir, bucket, dataDaChave, rodar, mb, PREFIXO } from "./comum.mjs";

const args = process.argv.slice(2);
const opc = (n) => args.includes(n);
const valor = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const destino = valor("--destino");
const chavePedida = args.find((a) => a.startsWith(PREFIXO));

async function listar(client, nome) {
  const chaves = [];
  let token;
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket: nome, Prefix: PREFIXO, ContinuationToken: token }));
    for (const o of r.Contents ?? []) if (o.Key && dataDaChave(o.Key)) chaves.push({ chave: o.Key, tamanho: o.Size ?? 0 });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return chaves.sort((a, b) => a.chave.localeCompare(b.chave));
}

async function baixar(client, nome, chave) {
  const r = await client.send(new GetObjectCommand({ Bucket: nome, Key: chave }));
  const cifrado = await r.Body.transformToByteArray();
  const d = new Decrypter();
  d.addIdentity(exigir("BACKUP_CHAVE_PRIVADA"));
  return Buffer.from(await d.decrypt(cifrado));
}

async function main() {
  const { client, nome } = bucket();
  const todos = await listar(client, nome);

  if (opc("--listar")) {
    for (const b of todos) console.log(`${b.chave}  ${mb(b.tamanho)}`);
    console.log(`${todos.length} backup(s).`);
    return;
  }

  const chave = chavePedida ?? todos.at(-1)?.chave;
  if (!chave) throw new Error("Nenhum backup no bucket.");
  console.log("Backup:", chave);
  const dump = await baixar(client, nome, chave);
  console.log("Descriptografado:", mb(dump.length));

  if (opc("--baixar")) {
    const arquivo = chave.slice(PREFIXO.length).replace(/\.age$/, "");
    writeFileSync(arquivo, dump);
    console.log(`Salvo em ${arquivo} (restaurar com pg_restore --clean --if-exists --no-owner -d <url> ${arquivo}).`);
    return;
  }

  if (!destino) throw new Error("Use --listar, --baixar ou --destino <url>.");
  if (!opc("--confirmar")) throw new Error("A restauração apaga e recria as tabelas do destino. Repita com --confirmar.");

  await rodar("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", "--exit-on-error", "--dbname", destino], { entrada: dump });

  // Conferência rápida do resultado.
  const sql = postgres(destino, { max: 1, onnotice: () => {} });
  try {
    for (const t of ["usuarios", "clientes", "conversas", "mensagens", "audit_log"]) {
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM ${sql(t)}`;
      console.log(`  ${t}: ${n}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  console.log("Restauração concluída.");
}

main().catch((err) => {
  console.error("[restaurar] FALHOU:", err instanceof Error ? err.message : err);
  process.exit(1);
});
