// Gera o par de chaves do backup (uma vez por cliente).
// A pública vai no Railway (BACKUP_CHAVE_PUBLICA). A privada vai SÓ para o
// cofre de senhas da Logos: sem ela, nenhum backup pode ser aberto.
import { generateX25519Identity, identityToRecipient } from "age-encryption";

const privada = await generateX25519Identity();
console.log("BACKUP_CHAVE_PUBLICA=" + (await identityToRecipient(privada)));
console.log("BACKUP_CHAVE_PRIVADA=" + privada);
