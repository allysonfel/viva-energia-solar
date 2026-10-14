import { requireUser, parceiroDoEscopo } from "@/lib/session";
import { sql } from "@/lib/db";
import { gerarRelatorio, lerPeriodo, PERIODOS } from "@/lib/relatorios";
import { brl, kwh, num, dataBr } from "@/lib/format";
import { GraficoReceitaCusto } from "@/components/Grafico";
import { Ic } from "@/components/Ic";

export default async function Relatorios({ searchParams }: { searchParams: Promise<{ p?: string; estacao?: string }> }) {
  const u = await requireUser();
  const q = await searchParams;
  const p = lerPeriodo(q.p);
  const parceiro = parceiroDoEscopo(u);
  const estacoes = await sql<{ id: number; nome: string }[]>`
    SELECT id, nome FROM estacoes WHERE ativa ${parceiro ? sql`AND parceiro_id = ${parceiro}` : sql``} ORDER BY nome`;
  const est = Number(q.estacao) || null;
  const r = await gerarRelatorio(p, { estacao: est && estacoes.some((e) => e.id === est) ? est : null, parceiro });
  const t = r.total;
  const ehParceiro = u.perfil === "parceiro";
  const params = new URLSearchParams({ p, ...(est ? { estacao: String(est) } : {}) });
  const fimExibido = new Date(r.periodo.fim.getTime() - 1);

  return (
    <>
      <form className="toolbar" style={{ marginBottom: 14 }} action="/painel/relatorios">
        <select className="input" name="p" defaultValue={p}>
          {Object.entries(PERIODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" name="estacao" defaultValue={est ?? ""}>
          <option value="">{ehParceiro ? "Minhas estações" : "Todas as estações"}</option>
          {estacoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <button className="btn btn-dark btn-sm">Ver</button>
        <span className="muted" style={{ fontSize: 12.5 }}>{dataBr(r.periodo.ini)} a {dataBr(fimExibido)}</span>
        <a className="btn btn-ghost btn-sm" href={`/painel/relatorios/exportar?${params}`} style={{ marginLeft: "auto" }}><Ic n="download" />Planilha</a>
      </form>

      {ehParceiro ? (
        <div className="kpis" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <div className="kpi hero"><small>Valor apurado</small><b>{brl(t.receita)}</b><span className="d">{num(t.recargas)} recargas</span></div>
          <div className="kpi"><small>Energia vendida</small><b>{kwh(t.wh, 0)} kWh</b><span className="d">nas suas estações</span></div>
          <div className="kpi"><small>Seu repasse</small><b>{brl(t.repasse)}</b><span className="d">{r.parceiros[0] ? `${String(r.parceiros[0].pct).replace(".", ",")}% do valor apurado` : "-"}</span></div>
          <div className="kpi"><small>Ticket médio</small><b>{t.recargas ? brl(Math.round(t.receita / t.recargas)) : "-"}</b><span className="d">por recarga</span></div>
        </div>
      ) : (
        <div className="kpis">
          <div className="kpi hero"><small>Valor apurado</small><b>{brl(t.receita)}</b><span className="d">{num(t.recargas)} recargas · {kwh(t.wh, 0)} kWh</span></div>
          <div className="kpi"><small>Despesa com energia</small><b>{brl(t.custo)}</b><span className="d">{t.operacao_wh ? `inclui ${kwh(t.operacao_wh, 0)} kWh da operação` : "energia entregue"}</span></div>
          <div className="kpi"><small>Taxas de pagamento</small><b>{brl(t.taxas)}</b><span className="d">estimativa {String(r.taxaPct).replace(".", ",")}%</span></div>
          <div className="kpi"><small>Repasses</small><b>{brl(t.repasse)}</b><span className="d">a parceiros</span></div>
          <div className="kpi"><small>Resultado</small><b style={t.resultado < 0 ? { color: "var(--red)" } : undefined}>{brl(t.resultado)}</b><span className="d">{t.descontos ? `descontos de vouchers: ${brl(t.descontos)}` : "depois de repasses"}</span></div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h">
          <h3>Receita x custo de energia</h3>
          <div className="chart-legend"><span><i style={{ background: "#177148" }} />Receita</span><span><i style={{ background: "#C4F53A" }} />Custo de energia</span></div>
        </div>
        <div className="panel-b"><GraficoReceitaCusto serie={r.serie} /></div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h"><h3>Resultado por estação</h3><span className="muted" style={{ fontSize: 12.5 }}>Repasse calculado sobre o valor apurado</span></div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Estação</th><th>Parceiro</th><th className="num">Recargas</th><th className="num">kWh</th><th className="num">Valor apurado</th>
                {!ehParceiro && <th className="num">Custo energia</th>}
                <th className="num">Repasse</th>
                {!ehParceiro && <th className="num">Resultado</th>}
              </tr>
            </thead>
            <tbody>
              {r.estacoes.map((e) => (
                <tr key={e.id}>
                  <td><b>{e.nome}</b></td>
                  <td className="muted">{e.parceiro ? `${e.parceiro} · ${String(e.repasse_pct).replace(".", ",")}%` : "Própria"}</td>
                  <td className="num">{e.recargas}</td>
                  <td className="num">{kwh(e.wh, 0)}</td>
                  <td className="num">{brl(e.receita)}</td>
                  {!ehParceiro && <td className="num">{brl(e.custo)}</td>}
                  <td className="num">{e.repasse ? brl(e.repasse) : <span className="muted">-</span>}</td>
                  {!ehParceiro && <td className="num"><b style={e.resultado < 0 ? { color: "var(--red)" } : undefined}>{brl(e.resultado)}</b></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!ehParceiro && r.parceiros.length > 0 && (
        <div className="panel">
          <div className="panel-h"><h3>Repasses a parceiros</h3></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Parceiro</th><th className="num">Estações</th><th className="num">Valor apurado</th><th className="num">%</th><th className="num">Repasse</th></tr></thead>
              <tbody>
                {r.parceiros.map((x) => (
                  <tr key={x.parceiro}>
                    <td><b>{x.parceiro}</b></td><td className="num">{x.estacoes}</td><td className="num">{brl(x.receita)}</td>
                    <td className="num">{String(x.pct).replace(".", ",")}%</td><td className="num"><b>{brl(x.repasse)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
