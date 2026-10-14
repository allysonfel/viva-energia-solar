// Gera as chaves VAPID dos avisos no celular (Web Push). Uma vez por ambiente.
// As duas vão nas variáveis do Railway; a privada nunca no git ou no vault.
// Trocar as chaves desliga os avisos de todos: cada pessoa liga de novo no sino.
import { createECDH } from "crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
console.log("VAPID_PUBLIC_KEY=" + ecdh.getPublicKey().toString("base64url"));
console.log("VAPID_PRIVATE_KEY=" + ecdh.getPrivateKey().toString("base64url"));
