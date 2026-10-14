// Peças comuns do backup e da restauração: bucket S3, nomes dos arquivos e
// execução do pg_dump/pg_restore.
//
// O arquivo de backup é o pg_dump em formato custom (já comprimido),
// criptografado com age para a chave pública BACKUP_CHAVE_PUBLICA. O serviço
// de backup só tem a chave pública: quem conseguir ler o bucket não consegue
// abrir o backup. A chave privada fica fora do Railway (cofre de senhas da
// Logos) e só aparece na hora de restaurar.
import { spawn } from "node:child_process";
import { S3Client } from "@aws-sdk/client-s3";

export const PREFIXO = "backups/";
const EXT = ".dump.age";

export function exigir(nome) {
  const v = process.env[nome]?.trim();
  if (!v) throw new Error(`Variável ${nome} não definida.`);
  return v;
}

// Bucket S3 (Railway Buckets ou qualquer S3 compatível). Com o bucket do
// Railway no mesmo projeto, as variáveis vêm por referência.
export function bucket() {
  const client = new S3Client({
    endpoint: exigir("BACKUP_S3_ENDPOINT"),
    region: process.env.BACKUP_S3_REGION?.trim() || "auto",
    forcePathStyle: process.env.BACKUP_S3_PATH_STYLE === "sim",
    credentials: {
      accessKeyId: exigir("BACKUP_S3_ACCESS_KEY_ID"),
      secretAccessKey: exigir("BACKUP_S3_SECRET_ACCESS_KEY"),
    },
  });
  return { client, nome: exigir("BACKUP_S3_BUCKET") };
}

// backups/2026-10-07T06-00-00Z.dump.age: a ordem alfabética é a ordem no tempo.
export function chaveDoBackup(d = new Date()) {
  return PREFIXO + d.toISOString().slice(0, 19).replace(/:/g, "-") + "Z" + EXT;
}

export function dataDaChave(chave) {
  const m = chave.match(/^backups\/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.dump\.age$/);
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : null;
}

// Retenção: tudo dos últimos 30 dias + o primeiro backup de cada um dos
// últimos 12 meses. Devolve as chaves que podem ser apagadas.
export function paraApagar(chaves, agora = new Date(), dias = 30, meses = 12) {
  const limiteDiario = agora.getTime() - dias * 86_400_000;
  const limiteMensal = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - meses + 1, 1)).getTime();
  const primeiroDoMes = new Map();
  const validas = chaves
    .map((c) => ({ c, d: dataDaChave(c) }))
    .filter((x) => x.d)
    .sort((a, b) => a.d - b.d);
  for (const x of validas) {
    const mes = x.d.toISOString().slice(0, 7);
    if (!primeiroDoMes.has(mes)) primeiroDoMes.set(mes, x.c);
  }
  const mensais = new Set(primeiroDoMes.values());
  return validas
    .filter((x) => x.d.getTime() < limiteDiario && !(mensais.has(x.c) && x.d.getTime() >= limiteMensal))
    .map((x) => x.c);
}

// Roda um binário do Postgres e devolve a saída inteira. A URL do banco vai
// por variável de ambiente, nunca aparece em log nem em mensagem de erro.
export function rodar(bin, args, { url, entrada } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.PG_BIN ? `${process.env.PG_BIN}/${bin}` : bin, args, {
      env: { ...process.env, ...(url ? conexao(url) : {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out = [];
    let err = "";
    p.stdout.on("data", (b) => out.push(b));
    p.stderr.on("data", (b) => (err += b));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${bin} saiu com código ${code}: ${err.trim().slice(0, 500)}`));
    });
    if (entrada) p.stdin.end(entrada);
    else p.stdin.end();
  });
}

// Converte a URL do banco nas variáveis PG* que o pg_dump/pg_restore leem.
function conexao(url) {
  const u = new URL(url);
  const env = {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
  };
  const ssl = u.searchParams.get("sslmode");
  if (ssl) env.PGSSLMODE = ssl;
  else if (u.hostname.endsWith(".railway.internal") || u.hostname === "localhost" || u.hostname === "127.0.0.1") env.PGSSLMODE = "disable";
  return env;
}

export function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}
