import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { brl, centavosDe } from "@/lib/format";
import { listarTarifas, faixaNoHorario, validarGrade, horaBrasilia } from "@/lib/tarifas";

const CORES = ["#BFEBD5", "#34B37A", "#0B3B2A", "#7BCFA6", "#E9A23B", "#2F7FD8", "#177148", "#C4F53A"];
const tinta = (cor: string) => (["#0B3B2A", "#177148", "#34B37A", "#2F7FD8"].includes(cor) ? "#fff" : "#0B3B2A");
const MAX = 8;

// A grade inteira é salva de uma vez (cobre 24 h, sem buraco nem sobreposição).
async function salvarGrade(fd: FormData) {
  "use server";
  const u = await requireUser(["admin"]);
  const faixas: { nome: string; hora_inicio: number; hora_fim: number; preco: number; cor: string }[] = [];
  for (let i = 0; i < MAX; i++) {
    const nome = String(fd.get(`nome${i}`) ?? "").trim().slice(0, 30);
    if (!nome) continue;
    const ini = Number(fd.get(`ini${i}`)), fim = Number(fd.get(`fim${i}`));
    const preco = centavosDe(fd.get(`preco${i}`));
    const cor = String(fd.get(`cor${i}`) ?? "");
    if (nome.length < 2 || !Number.isInteger(ini) || !Number.isInteger(fim) || ini < 0 || fim > 24 || fim <= ini || preco === null || preco < 1 || preco > 10000) {
      redirect(`/painel/tarifas?erro=${encodeURIComponent(`Confira a faixa "${nome}": horário e preço.`)}`);
    }
    faixas.push({ nome, hora_inicio: ini, hora_fim: fim, preco, cor: /^#[0-9A-Fa-f]{6}$/.test(cor) ? cor : CORES[i % CORES.length] });
  }
  const erro = validarGrade(faixas);
  if (erro) redirect(`/painel/tarifas?erro=${encodeURIComponent(erro)}`);
  await sql.begin(async (tx) => {
    await tx`DELETE FROM tarifas`;
    for (const f of faixas) {
      await tx`INSERT INTO tarifas (nome, hora_inicio, hora_fim, preco_kwh_centavos, cor) VALUES (${f.nome}, ${f.hora_inicio}, ${f.hora_fim}, ${f.preco}, ${f.cor})`;
    }
  });
  await audit(`usuario:${u.id}`, "tarifas_salvas", null, null, faixas.map((f) => `${f.nome} ${f.hora_inicio}-${f.hora_fim}h ${f.preco}`).join("; ") || "sem faixas");
  revalidatePath("/painel/tarifas");
  redirect("/painel/tarifas?ok=1");
}

export default async function Tarifas({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; editar?: string }> }) {
  const u = await requireUser(["admin", "operador"]);
  const q = await searchParams;
  const tarifas = await listarTarifas();
  const agora = faixaNoHorario(tarifas);
  const [custo] = await sql<{ medio: number | null }[]>`SELECT round(avg(custo_kwh_centavos))::int AS medio FROM estacoes WHERE ativa`;
  const d = new Date(Date.now() - 3 * 3_600_000);
  const nowPct = ((horaBrasilia() + d.getUTCMinutes() / 60) / 24) * 100;
  const editar = u.perfil === "admin" && q.editar === "1";
  const linhas = editar ? [...tarifas, ...Array.from({ length: Math.max(0, MAX - tarifas.length) }, () => null)].slice(0, MAX) : [];

  return (
    <>
      {q.ok && <div className="aviso ok">Tarifas salvas. Valem para as recargas que começarem a partir de agora.</div>}
      {q.erro && <div className="aviso erro">{q.erro.slice(0, 200)}</div>}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h">
          <h3>Grade de hoje · todas as estações</h3>
          <span className="muted" style={{ fontSize: 12.5 }}>Faixa vigente: <b style={{ color: "var(--ink)" }}>{agora?.nome ?? "preço de cada estação"}</b></span>
        </div>
        <div className="panel-b">
          {tarifas.length ? (
            <>
              <div className="timeline">
                {tarifas.map((t) => (
                  <div key={t.id} style={{ flex: t.hora_fim - t.hora_inicio, background: t.cor, color: tinta(t.cor) }}>
                    {t.hora_fim - t.hora_inicio >= 3 && <>{t.nome}<b>{brl(t.preco_kwh_centavos)}</b></>}
                  </div>
                ))}
                <span className="now-mark" style={{ left: `${nowPct}%` }} />
              </div>
              <div className="hours">{["00", "03", "06", "09", "12", "15", "18", "21", "24"].map((h) => <span key={h}>{h}h</span>)}</div>
            </>
          ) : (
            <div className="muted">Sem faixas de horário: cada estação cobra o preço do próprio cadastro.</div>
          )}
        </div>
      </div>

      {!editar ? (
        <div className="panel">
          <div className="panel-h">
            <h3>Faixas de preço</h3>
            <div className="row" style={{ gap: 12 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Custo médio da energia: {custo.medio ? `${brl(custo.medio)}/kWh` : "-"}</span>
              {u.perfil === "admin" && <a className="btn btn-dark btn-sm" href="/painel/tarifas?editar=1">Editar grade</a>}
            </div>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Faixa</th><th>Horário</th><th>Aplicada em</th><th className="num">Preço/kWh</th><th className="num">Margem</th></tr></thead>
              <tbody>
                {tarifas.length === 0 && <tr><td colSpan={5} className="muted">Nenhuma faixa cadastrada.</td></tr>}
                {tarifas.map((t) => (
                  <tr key={t.id}>
                    <td><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: t.cor, width: 12, height: 12, borderRadius: 4 }} /><b>{t.nome}</b></span></td>
                    <td className="mono">{String(t.hora_inicio).padStart(2, "0")}:00 a {String(t.hora_fim % 24).padStart(2, "0")}:00</td>
                    <td>Todas as estações</td>
                    <td className="num"><b>{brl(t.preco_kwh_centavos)}</b></td>
                    <td className="num" style={{ color: "var(--g600)" }}>{custo.medio ? `${Math.round((1 - custo.medio / t.preco_kwh_centavos) * 100)}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-b muted" style={{ fontSize: 12.5, borderTop: "1px solid var(--line)" }}>
            A tarifa que vale é a do horário em que a recarga começa. Vouchers dão desconto em % sobre ela.
          </div>
        </div>
      ) : (
        <form action={salvarGrade} className="panel">
          <div className="panel-h"><h3>Editar grade</h3><a className="link" href="/painel/tarifas">Cancelar</a></div>
          <div className="panel-b">
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>As faixas precisam cobrir de 00h a 24h, em sequência. Deixe o nome vazio para apagar a linha. Sem nenhuma faixa, vale o preço de cada estação.</p>
            {linhas.map((t, i) => (
              <div key={i} className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input className="input" name={`nome${i}`} defaultValue={t?.nome ?? ""} placeholder="Nome (ex.: Ponta)" maxLength={30} style={{ width: 160, height: 38 }} />
                <select className="input" name={`ini${i}`} defaultValue={t?.hora_inicio ?? 0} style={{ width: 90, height: 38 }}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}h</option>)}
                </select>
                <span className="muted">até</span>
                <select className="input" name={`fim${i}`} defaultValue={t?.hora_fim ?? 24} style={{ width: 90, height: 38 }}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h + 1}>{String(h + 1).padStart(2, "0")}h</option>)}
                </select>
                <input className="input mono" name={`preco${i}`} defaultValue={t ? (t.preco_kwh_centavos / 100).toFixed(2).replace(".", ",") : ""} placeholder="R$/kWh" maxLength={8} style={{ width: 100, height: 38 }} />
                <input type="color" name={`cor${i}`} defaultValue={t?.cor ?? CORES[i % CORES.length]} style={{ width: 44, height: 38, border: 0, background: "none" }} aria-label="Cor" />
              </div>
            ))}
            <button className="btn btn-dark" style={{ marginTop: 8 }}>Salvar grade</button>
          </div>
        </form>
      )}
    </>
  );
}
