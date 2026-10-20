import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, requireAba } from "@/lib/session";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { Ic } from "@/components/Ic";

type V = { id: number; codigo: string; pct: number; descricao: string; estacao: string | null; valido_ate: Date | null; limite_usos: number | null; ativo: boolean; usos: number; resgates: number; vencido: boolean };

async function criar(fd: FormData) {
  "use server";
  const u = await requireUser(["admin"]);
  const codigo = String(fd.get("codigo") ?? "").trim().toUpperCase();
  const pct = Number(fd.get("pct"));
  const descricao = String(fd.get("descricao") ?? "").trim().slice(0, 80);
  const estacao = Number(fd.get("estacao")) || null;
  const validade = String(fd.get("validade") ?? "");
  const limite = fd.get("limite") ? Number(fd.get("limite")) : null;
  if (!/^[A-Z0-9]{3,20}$/.test(codigo)) redirect("/painel/vouchers?erro=codigo");
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) redirect("/painel/vouchers?erro=pct");
  if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) redirect("/painel/vouchers?erro=validade");
  if (limite !== null && (!Number.isInteger(limite) || limite < 1 || limite > 1_000_000)) redirect("/painel/vouchers?erro=limite");
  if (estacao) {
    const [e] = await sql`SELECT 1 FROM estacoes WHERE id = ${estacao} AND ativa`;
    if (!e) redirect("/painel/vouchers?erro=estacao");
  }
  const [existe] = await sql`SELECT 1 FROM vouchers WHERE codigo = ${codigo}`;
  if (existe) redirect("/painel/vouchers?erro=existe");
  const [v] = await sql<{ id: number }[]>`
    INSERT INTO vouchers (codigo, pct, descricao, estacao_id, valido_ate, limite_usos, criado_por)
    VALUES (${codigo}, ${pct}, ${descricao}, ${estacao}, ${validade || null}, ${limite}, ${u.id}) RETURNING id`;
  await audit(`usuario:${u.id}`, "voucher_criado", "voucher", v.id, `${codigo} ${pct}%`);
  redirect("/painel/vouchers?ok=1");
}

async function alternar(fd: FormData) {
  "use server";
  const u = await requireUser(["admin"]);
  const id = Number(fd.get("id"));
  const ativo = fd.get("ativo") === "1";
  await sql`UPDATE vouchers SET ativo = ${ativo} WHERE id = ${id}`;
  await audit(`usuario:${u.id}`, ativo ? "voucher_ativado" : "voucher_pausado", "voucher", id);
  redirect(`/painel/vouchers${ativo ? "" : "?f=inativos"}`);
}

const ERROS: Record<string, string> = {
  codigo: "Código: de 3 a 20 letras ou números, sem espaço (ex.: VIVA20).",
  pct: "Desconto entre 1% e 100%.",
  validade: "Data de validade inválida.",
  limite: "Limite de usos inválido.",
  estacao: "Estação não encontrada.",
  existe: "Já existe um voucher com esse código.",
};

export default async function Vouchers({ searchParams }: { searchParams: Promise<{ f?: string; ok?: string; erro?: string }> }) {
  const u = await requireAba("vouchers");
  const q = await searchParams;
  const inativos = q.f === "inativos";
  const lista = await sql<V[]>`
    SELECT v.id, v.codigo, v.pct, v.descricao, e.nome AS estacao, v.valido_ate, v.limite_usos, v.ativo,
      (SELECT count(*)::int FROM motorista_vouchers m WHERE m.voucher_id = v.id AND m.recarga_id IS NOT NULL) AS usos,
      (SELECT count(*)::int FROM motorista_vouchers m WHERE m.voucher_id = v.id) AS resgates,
      (v.valido_ate IS NOT NULL AND v.valido_ate < (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS vencido
    FROM vouchers v LEFT JOIN estacoes e ON e.id = v.estacao_id ORDER BY v.criado_em DESC`;
  const mostrar = lista.filter((v) => (inativos ? !v.ativo || v.vencido : v.ativo && !v.vencido));
  const estacoes = await sql<{ id: number; nome: string }[]>`SELECT id, nome FROM estacoes WHERE ativa ORDER BY nome`;
  const admin = u.perfil === "admin";

  return (
    <>
      {q.ok && <div className="aviso ok">Voucher criado. Os motoristas resgatam pelo código na carteira do app.</div>}
      {q.erro && <div className="aviso erro">{ERROS[q.erro] ?? "Não foi possível salvar."}</div>}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <Link className={`chip ${!inativos ? "on" : ""}`} href="/painel/vouchers">Ativos</Link>
        <Link className={`chip ${inativos ? "on" : ""}`} href="/painel/vouchers?f=inativos">Expirados e pausados</Link>
      </div>
      <div className="panel" style={{ marginBottom: 16 }}>
        {mostrar.length ? (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Código</th><th>Desconto</th><th>Onde vale</th><th>Validade</th><th>Uso</th><th>Resgates</th>{admin && <th>Ativo</th>}</tr></thead>
              <tbody>
                {mostrar.map((v) => (
                  <tr key={v.id}>
                    <td><b className="mono">{v.codigo}</b>{v.descricao && <div className="muted" style={{ fontSize: 12 }}>{v.descricao}</div>}</td>
                    <td><span className="badge b-disponivel">{v.pct}% off</span></td>
                    <td>{v.estacao ?? "Todas as estações"}</td>
                    <td className="muted">{v.valido_ate ? new Date(v.valido_ate).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Sem validade"}{v.vencido ? " (vencido)" : ""}</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <div className="bar-mini"><i style={{ width: `${v.limite_usos ? Math.min(100, Math.round((v.usos / v.limite_usos) * 100)) : 100}%` }} /></div>
                        <span className="mono" style={{ fontSize: 12.5 }}>{v.usos}{v.limite_usos ? ` / ${v.limite_usos}` : ""}</span>
                      </div>
                    </td>
                    <td className="mono">{v.resgates}</td>
                    {admin && (
                      <td>
                        <form action={alternar}>
                          <input type="hidden" name="id" value={v.id} />
                          <input type="hidden" name="ativo" value={v.ativo ? "0" : "1"} />
                          <button className={`toggle ${v.ativo ? "on" : ""}`} aria-label={v.ativo ? "Pausar" : "Ativar"} />
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty"><div className="em-ic"><Ic n="ticket" /></div><b>{inativos ? "Nenhum voucher pausado ou expirado" : "Nenhum voucher ativo"}</b>{inativos ? "Vouchers pausados ou vencidos aparecem aqui." : "Crie o primeiro abaixo."}</div>
        )}
      </div>

      {admin && (
        <form action={criar} className="panel">
          <div className="panel-h"><h3>Criar voucher</h3></div>
          <div className="panel-b">
            <div className="form-grid">
              <div className="field"><label htmlFor="codigo">Código</label><input className="input mono" id="codigo" name="codigo" required maxLength={20} placeholder="VIVA20" style={{ textTransform: "uppercase" }} /></div>
              <div className="field"><label htmlFor="pct">Desconto (%)</label><input className="input mono" id="pct" name="pct" type="number" min={1} max={100} required defaultValue={20} /></div>
              <div className="field full"><label htmlFor="descricao">Descrição (aparece para o motorista)</label><input className="input" id="descricao" name="descricao" maxLength={80} placeholder="Boas-vindas · primeira recarga" /></div>
              <div className="field">
                <label htmlFor="estacao">Onde vale</label>
                <select className="input" id="estacao" name="estacao" defaultValue="">
                  <option value="">Todas as estações</option>
                  {estacoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="validade">Válido até (opcional)</label><input className="input" id="validade" name="validade" type="date" /></div>
              <div className="field"><label htmlFor="limite">Limite de usos no total (opcional)</label><input className="input mono" id="limite" name="limite" type="number" min={1} placeholder="500" /></div>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Cada motorista usa o código uma vez. O desconto vale sobre a tarifa do horário em que a recarga começa.</p>
            <button className="btn btn-dark">Criar voucher</button>
          </div>
        </form>
      )}
    </>
  );
}
