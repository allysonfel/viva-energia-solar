// Backup diário do banco (serviço cron do Railway, roda e termina).
//
// 1. pg_dump em formato custom
// 2. pg_restore --list no arquivo: confirma que o dump é legível
// 3. criptografa com age (chave pública)
// 4. envia ao bucket e confere o tamanho gravado
// 5. apaga o que saiu da retenção (30 dias + 1 por mês por 12 meses)
// 6. registra no audit_log (o sino dos gestores avisa se atrasar)
//
// Qualquer falha termina com código 1: o Railway marca a execução como falha.
import { Encrypter } from "age-encryption";
import { PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import postgres from "postgres";
import { exigir, bucket, chaveDoBackup, paraApagar, rodar, mb, PREFIXO } from "./comum.mjs";

const url = exigir("DATABASE_URL");
const publica = exigir("BACKUP_CHAVE_PUBLICA");
if (!publica.startsWith("age1")) throw new Error("BACKUP_CHAVE_PUBLICA inválida (deve começar com age1).");

async function registrar(acao, detalhe) {
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 15 });
  try {
    await sql`INSERT INTO audit_log (ator, acao, entidade, detalhe) VALUES ('sistema:backup', ${acao}, 'backup', ${detalhe})`;
  } catch (err) {
    console.error("[backup] não consegui registrar no audit_log:", err instanceof Error ? err.message : err);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const inicio = Date.now();
  const { client, nome } = bucket();
  const chave = chaveDoBackup();

  const dump = await rodar("pg_dump", ["--format=custom", "--compress=6"], { url });
  if (dump.length < 1024) throw new Error(`Dump pequeno demais (${dump.length} bytes).`);

  const lista = (await rodar("pg_restore", ["--list"], { entrada: dump })).toString();
  for (const tabela of ["usuarios", "estacoes", "conectores", "recargas", "audit_log"]) {
    if (!new RegExp(`TABLE DATA public ${tabela} `).test(lista)) throw new Error(`Tabela ${tabela} ausente no dump.`);
  }

  const e = new Encrypter();
  e.addRecipient(publica);
  const cifrado = await e.encrypt(new Uint8Array(dump));

  await client.send(new PutObjectCommand({ Bucket: nome, Key: chave, Body: cifrado, ContentType: "application/octet-stream" }));
  const head = await client.send(new HeadObjectCommand({ Bucket: nome, Key: chave }));
  if (Number(head.ContentLength) !== cifrado.length) throw new Error("Tamanho gravado no bucket não confere.");

  // Retenção. Nunca apaga o backup que acabou de subir.
  const chaves = [];
  let token;
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket: nome, Prefix: PREFIXO, ContinuationToken: token }));
    for (const o of r.Contents ?? []) if (o.Key) chaves.push(o.Key);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  const velhos = paraApagar(chaves).filter((c) => c !== chave);
  for (const c of velhos) await client.send(new DeleteObjectCommand({ Bucket: nome, Key: c }));

  const detalhe = `${chave} · ${mb(cifrado.length)} · ${velhos.length} antigo(s) removido(s) · ${((Date.now() - inicio) / 1000).toFixed(1)} s`;
  console.log("[backup] ok:", detalhe);
  await registrar("backup.ok", detalhe);
}

main().catch(async (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[backup] FALHOU:", msg);
  await registrar("backup.falhou", msg.slice(0, 300));
  process.exit(1);
});
