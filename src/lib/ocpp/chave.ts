// Chave no endereço OCPP (/ocpp/k-<chave>/<código>), para carregador sem campo
// de usuário e senha. Só o hash fica no banco.
import { createHash } from "crypto";

export const hashChave = (chave: string) => createHash("sha256").update("ocpp-chave:" + chave).digest("hex");
