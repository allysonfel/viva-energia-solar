// LGPD do motorista: cópia dos dados (direito de acesso) e exclusão da conta.
// Exclusão = anonimizar: os dados pessoais saem; recargas, pagamentos e
// extrato ficam (registro fiscal e de consumo), sem ligação com a pessoa.
import "server-only";
import { randomBytes } from "crypto";
import { sql } from "./db";
import { hashPassword } from "./auth";

export async function dadosDoMotorista(id: number) {
  const [conta] = await sql`
    SELECT nome, email, cpf, celular, veiculo, placa, conectores, saldo_centavos, aceita_promocoes, avisos_recarga,
      consentimento_em, criado_em, ultimo_acesso,
      EXISTS (SELECT 1 FROM motorista_fotos f WHERE f.motorista_id = motoristas.id) AS tem_foto_de_perfil
    FROM motoristas WHERE id = ${id}`;
  if (!conta) return null;
  const recargas = await sql`
    SELECT r.id, e.nome AS estacao, r.conector_numero, r.inicio, r.fim, r.energia_wh, r.valor_centavos, r.status, r.tarifa_nome, r.desconto_pct
    FROM recargas r JOIN estacoes e ON e.id = r.estacao_id WHERE r.motorista_id = ${id} ORDER BY r.inicio`;
  const carteira = await sql`SELECT tipo, valor_centavos, descricao, criado_em FROM carteira_movimentos WHERE motorista_id = ${id} ORDER BY id`;
  const pagamentos = await sql`SELECT metodo, valor_centavos, status, cartao_final, cartao_bandeira, criado_em, pago_em FROM pagamentos WHERE motorista_id = ${id} ORDER BY id`;
  const vouchers = await sql`
    SELECT v.codigo, v.pct, mv.origem, mv.resgatado_em, mv.usado_em FROM motorista_vouchers mv JOIN vouchers v ON v.id = mv.voucher_id WHERE mv.motorista_id = ${id}`;
  return { gerado_em: new Date().toISOString(), conta, recargas, carteira, pagamentos, vouchers };
}

export async function excluirMotorista(id: number): Promise<"ok" | "saldo" | "recarga"> {
  return sql.begin(async (tx) => {
    const [m] = await tx<{ saldo_centavos: number }[]>`SELECT saldo_centavos FROM motoristas WHERE id = ${id} FOR UPDATE`;
    if (!m) return "ok";
    if (m.saldo_centavos > 0) return "saldo";
    const [aberta] = await tx`SELECT 1 FROM recargas WHERE motorista_id = ${id} AND status = 'em_andamento'`;
    if (aberta) return "recarga";
    await tx`
      UPDATE motoristas SET nome = 'Conta excluída', email = ${`excluida-${id}@removido.local`}, cpf = NULL, celular = '0000000000',
        senha_hash = ${hashPassword(randomBytes(24).toString("hex"))}, veiculo = '', placa = '', conectores = '{}',
        id_tag = ${"X" + randomBytes(9).toString("hex").toUpperCase()}, aceita_promocoes = false, avisos_recarga = false,
        ativo = false, sessao_versao = sessao_versao + 1
      WHERE id = ${id}`;
    await tx`DELETE FROM push_inscricoes WHERE dono_tipo = 'motorista' AND dono_id = ${id}`;
    await tx`DELETE FROM motorista_fotos WHERE motorista_id = ${id}`;
    await tx`DELETE FROM avisos_motorista WHERE motorista_id = ${id}`;
    await tx`DELETE FROM recuperacao_senha WHERE motorista_id = ${id}`;
    await tx`UPDATE pagamentos SET pix_copia_cola = NULL WHERE motorista_id = ${id}`;
    return "ok";
  });
}
