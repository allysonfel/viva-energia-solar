import Link from "next/link";
import { requireMotorista } from "@/lib/motorista";
import { sql } from "@/lib/db";
import { provedorPagamentos } from "@/lib/pagamentos";
import { getSettings } from "@/lib/settings";
import { brl, quando } from "@/lib/format";
import { Ic } from "@/components/Ic";
import { Credito } from "./Credito";
import { MeusVouchers } from "./MeusVouchers";

export default async function Carteira({ searchParams }: { searchParams: Promise<{ bemvindo?: string }> }) {
  const m = await requireMotorista();
  const { bemvindo } = await searchParams;
  const s = await getSettings();
  const [mes] = await sql<{ gasto: number }[]>`
    SELECT coalesce(-sum(valor_centavos), 0)::bigint AS gasto FROM carteira_movimentos
    WHERE motorista_id = ${m.id} AND tipo = 'recarga' AND criado_em >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`;
  const extrato = await sql<{ id: number; tipo: string; valor_centavos: number; descricao: string; criado_em: Date; recarga_id: number | null }[]>`
    SELECT id, tipo, valor_centavos, descricao, criado_em, recarga_id FROM carteira_movimentos WHERE motorista_id = ${m.id} ORDER BY id DESC LIMIT 20`;
  const vouchers = await sql<{ codigo: string; pct: number; descricao: string; estacao: string | null; valido_ate: Date | null; usado: boolean }[]>`
    SELECT v.codigo, v.pct, v.descricao, e.nome AS estacao, v.valido_ate, mv.recarga_id IS NOT NULL AS usado
    FROM motorista_vouchers mv JOIN vouchers v ON v.id = mv.voucher_id LEFT JOIN estacoes e ON e.id = v.estacao_id
    WHERE mv.motorista_id = ${m.id} ORDER BY (mv.recarga_id IS NOT NULL), mv.id DESC LIMIT 20`;
  const pendentes = await sql<{ id: number; valor_centavos: number }[]>`
    SELECT id, valor_centavos FROM pagamentos WHERE motorista_id = ${m.id} AND metodo = 'pix' AND status = 'pendente' AND expira_em > now() ORDER BY id DESC LIMIT 3`;

  return (
    <div className="sec-pad">
      {bemvindo && <div className="aviso ok">Conta criada! Adicione crédito para fazer a primeira recarga (mínimo {brl(s.saldoMinimoCentavos)} para iniciar).</div>}
      <div className="wallet-card">
        <div className="glow" />
        <small>Saldo disponível</small>
        <div className="bal">{brl(m.saldo_centavos)}</div>
        <div className="row" style={{ position: "relative", gap: 18, fontSize: 12.5, color: "#A9C4B6" }}>
          <span>Este mês <b className="mono" style={{ color: "#fff" }}>{brl(mes.gasto)}</b> em recargas</span>
        </div>
      </div>
      {pendentes.map((p) => (
        <Link key={p.id} className="aviso info" href={`/carteira/pix/${p.id}`} style={{ display: "block", textDecoration: "none" }}>
          Pix de {brl(p.valor_centavos)} aguardando pagamento. Toque para ver o código.
        </Link>
      ))}
      <Credito simulado={provedorPagamentos().simulado} cartao={provedorPagamentos().cartao} />
      <MeusVouchers lista={vouchers.map((v) => ({
        codigo: v.codigo, pct: v.pct, descricao: v.descricao, onde: v.estacao ? `só na ${v.estacao}` : "",
        validade: v.valido_ate ? `até ${new Date(v.valido_ate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : "", usado: v.usado,
      }))} />
      <div className="box">
        <div className="box-title">Extrato</div>
        {extrato.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nenhum movimento ainda.</div>}
        {extrato.map((x) => {
          const corpo = (
            <>
              <span className="li-ic"><Ic n={x.valor_centavos > 0 ? "plus" : "bolt"} /></span>
              <div className="li-main"><b>{x.descricao}</b><small>{quando(x.criado_em)}</small></div>
              <b className="mono" style={{ color: x.valor_centavos > 0 ? "var(--g600)" : undefined }}>{x.valor_centavos > 0 ? "+" : "-"}{brl(Math.abs(x.valor_centavos))}</b>
            </>
          );
          return x.recarga_id ? (
            <Link key={x.id} className="list-item" href={`/recibo/${x.recarga_id}`} style={{ textDecoration: "none", color: "inherit" }}>{corpo}</Link>
          ) : (
            <div key={x.id} className="list-item">{corpo}</div>
          );
        })}
      </div>
    </div>
  );
}
