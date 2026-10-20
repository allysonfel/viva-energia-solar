import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAba } from "@/lib/session";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { kw, kwh } from "@/lib/format";
import { STATUS_CONECTOR_NOME } from "@/lib/ocpp/tipos";
import * as sim from "@/lib/ocpp/simulador";
import { AutoAtualizar } from "@/components/AutoAtualizar";

// Faz o papel do equipamento e do motorista no local: ligar/desligar o
// carregador (offline), plugar o carro, passar um cartão, tirar o carro e
// provocar uma falha. Tudo passa pela central OCPP de verdade.

async function acao(fd: FormData) {
  "use server";
  const u = await requireAba("simulador");
  if (!sim.simuladorLigado()) redirect("/painel");
  const codigo = String(fd.get("codigo") ?? "");
  const [e] = await sql<{ id: number }[]>`SELECT id FROM estacoes WHERE codigo = ${codigo} AND simulada AND ativa`;
  if (!e) redirect("/painel/simulador");
  const n = Number(fd.get("conector"));
  const tipo = String(fd.get("acao"));
  let erro: string | null = null;
  if (tipo === "ligar") await sim.ligar(codigo);
  else if (tipo === "desligar") sim.desligar(codigo);
  else if (tipo === "plugar") await sim.plugarCarro(codigo, n);
  else if (tipo === "cartao") erro = await sim.plugarEPassarCartao(codigo, n, String(fd.get("tag") ?? "").trim().slice(0, 20) || "SEM-CARTAO");
  else if (tipo === "desplugar") await sim.desplugar(codigo, n);
  else if (tipo === "falha") await sim.simularFalha(codigo, true);
  else if (tipo === "normalizar") await sim.simularFalha(codigo, false);
  await audit(`usuario:${u.id}`, `simulador_${tipo}`, "estacao", e.id);
  revalidatePath("/painel/simulador");
  if (erro) redirect(`/painel/simulador?erro=${encodeURIComponent(erro)}`);
}

async function criarCartao(fd: FormData) {
  "use server";
  const u = await requireAba("simulador");
  const tag = String(fd.get("tag") ?? "").trim().toUpperCase().slice(0, 20);
  if (!/^[A-Z0-9-]{3,20}$/.test(tag)) redirect("/painel/simulador?erro=Cartão inválido (3 a 20 letras, números ou hífen).");
  await sql`INSERT INTO tags (id_tag, descricao, tipo) VALUES (${tag}, 'Cartão de teste do simulador', 'operacao') ON CONFLICT (id_tag) DO UPDATE SET ativa = true`;
  await audit(`usuario:${u.id}`, "cartao_teste_criado", null, null, tag);
  redirect("/painel/simulador?ok=1");
}

export default async function Simulador({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await requireAba("simulador");
  if (!sim.simuladorLigado()) redirect("/painel");
  const sp = await searchParams;
  const estacoes = await sql<{ id: number; codigo: string; nome: string }[]>`SELECT id, codigo, nome FROM estacoes WHERE simulada AND ativa ORDER BY nome`;
  const tags = await sql<{ id_tag: string }[]>`SELECT id_tag FROM tags WHERE ativa ORDER BY id_tag LIMIT 30`;

  return (
    <>
      <AutoAtualizar ms={3_000} />
      <div className="aviso info">
        Carregadores virtuais que conectam na central como um equipamento de verdade (OCPP 1.6J). Use para testar comandos e recargas sem hardware.
        {u.perfil === "admin" && <> Para criar outro, cadastre uma estação marcando &quot;Estação simulada&quot;.</>}
      </div>
      {sp.erro && <div className="aviso erro">{sp.erro.slice(0, 200)}</div>}
      {sp.ok && <div className="aviso ok">Cartão de teste liberado.</div>}

      <form action={criarCartao} className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-b row" style={{ gap: 10, flexWrap: "wrap" }}>
          <b>Cartões aceitos:</b>
          {tags.map((t) => <span key={t.id_tag} className="badge b-neutral mono">{t.id_tag}</span>)}
          <input className="input mono" name="tag" placeholder="NOVO-CARTAO" maxLength={20} style={{ width: 160, height: 34 }} />
          <button className="btn btn-ghost btn-sm">Liberar cartão de teste</button>
        </div>
      </form>

      {estacoes.length === 0 && <div className="panel"><div className="vazio"><b>Nenhuma estação simulada</b>{u.perfil === "admin" && <Link className="link" href="/painel/estacoes/nova">Cadastrar uma</Link>}</div></div>}
      <div className="stations-grid">
        {estacoes.map((e) => {
          const s = sim.estadoSimulador(e.codigo);
          const Btn = ({ a, t, n, cls = "btn-ghost", extra }: { a: string; t: string; n?: number; cls?: string; extra?: React.ReactNode }) => (
            <form action={acao} className="row" style={{ gap: 6 }}>
              <input type="hidden" name="codigo" value={e.codigo} />
              <input type="hidden" name="acao" value={a} />
              {n !== undefined && <input type="hidden" name="conector" value={n} />}
              {extra}
              <button className={`btn btn-sm ${cls}`}>{t}</button>
            </form>
          );
          return (
            <div key={e.id} className="st-card" style={{ cursor: "default" }}>
              <div className="top">
                <div>
                  <div className="id">{e.codigo}</div>
                  <h4><Link href={`/painel/estacoes/${e.id}`} style={{ textDecoration: "none" }}>{e.nome}</Link></h4>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {s?.conectado ? "Conectado à central" : s?.ligado ? "Conectando..." : "Desligado"}
                    {s?.limiteW ? ` · limite ${kw(s.limiteW)} kW` : ""}
                    {s ? ` · medidor ${kwh(s.medidorWh, 0)} kWh` : ""}
                  </div>
                </div>
                <span className={`badge ${s?.conectado ? (s.falha ? "b-offline" : "b-disponivel") : "b-neutral"}`}>
                  <span className={`dot ${s?.conectado ? (s.falha ? "st-offline" : "st-disponivel") : "st-indisponivel"}`} />
                  {s?.conectado ? (s.falha ? "Em falha" : "Online") : "Offline"}
                </span>
              </div>
              <div className="sim-con">
                {s?.ligado ? <Btn a="desligar" t="Desligar (offline)" /> : <Btn a="ligar" t="Ligar" cls="btn-dark" />}
                {s?.conectado && (s.falha ? <Btn a="normalizar" t="Resolver falha" /> : <Btn a="falha" t="Provocar falha" cls="btn-danger" />)}
              </div>
              {s?.conectores.map((c) => (
                <div key={c.numero} className="list-item sim-linha">
                  <div className="li-main">
                    <b>Conector {c.numero} · {STATUS_CONECTOR_NOME[c.status] ?? c.status}</b>
                    <small>{c.tx ? `Recarga #${c.tx} · ${kw(c.potenciaW)} kW · bateria ${c.soc}%` : c.soc !== null ? `Carro conectado · bateria ${c.soc}%` : "Sem carro"}</small>
                  </div>
                  {s.conectado && !s.falha && (
                    <div className="sim-con">
                      {!c.tx && c.soc === null && <Btn a="plugar" t="Plugar carro" n={c.numero} />}
                      {!c.tx && (
                        <Btn a="cartao" t="Passar cartão" n={c.numero} cls="btn-dark" extra={
                          <select className="input" name="tag" style={{ height: 34, width: 140 }} defaultValue={tags[0]?.id_tag ?? ""}>
                            {tags.map((t) => <option key={t.id_tag}>{t.id_tag}</option>)}
                            <option value="CARTAO-DESCONHECIDO">CARTAO-DESCONHECIDO</option>
                          </select>
                        } />
                      )}
                      {(c.tx || c.soc !== null) && <Btn a="desplugar" t="Tirar o carro" n={c.numero} />}
                    </div>
                  )}
                </div>
              ))}
              {s && s.log.length > 0 && (
                <div className="log" style={{ marginTop: 10 }}>
                  {s.log.slice(0, 5).map((l, i) => (
                    <div key={i}><span className="tm">{new Date(l.em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span><span style={{ flex: 1 }}>{l.texto}</span></div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
