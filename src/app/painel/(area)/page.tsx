import Link from "next/link";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser, parceiroDoEscopo } from "@/lib/session";
import { sql } from "@/lib/db";
import { manterDemonstracaoViva } from "@/lib/demonstracao";
import { listarEstacoes } from "@/lib/estacoes";
import { buscarRecargas } from "@/lib/recargas";
import { brl, kwh, num, quando, kw } from "@/lib/format";
import { Badge, BadgeRecarga } from "@/components/Badge";
import { AutoAtualizar } from "@/components/AutoAtualizar";
import { GraficoReceitaCusto } from "@/components/Grafico";
import { gerarRelatorio } from "@/lib/relatorios";
import { lerIntervalo } from "@/lib/periodo";

// Visão "só dados reais": esconde as estações simuladas e tudo que vem delas.
// Preferência de quem está olhando (cookie); começa desligada.
const COOKIE_REAIS = "viva_painel_reais";

async function alternarDadosReais() {
  "use server";
  await requireUser();
  const jar = await cookies();
  if (jar.get(COOKIE_REAIS)?.value === "1") jar.delete({ name: COOKIE_REAIS, path: "/painel" });
  else jar.set(COOKIE_REAIS, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/painel", maxAge: 365 * 86_400 });
  revalidatePath("/painel");
}

export default async function VisaoGeral({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const u = await requireUser();
  const { erro } = await searchParams;
  await manterDemonstracaoViva();
  const parceiro = parceiroDoEscopo(u);
  const verEstacoes = u.abas.includes("estacoes");
  const soReais = (await cookies()).get(COOKIE_REAIS)?.value === "1";
  const escopo = sql`${parceiro ? sql`AND e.parceiro_id = ${parceiro}` : sql``} ${soReais ? sql`AND NOT e.simulada` : sql``}`;
  // Mesmos números do relatório (receita = recargas cobradas de motoristas).
  const [mes, anterior, ultimos] = await Promise.all([
    gerarRelatorio(lerIntervalo({ p: "mes" }, "mes"), { parceiro, soReais }),
    gerarRelatorio(lerIntervalo({ p: "mes_anterior" }, "mes_anterior"), { parceiro, soReais }),
    gerarRelatorio(lerIntervalo({ p: "30d" }, "30d"), { parceiro, soReais }),
  ]);
  const m = { centavos: mes.total.receita, wh: mes.total.wh, custo: mes.total.custo, n: mes.total.recargas, whTotal: mes.total.wh + mes.total.operacao_wh };
  const estacoes = (await listarEstacoes(parceiro)).filter((e) => !soReais || !e.simulada);
  const andamento = await sql<{ id: number; estacao: string; estacao_id: number; conector_numero: number; energia_wh: number; potencia_w: number; valor_centavos: number; inicio: Date }[]>`
    SELECT r.id, e.nome AS estacao, r.estacao_id, r.conector_numero, r.energia_wh, r.potencia_w, r.valor_centavos, r.inicio
    FROM recargas r JOIN estacoes e ON e.id = r.estacao_id WHERE r.status = 'em_andamento' ${escopo} ORDER BY r.inicio`;
  const { linhas } = await buscarRecargas({ estacao: null, periodo: lerIntervalo({ p: "tudo" }, "tudo"), status: null, busca: "", soReais }, parceiro, 6);
  const margem = m.centavos > 0 ? ((m.centavos - m.custo) / m.centavos) * 100 : null;
  const custoKwh = m.whTotal > 0 ? Math.round((m.custo * 1000) / m.whTotal) : null;
  const ticket = m.n > 0 ? Math.round(m.centavos / m.n) : null;

  return (
    <>
      <AutoAtualizar ms={10_000} />
      {erro === "permissao" && <div className="aviso erro">Seu perfil não tem acesso a essa tela.</div>}
      <form action={alternarDadosReais} className="demo-chave">
        <span className="muted">{soReais ? "Mostrando só dados reais (sem estações simuladas)" : "Mostrando dados de demonstração"}</span>
        <button type="submit" className="demo-btn" aria-pressed={!soReais}>
          Dados de demonstração
          <i className={`toggle ${soReais ? "" : "on"}`} aria-hidden />
        </button>
      </form>
      <div className="kpis">
        <div className="kpi hero"><small>Receita no mês</small><b>{brl(m.centavos)}</b><div className="d">mês passado {brl(anterior.total.receita)}</div></div>
        <div className="kpi"><small>Energia vendida</small><b>{kwh(m.wh, 0)} kWh</b><div className="d">no mês</div></div>
        {parceiro ? (
          <div className="kpi"><small>Repasse no mês</small><b>{brl(mes.total.repasse)}</b><div className="d">{mes.parceiros[0] ? `${String(mes.parceiros[0].pct).replace(".", ",")}% do valor apurado` : "-"}</div></div>
        ) : (
          <>
            <div className="kpi"><small>Custo com energia</small><b>{brl(m.custo)}</b><div className="d">{custoKwh !== null ? `${brl(custoKwh)} por kWh` : "sem consumo ainda"}</div></div>
            <div className="kpi"><small>Margem bruta</small><b>{margem !== null ? `${margem.toFixed(1).replace(".", ",")}%` : "-"}</b><div className="d">receita menos energia</div></div>
          </>
        )}
        <div className="kpi"><small>Recargas</small><b>{num(m.n)}</b><div className="d">{ticket !== null ? `Ticket médio ${brl(ticket)}` : "nenhuma no mês"}</div></div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h">
          <h3>{parceiro ? "Receita" : "Receita x custo de energia"} · últimos 14 dias</h3>
          <div className="chart-legend"><span><i style={{ background: "#177148" }} />Receita</span>{!parceiro && <span><i style={{ background: "#C4F53A" }} />Custo de energia</span>}</div>
        </div>
        <div className="panel-b"><GraficoReceitaCusto serie={ultimos.serie.slice(-14)} soReceita={!!parceiro} /></div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panel-h"><h3>Recargas em andamento</h3><span className="badge b-blue">{andamento.length} agora</span></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Recarga</th><th>Estação</th><th>Início</th><th className="num">kW</th><th className="num">kWh</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {andamento.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma recarga em andamento.</td></tr>}
                {andamento.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">#{r.id}</td>
                    <td>{verEstacoes ? <Link href={`/painel/estacoes/${r.estacao_id}`} style={{ fontWeight: 700, textDecoration: "none" }}>{r.estacao}</Link> : <b>{r.estacao}</b>} <span className="muted">· {r.conector_numero}</span></td>
                    <td className="muted">{quando(r.inicio)}</td>
                    <td className="num">{kw(r.potencia_w)}</td>
                    <td className="num">{kwh(r.energia_wh)}</td>
                    <td className="num">{brl(r.valor_centavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Estações agora</h3><span className="badge b-disponivel"><span className="dot st-disponivel" />Ao vivo</span></div>
          <div className="st-list">
            {estacoes.length === 0 && <div className="vazio"><b>Nenhuma estação</b>{u.perfil === "admin" ? <Link className="link" href="/painel/estacoes/nova">Cadastrar a primeira</Link> : null}</div>}
            {estacoes.map((e) => (
              <Link key={e.id} className="st-row" href={verEstacoes ? `/painel/estacoes/${e.id}` : "#"} style={{ textDecoration: "none", ...(verEstacoes ? {} : { pointerEvents: "none" }) }}>
                <span className={`dot st-${e.situacao}`} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{e.nome}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{e.conectores.filter((c) => c.situacao === "em_uso").length} de {e.conectores.length} conectores em uso</div>
                </div>
                <div className="bar-mini"><i style={{ width: `${e.ocupacao}%` }} /></div>
                <span className="mono" style={{ width: 40, textAlign: "right", fontSize: 12.5 }}>{e.ocupacao}%</span>
                <Badge s={e.situacao} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Últimas recargas</h3>{u.abas.includes("recargas") && <Link className="link" href="/painel/recargas">Ver todas</Link>}</div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Recarga</th><th>Estação</th><th>Início</th><th>Status</th><th className="num">kWh</th><th className="num">Valor</th></tr></thead>
            <tbody>
              {linhas.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma recarga ainda.</td></tr>}
              {linhas.map((r) => (
                <tr key={r.id}>
                  <td className="mono">#{r.id}</td>
                  <td><b>{r.estacao}</b></td>
                  <td className="muted">{quando(r.inicio)}</td>
                  <td><BadgeRecarga status={r.status} /></td>
                  <td className="num">{kwh(r.energia_wh)}</td>
                  <td className="num">{brl(r.valor_centavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
