import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser, requireAba } from "@/lib/session";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ajustarSaldo } from "@/lib/carteira";
import { cpfMascarado, celularFormatado } from "@/lib/cpf";
import { brl, kwh, quando, dataBr, centavosDe } from "@/lib/format";
import { BadgeRecarga } from "@/components/Badge";
import { Ic } from "@/components/Ic";

// Ajuste manual de saldo (só admin): estorno, cortesia, correção. Fica no
// extrato do cliente e no audit_log com o motivo.
async function ajustar(fd: FormData) {
  "use server";
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id"));
  const sinal = fd.get("tipo") === "debito" ? -1 : 1;
  const valor = centavosDe(fd.get("valor"));
  const motivo = String(fd.get("motivo") ?? "").trim().slice(0, 80);
  if (!valor || valor < 1 || valor > 100000 || motivo.length < 3) redirect(`/painel/clientes/${id}?erro=ajuste`);
  const [m] = await sql`SELECT 1 FROM motoristas WHERE id = ${id}`;
  if (!m) redirect("/painel/clientes");
  await ajustarSaldo(id, sinal * valor, `Ajuste: ${motivo}`, u.id);
  await audit(`usuario:${u.id}`, "saldo_ajustado", "motorista", id, `${sinal > 0 ? "+" : "-"}${valor} centavos: ${motivo}`);
  redirect(`/painel/clientes/${id}?ok=ajuste`);
}

// Voucher de cortesia: já entra resgatado na carteira do cliente.
async function enviarVoucher(fd: FormData) {
  "use server";
  const u = await requireAba("clientes");
  const id = Number(fd.get("id"));
  const voucher = Number(fd.get("voucher"));
  const [v] = await sql<{ id: number; codigo: string }[]>`
    SELECT id, codigo FROM vouchers WHERE id = ${voucher} AND ativo AND (valido_ate IS NULL OR valido_ate >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)`;
  const [m] = await sql`SELECT 1 FROM motoristas WHERE id = ${id} AND ativo`;
  if (!v || !m) redirect(`/painel/clientes/${id}?erro=voucher`);
  const r = await sql`INSERT INTO motorista_vouchers (motorista_id, voucher_id, origem) VALUES (${id}, ${v.id}, 'cortesia') ON CONFLICT DO NOTHING RETURNING id`;
  if (!r.length) redirect(`/painel/clientes/${id}?erro=jatem`);
  await audit(`usuario:${u.id}`, "voucher_cortesia", "motorista", id, v.codigo);
  redirect(`/painel/clientes/${id}?ok=voucher`);
}

async function ativar(fd: FormData) {
  "use server";
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id"));
  const ativo = fd.get("ativo") === "1";
  // Desativar derruba as sessões do app (versão nova).
  await sql`UPDATE motoristas SET ativo = ${ativo}, sessao_versao = sessao_versao + 1 WHERE id = ${id}`;
  await audit(`usuario:${u.id}`, ativo ? "motorista_reativado" : "motorista_desativado", "motorista", id);
  redirect(`/painel/clientes/${id}?ok=1`);
}

const MSG: Record<string, [string, string]> = {
  "ok:ajuste": ["ok", "Saldo ajustado."],
  "ok:voucher": ["ok", "Voucher enviado. Já aparece na carteira do cliente."],
  "ok:1": ["ok", "Salvo."],
  "erro:ajuste": ["erro", "Informe valor (até R$ 1.000) e o motivo."],
  "erro:voucher": ["erro", "Voucher indisponível."],
  "erro:jatem": ["erro", "O cliente já tem esse voucher."],
};

export default async function Cliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const u = await requireAba("clientes");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const q = await searchParams;
  const [m] = await sql<{ id: number; nome: string; email: string; cpf: string; celular: string; veiculo: string; placa: string; conectores: string[]; saldo_centavos: number; ativo: boolean; aceita_promocoes: boolean; criado_em: Date; ultimo_acesso: Date | null }[]>`
    SELECT id, nome, email, cpf, celular, veiculo, placa, conectores, saldo_centavos, ativo, aceita_promocoes, criado_em, ultimo_acesso FROM motoristas WHERE id = ${id}`;
  if (!m) notFound();
  const recargas = await sql<{ id: number; estacao: string; inicio: Date; energia_wh: number; valor_centavos: number; status: string; desconto_pct: number }[]>`
    SELECT r.id, e.nome AS estacao, r.inicio, r.energia_wh, r.valor_centavos, r.status, r.desconto_pct FROM recargas r JOIN estacoes e ON e.id = r.estacao_id
    WHERE r.motorista_id = ${id} ORDER BY r.inicio DESC LIMIT 15`;
  const extrato = await sql<{ id: number; descricao: string; valor_centavos: number; criado_em: Date; usuario: string | null }[]>`
    SELECT c.id, c.descricao, c.valor_centavos, c.criado_em, u.nome AS usuario FROM carteira_movimentos c LEFT JOIN usuarios u ON u.id = c.usuario_id
    WHERE c.motorista_id = ${id} ORDER BY c.id DESC LIMIT 15`;
  const vouchers = await sql<{ codigo: string; pct: number; origem: string; usado_em: Date | null }[]>`
    SELECT v.codigo, v.pct, mv.origem, mv.usado_em FROM motorista_vouchers mv JOIN vouchers v ON v.id = mv.voucher_id WHERE mv.motorista_id = ${id} ORDER BY mv.id DESC`;
  const disponiveis = await sql<{ id: number; codigo: string; pct: number }[]>`
    SELECT id, codigo, pct FROM vouchers WHERE ativo AND (valido_ate IS NULL OR valido_ate >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
      AND id NOT IN (SELECT voucher_id FROM motorista_vouchers WHERE motorista_id = ${id}) ORDER BY codigo`;
  const msg = q.ok ? MSG[`ok:${q.ok}`] : q.erro ? MSG[`erro:${q.erro}`] : null;
  const admin = u.perfil === "admin";

  return (
    <>
      <div className="between" style={{ marginBottom: 14 }}>
        <Link className="link" href="/painel/clientes" style={{ display: "flex", alignItems: "center", gap: 4 }}><Ic n="back" />Clientes</Link>
        <div className="row" style={{ gap: 8 }}>
          {!m.ativo && <span className="badge b-offline">Conta desativada</span>}
          {admin && <a className="btn btn-ghost btn-sm" href={`/painel/clientes/${m.id}/dados`}><Ic n="download" />Cópia dos dados (LGPD)</a>}
        </div>
      </div>
      {msg && <div className={`aviso ${msg[0]}`}>{msg[1]}</div>}
      <div className="grid2">
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-b">
              <b style={{ fontSize: 18 }}>{m.nome}</b>
              <div className="muted">{m.email} · {celularFormatado(m.celular)}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>CPF {cpfMascarado(m.cpf)} · cliente desde {dataBr(m.criado_em)}{m.aceita_promocoes ? " · aceita promoções" : ""}</div>
              <div className="kv" style={{ marginTop: 12 }}>
                <div><small>Saldo</small><b style={m.saldo_centavos < 0 ? { color: "var(--red)" } : undefined}>{brl(m.saldo_centavos)}</b></div>
                <div><small>Veículo</small><b>{m.veiculo || "-"}</b></div>
                <div><small>Conectores</small><b>{m.conectores.join(", ") || "-"}</b></div>
              </div>
            </div>
          </div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><h3>Recargas</h3></div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>#</th><th>Estação</th><th>Início</th><th>Status</th><th className="num">kWh</th><th className="num">Valor</th></tr></thead>
                <tbody>
                  {recargas.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma recarga.</td></tr>}
                  {recargas.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">#{r.id}</td><td>{r.estacao}</td><td className="muted">{quando(r.inicio)}</td>
                      <td><BadgeRecarga status={r.status} />{r.desconto_pct ? <span className="badge b-disponivel" style={{ marginLeft: 4 }}>-{r.desconto_pct}%</span> : null}</td>
                      <td className="num">{kwh(r.energia_wh)}</td><td className="num">{brl(r.valor_centavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Extrato da carteira</h3></div>
            <div className="panel-b">
              {extrato.length === 0 && <div className="muted">Nenhum movimento.</div>}
              {extrato.map((x) => (
                <div key={x.id} className="list-item">
                  <div className="li-main"><b>{x.descricao}</b><small>{quando(x.criado_em)}{x.usuario ? ` · por ${x.usuario.split(" ")[0]}` : ""}</small></div>
                  <b className="mono" style={{ color: x.valor_centavos > 0 ? "var(--g600)" : undefined }}>{x.valor_centavos > 0 ? "+" : "-"}{brl(Math.abs(x.valor_centavos))}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <form action={enviarVoucher} className="panel" style={{ marginBottom: 16 }}>
            <input type="hidden" name="id" value={m.id} />
            <div className="panel-h"><h3>Vouchers</h3></div>
            <div className="panel-b">
              {vouchers.length === 0 && <div className="muted" style={{ marginBottom: 10 }}>Nenhum voucher.</div>}
              {vouchers.map((v) => (
                <div key={v.codigo} className="row" style={{ gap: 8, marginBottom: 6 }}>
                  <b className="mono">{v.codigo}</b><span className="badge b-disponivel">{v.pct}%</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{v.origem === "cortesia" ? "cortesia" : "resgatado"} · {v.usado_em ? `usado ${quando(v.usado_em)}` : "disponível"}</span>
                </div>
              ))}
              {disponiveis.length > 0 && m.ativo && (
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <select className="input" name="voucher" style={{ height: 36 }}>
                    {disponiveis.map((v) => <option key={v.id} value={v.id}>{v.codigo} · {v.pct}%</option>)}
                  </select>
                  <button className="btn btn-dark btn-sm"><Ic n="ticket" />Enviar voucher</button>
                </div>
              )}
            </div>
          </form>
          {admin && (
            <>
              <form action={ajustar} className="panel" style={{ marginBottom: 16 }}>
                <input type="hidden" name="id" value={m.id} />
                <div className="panel-h"><h3>Ajustar saldo</h3></div>
                <div className="panel-b">
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <select className="input" name="tipo" style={{ width: 130, height: 38 }}><option value="credito">Creditar</option><option value="debito">Debitar</option></select>
                    <input className="input mono" name="valor" placeholder="R$" maxLength={8} style={{ width: 100, height: 38 }} required />
                    <input className="input" name="motivo" placeholder="Motivo (ex.: recarga interrompida)" maxLength={80} style={{ flex: 1, minWidth: 180, height: 38 }} required />
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>Lançar ajuste</button>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Fica no extrato do cliente e registrado com seu nome.</div>
                </div>
              </form>
              <form action={ativar} className="panel">
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="ativo" value={m.ativo ? "0" : "1"} />
                <div className="panel-b between">
                  <div><b>{m.ativo ? "Desativar conta" : "Reativar conta"}</b><div className="muted" style={{ fontSize: 12.5 }}>{m.ativo ? "O cliente sai do app e não inicia recargas." : "O cliente volta a entrar no app."}</div></div>
                  <button className={`btn btn-sm ${m.ativo ? "btn-danger" : "btn-ghost"}`}>{m.ativo ? "Desativar" : "Reativar"}</button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
