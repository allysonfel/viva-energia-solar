import Link from "next/link";
import { requireAba } from "@/lib/session";
import { sql } from "@/lib/db";
import { brl, num, haQuanto } from "@/lib/format";
import { Ic } from "@/components/Ic";

type C = { id: number; nome: string; email: string; veiculo: string; placa: string; recargas: number; gasto: number; saldo_centavos: number; ultima: Date | null; ativo: boolean };

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; pg?: string }> }) {
  const u = await requireAba("clientes");
  const sp = await searchParams;
  const busca = String(sp.q ?? "").trim().slice(0, 60);
  const pagina = Math.max(1, Math.min(1000, Number(sp.pg) || 1));
  const termo = "%" + busca.toLowerCase().replace(/[%_\\]/g, "") + "%";
  const onde = busca
    ? sql`WHERE unaccent_simples(m.nome) LIKE unaccent_simples(${termo}) OR m.email LIKE ${termo} OR lower(m.veiculo) LIKE ${termo} OR lower(m.placa) LIKE ${termo}`
    : sql``;
  const lista = await sql<C[]>`
    SELECT m.id, m.nome, m.email, m.veiculo, m.placa, m.saldo_centavos, m.ativo,
      coalesce(r.n, 0)::int AS recargas, coalesce(r.gasto, 0)::bigint AS gasto, r.ultima
    FROM motoristas m
    LEFT JOIN LATERAL (SELECT count(*) AS n, sum(valor_centavos) AS gasto, max(inicio) AS ultima FROM recargas WHERE motorista_id = m.id AND status <> 'recusada') r ON true
    ${onde}
    ORDER BY r.ultima DESC NULLS LAST, m.criado_em DESC LIMIT 50 OFFSET ${(pagina - 1) * 50}`;
  const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM motoristas m ${onde}`;
  const pg = (n: number) => `/painel/clientes?${new URLSearchParams({ ...(busca ? { q: busca } : {}), pg: String(n) })}`;

  return (
    <div className="panel">
      <form className="panel-h" action="/painel/clientes">
        <div className="tsearch"><Ic n="search" /><input name="q" placeholder="Buscar por nome, e-mail, veículo ou placa" defaultValue={busca} maxLength={60} /></div>
        <div className="row" style={{ gap: 12 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>{num(total)} clientes{busca ? " encontrados" : " cadastrados"}</span>
          {u.perfil === "admin" && <a className="btn btn-ghost btn-sm" href="/painel/clientes/exportar"><Ic n="download" />Exportar</a>}
        </div>
      </form>
      {lista.length ? (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Veículo</th><th className="num">Recargas</th><th className="num">Total gasto</th><th className="num">Saldo em carteira</th><th>Última recarga</th></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} style={c.ativo ? undefined : { opacity: 0.55 }}>
                  <td><Link href={`/painel/clientes/${c.id}`} style={{ fontWeight: 700, textDecoration: "none" }}>{c.nome}</Link><div className="muted" style={{ fontSize: 12 }}>{c.email}</div></td>
                  <td className="muted">{[c.veiculo, c.placa].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="num">{c.recargas}</td>
                  <td className="num">{brl(c.gasto)}</td>
                  <td className="num" style={c.saldo_centavos < 0 ? { color: "var(--red)" } : undefined}>{brl(c.saldo_centavos)}</td>
                  <td className="muted">{c.ultima ? `há ${haQuanto(c.ultima)}` : "nunca"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty"><div className="em-ic"><Ic n="search" /></div><b>Nenhum cliente encontrado</b>Confira a grafia ou busque pelo modelo do veículo.</div>
      )}
      {total > 50 && (
        <div className="pag">
          {pagina > 1 && <Link className="btn btn-ghost btn-sm" href={pg(pagina - 1)}>Anterior</Link>}
          <span className="muted" style={{ fontSize: 12.5 }}>Página {pagina} de {Math.ceil(total / 50)}</span>
          {pagina * 50 < total && <Link className="btn btn-ghost btn-sm" href={pg(pagina + 1)}>Próxima</Link>}
        </div>
      )}
    </div>
  );
}
