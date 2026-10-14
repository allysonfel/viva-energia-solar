import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireUser, parceiroDoEscopo, podeOperar } from "@/lib/session";
import { sql } from "@/lib/db";
import { listarEstacoes } from "@/lib/estacoes";
import { lerSegredo } from "@/lib/segredo";
import { brl, kwh, kw, haQuanto, quando, duracao, horaBr } from "@/lib/format";
import { STATUS_CONECTOR_NOME, TIPOS_CONECTOR } from "@/lib/ocpp/tipos";
import { Badge, BadgeRecarga } from "@/components/Badge";
import { Ic } from "@/components/Ic";
import { AutoAtualizar } from "@/components/AutoAtualizar";
import { Comandos, PararRecarga } from "./Comandos";
import { editarEstacao, novaSenhaOcpp, editarConector, arquivarEstacao } from "../acoes";

const OK: Record<string, string> = { dados: "Dados da estação salvos.", conector: "Conector salvo." };
const ERROS: Record<string, string> = { conector: "Conector inválido.", parceiro: "Parceiro não encontrado." };
const CMD_STATUS: Record<string, [string, string]> = {
  aceito: ["ok", "Aceito"],
  recusado: ["", "Recusado"],
  offline: ["", "Offline"],
  sem_resposta: ["", "Sem resposta"],
  erro: ["", "Erro"],
  enviado: ["", "Enviando"],
};

async function urlOcpp(codigo: string) {
  let base = process.env.APP_URL ?? "";
  if (!base) {
    const h = await headers();
    base = `http://${h.get("host") ?? "localhost:3000"}`;
  }
  return base.replace(/^http/, "ws").replace(/\/$/, "") + "/ocpp/" + codigo;
}

export default async function Estacao({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string; criada?: string; senha?: string }>;
}) {
  const u = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [e] = await listarEstacoes(parceiroDoEscopo(u), id);
  if (!e) notFound();
  const q = await searchParams;
  const admin = u.perfil === "admin";
  const operar = podeOperar(u);

  const [det] = await sql<{ fabricante: string; modelo: string; firmware: string; numero_serie: string; lat: number | null; lng: number | null; preco_kwh_centavos: number; custo_kwh_centavos: number; parceiro_id: number | null; conectada_em: Date | null }[]>`
    SELECT fabricante, modelo, firmware, numero_serie, lat, lng, preco_kwh_centavos, custo_kwh_centavos, parceiro_id, conectada_em FROM estacoes WHERE id = ${id}`;
  const andamento = await sql<{ id: number; conector_numero: number; inicio: Date; energia_wh: number; potencia_w: number; soc: number | null; valor_centavos: number; origem: string; motorista: string | null }[]>`
    SELECT r.id, r.conector_numero, r.inicio, r.energia_wh, r.potencia_w, r.soc, r.valor_centavos, r.origem, NULL AS motorista
    FROM recargas r WHERE r.estacao_id = ${id} AND r.status = 'em_andamento' ORDER BY r.conector_numero`;
  const comandos = await sql<{ id: number; descricao: string; status: string; criado_em: Date; usuario: string | null }[]>`
    SELECT c.id, c.descricao, c.status, c.criado_em, u.nome AS usuario FROM comandos c LEFT JOIN usuarios u ON u.id = c.usuario_id
    WHERE c.estacao_id = ${id} ORDER BY c.id DESC LIMIT 12`;
  const ultimas = await sql<{ id: number; conector_numero: number; inicio: Date; fim: Date | null; energia_wh: number; valor_centavos: number; status: string }[]>`
    SELECT id, conector_numero, inicio, fim, energia_wh, valor_centavos, status FROM recargas WHERE estacao_id = ${id} ORDER BY inicio DESC LIMIT 8`;
  const parceiros = admin ? await sql<{ id: number; nome: string }[]>`SELECT id, nome FROM parceiros ORDER BY nome` : [];
  const senha = admin && !e.simulada ? await lerSegredo("ocpp", id) : "";
  const maxKw = Math.max(7, Math.round(e.conectores.reduce((s, c) => s + c.potencia_w, 0) / 1000));
  const limiteKw = e.limite_w ? Math.round(e.limite_w / 1000) : maxKw;
  const real = (c: number) => (c / 100).toFixed(2).replace(".", ",");

  return (
    <>
      <AutoAtualizar ms={5_000} />
      <div className="between" style={{ marginBottom: 14 }}>
        <Link className="link" href="/painel/estacoes" style={{ display: "flex", alignItems: "center", gap: 4 }}><Ic n="back" />Estações</Link>
        <span className="muted" style={{ fontSize: 12.5 }}>{e.conectada ? `Conectada há ${haQuanto(det.conectada_em)}` : `Último contato: ${haQuanto(e.ultimo_contato)}`}</span>
      </div>
      {q.ok && <div className="aviso ok">{OK[q.ok] ?? "Salvo."}</div>}
      {q.erro && <div className="aviso erro">{ERROS[q.erro] ?? q.erro}</div>}
      {q.criada && <div className="aviso ok">Estação cadastrada. {e.simulada ? "O carregador simulado já está ligando." : "Configure o carregador com o endereço e a senha abaixo."}</div>}

      <div className="grid2">
        <div>
          <div className="panel" style={{ overflow: "hidden", marginBottom: 16 }}>
            <div className="drawer-h" style={{ position: "static" }}>
              <span className="id">{e.codigo}{det.firmware ? ` · firmware ${det.firmware}` : ""}{e.simulada ? " · simulada" : ""}</span>
              <h2>{e.nome}</h2>
              <small>{[e.endereco, e.bairro, e.cidade].filter(Boolean).join(" · ") || "Endereço não informado"}</small>
              <div style={{ marginTop: 12 }}><Badge s={e.situacao} /></div>
            </div>
            <div className="drawer-b">
              {operar ? (
                <>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>Comandos remotos</div>
                  <Comandos
                    id={id}
                    habilitada={e.habilitada}
                    conectada={e.conectada}
                    conectores={e.conectores.map((c) => ({ numero: c.numero, tipo: c.tipo, livre: c.status === "Available" || c.status === "Preparing" }))}
                    limiteKw={Math.min(limiteKw, maxKw)}
                    maxKw={maxKw}
                  />
                </>
              ) : (
                <div className="muted">Seu perfil acompanha a estação, sem enviar comandos.</div>
              )}

              <div className="box">
                <div className="box-title">Conectores</div>
                {e.conectores.map((c) => {
                  const r = andamento.find((x) => x.conector_numero === c.numero);
                  return (
                    <div key={c.numero} className="list-item">
                      <span className="li-ic"><Ic n="plug" /></span>
                      <div className="li-main">
                        <b>Conector {c.numero} · {c.tipo}</b>
                        <small>
                          {kw(c.potencia_w)} kW · {STATUS_CONECTOR_NOME[c.status] ?? c.status}
                          {c.erro !== "NoError" ? ` · ${c.erro}` : ""}
                          {r ? ` · ${kwh(r.energia_wh)} kWh · ${kw(r.potencia_w)} kW${r.soc !== null ? ` · ${r.soc}%` : ""} · ${brl(r.valor_centavos)} · desde ${horaBr(r.inicio)}` : ""}
                        </small>
                      </div>
                      {r && operar ? <PararRecarga id={id} recarga={r.id} /> : <Badge s={c.situacao} />}
                    </div>
                  );
                })}
              </div>

              <div className="box">
                <div className="box-title">Histórico de comandos</div>
                <div className="log">
                  {comandos.length === 0 && <div style={{ color: "var(--faint)", fontFamily: "var(--body)" }}>Nenhum comando enviado para esta estação ainda.</div>}
                  {comandos.map((c) => {
                    const [cls, t] = CMD_STATUS[c.status] ?? ["", c.status];
                    return (
                      <div key={c.id}>
                        <span className="tm">{horaBr(c.criado_em)}</span>
                        <span style={{ flex: 1 }}>{c.descricao}{c.usuario ? ` · ${c.usuario.split(" ")[0]}` : ""}</span>
                        <span className={cls} style={cls ? undefined : { color: c.status === "enviado" ? "var(--faint)" : "var(--red)" }}>{t}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><h3>Equipamento</h3></div>
            <div className="panel-b">
              <div className="kv">
                <div><small>Fabricante</small><b>{det.fabricante || "-"}</b></div>
                <div><small>Modelo</small><b>{det.modelo || "-"}</b></div>
                <div><small>Série</small><b>{det.numero_serie || "-"}</b></div>
              </div>
              <div className="kv" style={{ marginTop: 10 }}>
                <div><small>Preço</small><b>{brl(det.preco_kwh_centavos)}/kWh</b></div>
                <div><small>Custo energia</small><b>{brl(det.custo_kwh_centavos)}/kWh</b></div>
                <div><small>Local</small><b>{e.parceiro ?? "Própria"}</b></div>
              </div>
            </div>
          </div>

          {admin && !e.simulada && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-h"><h3>Conexão OCPP</h3></div>
              <div className="panel-b">
                <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Configure no carregador (OCPP 1.6J, perfil de segurança 1: usuário e senha):</p>
                <div className="ocpp-url">{await urlOcpp(e.codigo)}</div>
                <div className="kv" style={{ marginTop: 10 }}>
                  <div><small>Usuário</small><b className="mono">{e.codigo}</b></div>
                </div>
                {senha ? (
                  <>
                    <div className="box-title" style={{ marginTop: 12 }}>Senha (aparece só agora)</div>
                    <div className="segredo">{senha}</div>
                    <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Copie e configure no carregador. Ela não fica salva em texto: se perder, gere outra.</p>
                  </>
                ) : (
                  <form action={novaSenhaOcpp} style={{ marginTop: 12 }}>
                    <input type="hidden" name="id" value={id} />
                    <button className="btn btn-ghost btn-sm"><Ic n="refresh" />Gerar nova senha</button>
                    <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>A atual deixa de valer.</span>
                  </form>
                )}
              </div>
            </div>
          )}

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><h3>Últimas recargas</h3><Link className="link" href={`/painel/recargas?estacao=${id}`}>Ver todas</Link></div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>#</th><th>Início</th><th>Duração</th><th>Status</th><th className="num">kWh</th><th className="num">Valor</th></tr></thead>
                <tbody>
                  {ultimas.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma recarga ainda.</td></tr>}
                  {ultimas.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">#{r.id}</td>
                      <td className="muted">{quando(r.inicio)}</td>
                      <td className="muted">{duracao(r.inicio, r.fim)}</td>
                      <td><BadgeRecarga status={r.status} /></td>
                      <td className="num">{kwh(r.energia_wh)}</td>
                      <td className="num">{brl(r.valor_centavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {admin && (
            <>
              <form action={editarEstacao} className="panel" style={{ marginBottom: 16 }}>
                <input type="hidden" name="id" value={id} />
                <div className="panel-h"><h3>Dados da estação</h3></div>
                <div className="panel-b">
                  <div className="form-grid">
                    <div className="field full"><label>Nome</label><input className="input" name="nome" required maxLength={60} defaultValue={e.nome} /></div>
                    <div className="field full"><label>Endereço</label><input className="input" name="endereco" maxLength={160} defaultValue={e.endereco} /></div>
                    <div className="field"><label>Bairro</label><input className="input" name="bairro" maxLength={60} defaultValue={e.bairro} /></div>
                    <div className="field"><label>Cidade</label><input className="input" name="cidade" maxLength={60} defaultValue={e.cidade} /></div>
                    <div className="field"><label>Latitude</label><input className="input mono" name="lat" maxLength={20} defaultValue={det.lat ?? ""} /></div>
                    <div className="field"><label>Longitude</label><input className="input mono" name="lng" maxLength={20} defaultValue={det.lng ?? ""} /></div>
                    <div className="field"><label>Preço por kWh (R$)</label><input className="input mono" name="preco" required maxLength={8} defaultValue={real(det.preco_kwh_centavos)} /></div>
                    <div className="field"><label>Custo por kWh (R$)</label><input className="input mono" name="custo" maxLength={8} defaultValue={real(det.custo_kwh_centavos)} /></div>
                    <div className="field full">
                      <label>Parceiro / local</label>
                      <select className="input" name="parceiro" defaultValue={det.parceiro_id ?? ""}>
                        <option value="">Própria (Viva Energia)</option>
                        {parceiros.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-dark btn-sm">Salvar dados</button>
                </div>
              </form>

              <div className="panel" style={{ marginBottom: 16 }}>
                <div className="panel-h"><h3>Conectores cadastrados</h3></div>
                <div className="panel-b">
                  {[...e.conectores.map((c) => c.numero), (e.conectores.at(-1)?.numero ?? 0) + 1].slice(0, 20).map((n) => {
                    const c = e.conectores.find((x) => x.numero === n);
                    return (
                      <form key={n} action={editarConector} className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="numero" value={n} />
                        <b style={{ width: 92 }}>{c ? `Conector ${n}` : "Novo conector"}</b>
                        <select className="input" name="tipo" defaultValue={c?.tipo ?? "Tipo 2"} style={{ width: 120, height: 36 }}>
                          {TIPOS_CONECTOR.map((t) => <option key={t}>{t}</option>)}
                        </select>
                        <input className="input mono" name="kw" defaultValue={c ? String(c.potencia_w / 1000).replace(".", ",") : ""} placeholder="kW" maxLength={6} style={{ width: 80, height: 36 }} />
                        <button className="btn btn-ghost btn-sm">{c ? "Salvar" : "Adicionar"}</button>
                      </form>
                    );
                  })}
                </div>
              </div>

              <form action={arquivarEstacao} className="panel">
                <input type="hidden" name="id" value={id} />
                <div className="panel-b between">
                  <div>
                    <b>Arquivar estação</b>
                    <div className="muted" style={{ fontSize: 12.5 }}>Some das listas e recusa conexões. O histórico de recargas fica.</div>
                  </div>
                  <button className="btn btn-danger btn-sm">Arquivar</button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
