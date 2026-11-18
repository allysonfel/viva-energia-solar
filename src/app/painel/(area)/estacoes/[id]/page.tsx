import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireAba, parceiroDoEscopo, podeOperar } from "@/lib/session";
import { sql } from "@/lib/db";
import { listarEstacoes } from "@/lib/estacoes";
import { lerSegredo } from "@/lib/segredo";
import { decifrarChave } from "@/lib/ocpp/chave";
import { CopiarTexto } from "./CopiarTexto";
import { brl, kwh, kw, haQuanto, quando, duracao, horaBr } from "@/lib/format";
import { STATUS_CONECTOR_NOME, TIPOS_CONECTOR } from "@/lib/ocpp/tipos";
import { Badge, BadgeRecarga } from "@/components/Badge";
import { Ic } from "@/components/Ic";
import { AutoAtualizar } from "@/components/AutoAtualizar";
import { Comandos, PararRecarga } from "./Comandos";
import { editarEstacao, novaSenhaOcpp, novaChaveOcpp, desligarChaveOcpp, editarConector, arquivarEstacao } from "../acoes";
import { EscolherTarifas } from "../EscolherTarifas";
import { listarTarifas, tarifasDaEstacao, horarioDa, faixaNoHorario } from "@/lib/tarifas";

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
  searchParams: Promise<{ ok?: string; erro?: string; criada?: string; senha?: string; chave?: string }>;
}) {
  const u = await requireAba("estacoes");
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
  const [daEstacao, todasTarifas] = await Promise.all([tarifasDaEstacao(id), admin ? listarTarifas() : []]);
  const tarifaAgora = faixaNoHorario(daEstacao);
  const senha = admin && !e.simulada ? await lerSegredo("ocpp", id) : "";
  const [ocpp] = await sql<{ cifrada: string | null; recusa_em: Date | null; recusa_motivo: string | null }[]>`
    SELECT ocpp_chave_cifrada AS cifrada, ocpp_recusa_em AS recusa_em, ocpp_recusa_motivo AS recusa_motivo FROM estacoes WHERE id = ${id}`;
  const chave = admin && !e.simulada ? decifrarChave(ocpp.cifrada) : null;
  const enderecoChave = chave ? (await urlOcpp(e.codigo)).replace(/\/ocpp\/.*$/, `/ocpp/k-${chave}/${e.codigo}`) : null;
  // Recusa só conta se for depois do último contato bom (senão já resolveu).
  const recusa = ocpp.recusa_em && ocpp.recusa_motivo && (!e.ultimo_contato || ocpp.recusa_em > e.ultimo_contato) ? { em: ocpp.recusa_em, motivo: ocpp.recusa_motivo } : null;
  const maxKw = Math.max(7, Math.round(e.conectores.reduce((s, c) => s + c.potencia_w, 0) / 1000));
  const limiteKw = e.limite_w ? Math.round(e.limite_w / 1000) : maxKw;
  const real = (c: number) => (c / 100).toFixed(2).replace(".", ",");

  return (
    <>
      <AutoAtualizar ms={5_000} />
      <div className="between" style={{ marginBottom: 14 }}>
        <Link className="link" href="/painel/estacoes" style={{ display: "flex", alignItems: "center", gap: 4 }}><Ic n="back" />Estações</Link>
        <div className="row" style={{ gap: 12 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>{e.conectada ? `Conectada há ${haQuanto(det.conectada_em)}` : `Último contato: ${haQuanto(e.ultimo_contato)}`}</span>
          <Link className="btn btn-ghost btn-sm" href={`/painel/estacoes/${id}/qr`}><Ic n="qr" />QR dos conectores</Link>
        </div>
      </div>
      {q.ok && <div className="aviso ok">{OK[q.ok] ?? "Salvo."}</div>}
      {q.erro && <div className="aviso erro">{ERROS[q.erro] ?? q.erro}</div>}
      {q.criada && <div className="aviso ok">Estação cadastrada. {e.simulada ? "O carregador simulado já está ligando." : "Digite no carregador o endereço que aparece em Conexão do carregador."}</div>}

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
                <div><small>Preço agora</small><b>{brl(tarifaAgora?.preco_kwh_centavos ?? det.preco_kwh_centavos)}/kWh</b></div>
                <div><small>Custo energia</small><b>{brl(det.custo_kwh_centavos)}/kWh</b></div>
                <div><small>Local</small><b>{e.parceiro ?? "Própria"}</b></div>
              </div>
              <div style={{ marginTop: 12, display: "grid", gap: 6, fontSize: 12.5 }}>
                {daEstacao.map((t) => (
                  <div key={t.id} className="between">
                    <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: t.cor }} />{t.nome} · {horarioDa(t)}</span>
                    <b className="mono" style={tarifaAgora?.id === t.id ? { color: "var(--g600)" } : undefined}>{brl(t.preco_kwh_centavos)}</b>
                  </div>
                ))}
                <div className="between">
                  <span className="muted">{daEstacao.length ? "Demais horários" : "Preço único, o dia todo"}</span>
                  <b className="mono" style={!tarifaAgora ? { color: "var(--g600)" } : undefined}>{brl(det.preco_kwh_centavos)}</b>
                </div>
              </div>
            </div>
          </div>

          {admin && !e.simulada && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-h"><h3>Conexão do carregador</h3></div>
              <div className="panel-b">
                {/* Situação: o próprio admin vê se o carregador entrou ou por que foi recusado. */}
                {e.conectada ? (
                  <div className="aviso ok" style={{ marginBottom: 12 }}>Carregador conectado{det.fabricante ? ` (${det.fabricante}${det.modelo ? ` ${det.modelo}` : ""})` : ""}.</div>
                ) : recusa ? (
                  <div className="aviso erro" style={{ marginBottom: 12 }}>
                    O carregador tentou conectar há {haQuanto(recusa.em)} e foi recusado: <b>{recusa.motivo}</b>. Confira se o endereço abaixo foi digitado exatamente igual.
                  </div>
                ) : !e.ultimo_contato ? (
                  <div className="aviso" style={{ marginBottom: 12 }}>Aguardando a primeira conexão do carregador.</div>
                ) : null}

                {enderecoChave ? (
                  <>
                    <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Este é o endereço do carregador. Ele já leva a chave de segurança: não precisa de usuário nem senha.</p>
                    <CopiarTexto texto={enderecoChave} rotulo="Copiar endereço do carregador" />
                    <div className="passos-ocpp">
                      <b>Como configurar no carregador</b>
                      <ol>
                        <li>Copie o endereço acima e mande para quem vai estar na frente do carregador (por WhatsApp, por exemplo).</li>
                        <li>No carregador, abra a tela de configuração OCPP. Em geral fica num ícone de engrenagem ou num menu chamado OCPP, Rede ou Servidor.</li>
                        <li>Escolha o protocolo <b>OCPP 1.6</b> (ou 1.6J).</li>
                        <li>No campo do endereço do servidor, apague o que estiver lá e digite o endereço inteiro, exatamente igual: tudo minúsculo e sem espaço. Conforme o modelo, o campo se chama IPendereço, Endereço do servidor, Server URL, Central System URL ou OCPP URL.</li>
                        <li>Toque em Salvar. Alguns carregadores reiniciam sozinhos.</li>
                        <li>Em 1 ou 2 minutos, atualize esta página: aqui em cima deve aparecer <b>Carregador conectado</b>.</li>
                      </ol>
                      <small className="muted">Se aparecer “recusado”, o motivo vem escrito aqui em cima. O mais comum é uma letra trocada no endereço: confira letra por letra. O número do carregador que aparece na tela dele (ID, número da pilha) não precisa mudar.</small>
                    </div>
                    {q.chave && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Endereço novo gerado: o anterior deixou de valer. Atualize no carregador.</p>}
                    <details style={{ marginTop: 10 }}>
                      <summary className="muted" style={{ fontSize: 12.5, cursor: "pointer" }}>Gerar outro endereço (se a chave vazou)</summary>
                      <form action={novaChaveOcpp} style={{ marginTop: 8 }}>
                        <input type="hidden" name="id" value={id} />
                        <button className="btn btn-ghost btn-sm"><Ic n="refresh" />Gerar novo endereço</button>
                        <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>O atual para de funcionar na hora.</span>
                      </form>
                    </details>
                  </>
                ) : (
                  <form action={novaChaveOcpp}>
                    <input type="hidden" name="id" value={id} />
                    <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Gere o endereço do carregador: é o que se digita no carregador para ele conectar.</p>
                    <button className="btn btn-volt btn-sm"><Ic n="refresh" />Gerar endereço do carregador</button>
                  </form>
                )}

                <details style={{ marginTop: 14 }}>
                  <summary className="muted" style={{ fontSize: 12.5, cursor: "pointer" }}>Carregador com campos de usuário e senha (opcional)</summary>
                  <p className="muted" style={{ fontSize: 12.5, margin: "8px 0" }}>Só para carregadores que pedem usuário e senha (OCPP perfil de segurança 1). Nesse caso use este endereço, sem chave:</p>
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
                  {enderecoChave && (
                    <form action={desligarChaveOcpp} style={{ marginTop: 12 }}>
                      <input type="hidden" name="id" value={id} />
                      <button className="btn btn-ghost btn-sm">Desligar o endereço com chave</button>
                      <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Deixa só usuário e senha.</span>
                    </form>
                  )}
                </details>
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
                    <div className="field"><label>Preço por kWh (R$) fora das tarifas</label><input className="input mono" name="preco" required maxLength={8} defaultValue={real(det.preco_kwh_centavos)} /></div>
                    <div className="field"><label>Custo por kWh (R$)</label><input className="input mono" name="custo" maxLength={8} defaultValue={real(det.custo_kwh_centavos)} /></div>
                    <div className="field full">
                      <label>Parceiro / local</label>
                      <select className="input" name="parceiro" defaultValue={det.parceiro_id ?? ""}>
                        <option value="">Própria (Viva Energia)</option>
                        {parceiros.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="box-title" style={{ marginTop: 4 }}>Tarifas por horário</div>
                  <EscolherTarifas
                    tarifas={todasTarifas.map((t) => ({ id: t.id, nome: t.nome, cor: t.cor, horario: horarioDa(t), preco: real(t.preco_kwh_centavos), hora_inicio: t.hora_inicio, hora_fim: t.hora_fim }))}
                    marcadas={daEstacao.map((t) => t.id)}
                  />
                  <button className="btn btn-dark btn-sm" style={{ marginTop: 12 }}>Salvar dados</button>
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
