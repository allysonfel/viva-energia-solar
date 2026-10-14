import Link from "next/link";
import { requireUser, parceiroDoEscopo } from "@/lib/session";
import { sql } from "@/lib/db";
import { buscarRecargas, lerFiltro, PERIODOS } from "@/lib/recargas";
import { brl, kwh, num, quando, duracao } from "@/lib/format";
import { BadgeRecarga } from "@/components/Badge";
import { Ic } from "@/components/Ic";
import { AutoAtualizar } from "@/components/AutoAtualizar";

const ORIGEM: Record<string, string> = { carregador: "Cartão no carregador", painel: "Painel", app: "App" };

export default async function Recargas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser();
  const q = await searchParams;
  const f = lerFiltro(q);
  const pagina = Math.max(1, Math.min(1000, Number(q.pg) || 1));
  const parceiro = parceiroDoEscopo(u);
  const estacoes = await sql<{ id: number; nome: string }[]>`
    SELECT id, nome FROM estacoes WHERE ativa ${parceiro ? sql`AND parceiro_id = ${parceiro}` : sql``} ORDER BY nome`;
  const { linhas, total } = await buscarRecargas(f, parceiro, 50, pagina);
  const params = new URLSearchParams(Object.entries({ estacao: f.estacao ? String(f.estacao) : "", p: f.periodo, s: f.status ?? "", q: f.busca }).filter(([, v]) => v));
  const pg = (n: number) => `/painel/recargas?${new URLSearchParams([...params, ["pg", String(n)]])}`;

  return (
    <div className="panel">
      <AutoAtualizar ms={10_000} />
      <form className="panel-h" action="/painel/recargas">
        <div className="toolbar">
          <div className="tsearch"><Ic n="search" /><input name="q" placeholder="Nº da recarga ou cartão" defaultValue={f.busca} maxLength={40} /></div>
          <select className="input" name="estacao" defaultValue={f.estacao ?? ""}>
            <option value="">Todas as estações</option>
            {estacoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <select className="input" name="p" defaultValue={f.periodo}>
            {Object.entries(PERIODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input" name="s" defaultValue={f.status ?? ""}>
            <option value="">Todos os status</option>
            <option value="em_andamento">Em andamento</option>
            <option value="concluida">Concluídas</option>
            <option value="interrompida">Interrompidas</option>
            <option value="recusada">Recusadas</option>
          </select>
          <button className="btn btn-dark btn-sm">Filtrar</button>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>{num(total.n)} recargas · {kwh(total.wh)} kWh · {brl(total.centavos)}</span>
          {u.perfil !== "parceiro" && (
            <a className="btn btn-ghost btn-sm" href={`/painel/recargas/exportar?${params}`}><Ic n="download" />Exportar</a>
          )}
        </div>
      </form>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr><th>Recarga</th><th>Estação</th><th>Conector</th><th>Início</th><th>Duração</th><th>Cliente / origem</th><th>Status</th><th className="num">kWh</th><th className="num">Valor</th></tr>
          </thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={9}><div className="vazio"><b>Nenhuma recarga</b>Nada encontrado com esses filtros.</div></td></tr>}
            {linhas.map((r) => (
              <tr key={r.id}>
                <td className="mono">#{r.id}</td>
                <td><Link href={`/painel/estacoes/${r.estacao_id}`} style={{ fontWeight: 700, textDecoration: "none" }}>{r.estacao}</Link></td>
                <td className="muted">{r.conector_numero} · {r.conector ?? "-"}</td>
                <td className="muted">{quando(r.inicio)}</td>
                <td className="muted">{duracao(r.inicio, r.fim)}</td>
                <td className="muted">{r.motorista && u.perfil !== "parceiro" ? <><b style={{ color: "var(--ink)" }}>{r.motorista}</b> · app</> : ORIGEM[r.origem] ?? r.origem}{r.usuario ? ` · ${r.usuario.split(" ")[0]}` : ""}</td>
                <td><BadgeRecarga status={r.status} /></td>
                <td className="num">{kwh(r.energia_wh)}</td>
                <td className="num">{brl(r.valor_centavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total.n > 50 && (
        <div className="pag">
          {pagina > 1 && <Link className="btn btn-ghost btn-sm" href={pg(pagina - 1)}>Anterior</Link>}
          <span className="muted" style={{ fontSize: 12.5 }}>Página {pagina} de {Math.ceil(total.n / 50)}</span>
          {pagina * 50 < total.n && <Link className="btn btn-ghost btn-sm" href={pg(pagina + 1)}>Próxima</Link>}
        </div>
      )}
    </div>
  );
}
