import Link from "next/link";
import { requireAba } from "@/lib/session";
import { sql } from "@/lib/db";
import { brl } from "@/lib/format";
import { listarTarifas, tarifasPorEstacao, blocosDoDia, horarioDa, horaBrasilia } from "@/lib/tarifas";
import { FormTarifa } from "./FormTarifa";
import { excluirTarifa } from "./acoes";

const ESCURAS = ["#0B3B2A", "#177148", "#2F7FD8", "#D9534F", "#8E6CC9"];
const tinta = (cor: string) => (ESCURAS.includes(cor.toUpperCase()) ? "#fff" : "#0B3B2A");

const OK: Record<string, string> = {
  criada: "Tarifa criada. Vale para as recargas que começarem a partir de agora nas estações marcadas.",
  editada: "Tarifa salva. Vale para as recargas que começarem a partir de agora.",
  excluida: "Tarifa excluída. As estações voltam ao próprio preço nesse horário.",
};

export default async function Tarifas({ searchParams }: { searchParams: Promise<{ ok?: string; nova?: string; editar?: string }> }) {
  const u = await requireAba("tarifas");
  const q = await searchParams;
  const admin = u.perfil === "admin";
  const [tarifas, porEstacao, estacoes, [custo]] = await Promise.all([
    listarTarifas(),
    tarifasPorEstacao(),
    sql<{ id: number; nome: string; preco_kwh_centavos: number }[]>`SELECT id, nome, preco_kwh_centavos FROM estacoes WHERE ativa ORDER BY nome`,
    sql<{ medio: number | null }[]>`SELECT round(avg(custo_kwh_centavos))::int AS medio FROM estacoes WHERE ativa`,
  ]);
  const usadaEm = (tid: number) => estacoes.filter((e) => porEstacao.get(e.id)?.some((t) => t.id === tid));
  const editando = admin ? tarifas.find((t) => t.id === Number(q.editar)) : undefined;
  const criando = admin && q.nova === "1";
  const agora = new Date(Date.now() - 3 * 3_600_000);
  const nowPct = ((horaBrasilia() + agora.getUTCMinutes() / 60) / 24) * 100;
  const resumoEstacao = (id: number) => {
    const ts = porEstacao.get(id) ?? [];
    return ts.length ? ts.map((t) => `${t.nome} ${horarioDa(t)}`).join(" · ") : "só o preço da estação";
  };

  return (
    <>
      {q.ok && OK[q.ok] && <div className="aviso ok">{OK[q.ok]}</div>}

      {(criando || editando) && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-h"><h3>{editando ? `Editar ${editando.nome}` : "Nova tarifa"}</h3><Link className="link" href="/painel/tarifas">Cancelar</Link></div>
          <div className="panel-b">
            <FormTarifa
              key={editando?.id ?? "nova"}
              corSugerida={tarifas.length}
              estacoes={estacoes.map((e) => ({ id: e.id, nome: e.nome, tarifas: resumoEstacao(e.id) }))}
              inicial={editando && {
                id: editando.id, nome: editando.nome, hora_inicio: editando.hora_inicio, hora_fim: editando.hora_fim,
                preco: (editando.preco_kwh_centavos / 100).toFixed(2).replace(".", ","), cor: editando.cor, estacoes: usadaEm(editando.id).map((e) => e.id),
              }}
            />
          </div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h">
          <h3>Tarifas por horário</h3>
          <div className="row" style={{ gap: 12 }}>
            <span className="muted" style={{ fontSize: 12.5 }}>Custo médio da energia: {custo.medio ? `${brl(custo.medio)}/kWh` : "-"}</span>
            {admin && !criando && <Link className="btn btn-dark btn-sm" href="/painel/tarifas?nova=1">Nova tarifa</Link>}
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Tarifa</th><th>Horário</th><th className="num">Preço/kWh</th><th className="num">Margem</th><th>Usada em</th>{admin && <th />}</tr></thead>
            <tbody>
              {tarifas.length === 0 && (
                <tr><td colSpan={admin ? 6 : 5}><div className="vazio"><b>Nenhuma tarifa por horário</b>Cada estação cobra o próprio preço o dia todo.{admin && <Link className="link" href="/painel/tarifas?nova=1">Criar a primeira</Link>}</div></td></tr>
              )}
              {tarifas.map((t) => {
                const em = usadaEm(t.id);
                return (
                  <tr key={t.id}>
                    <td><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: t.cor, width: 12, height: 12, borderRadius: 4 }} /><b>{t.nome}</b></span></td>
                    <td className="mono">{horarioDa(t)}</td>
                    <td className="num"><b>{brl(t.preco_kwh_centavos)}</b></td>
                    <td className="num" style={{ color: "var(--g600)" }}>{custo.medio ? `${Math.round((1 - custo.medio / t.preco_kwh_centavos) * 100)}%` : "-"}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{em.length === 0 ? "Nenhuma estação" : em.length === estacoes.length ? "Todas as estações" : em.map((e) => e.nome).join(", ")}</td>
                    {admin && (
                      <td>
                        <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                          <Link className="btn btn-ghost btn-sm" href={`/painel/tarifas?editar=${t.id}`}>Editar</Link>
                          <form action={excluirTarifa}><input type="hidden" name="id" value={t.id} /><button className="btn btn-ghost btn-sm">Excluir</button></form>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel-b muted" style={{ fontSize: 12.5, borderTop: "1px solid var(--line)" }}>
          Vale a tarifa do horário em que a recarga começa. Fora das tarifas, cada estação cobra o próprio preço. Vouchers dão desconto em % sobre o valor.
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Preço de hoje por estação</h3><span className="muted" style={{ fontSize: 12.5 }}>Linha vermelha: agora</span></div>
        <div className="panel-b" style={{ display: "grid", gap: 14 }}>
          {estacoes.length === 0 && <div className="muted">Nenhuma estação cadastrada.</div>}
          {estacoes.map((e) => (
            <div key={e.id}>
              <div className="between" style={{ marginBottom: 6, fontSize: 13 }}>
                <Link href={`/painel/estacoes/${e.id}`} style={{ fontWeight: 700, textDecoration: "none" }}>{e.nome}</Link>
                <span className="muted">demais horários {brl(e.preco_kwh_centavos)}</span>
              </div>
              <div className="timeline" style={{ height: 34 }}>
                {blocosDoDia(porEstacao.get(e.id) ?? []).map((b, i) => (
                  <div key={i} style={{ flex: b.horas, background: b.tarifa?.cor ?? "var(--g50)", color: b.tarifa ? tinta(b.tarifa.cor) : "var(--muted)" }}>
                    {b.horas >= 3 && <>{b.tarifa?.nome ?? "Preço da estação"}<b>{brl(b.tarifa?.preco_kwh_centavos ?? e.preco_kwh_centavos)}</b></>}
                  </div>
                ))}
                <span className="now-mark" style={{ left: `${nowPct}%` }} />
              </div>
            </div>
          ))}
          {estacoes.length > 0 && <div className="hours">{["00", "03", "06", "09", "12", "15", "18", "21", "24"].map((h) => <span key={h}>{h}h</span>)}</div>}
        </div>
      </div>
    </>
  );
}
