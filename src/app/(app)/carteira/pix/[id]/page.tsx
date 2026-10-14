import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMotorista } from "@/lib/motorista";
import { sql } from "@/lib/db";
import { provedorPagamentos, qrPix } from "@/lib/pagamentos";
import { brl } from "@/lib/format";
import { Ic } from "@/components/Ic";
import { AutoAtualizar } from "@/components/AutoAtualizar";
import { CopiarPix } from "./CopiarPix";
import { simularPagamentoPix } from "../../../acoes";

export default async function PagarPix({ params }: { params: Promise<{ id: string }> }) {
  const m = await requireMotorista();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [p] = await sql<{ id: number; valor_centavos: number; status: string; pix_copia_cola: string; expira_em: Date; provedor: string }[]>`
    SELECT id, valor_centavos, CASE WHEN status = 'pendente' AND expira_em < now() THEN 'expirado' ELSE status END AS status,
      pix_copia_cola, expira_em, provedor
    FROM pagamentos WHERE id = ${id} AND motorista_id = ${m.id} AND metodo = 'pix'`;
  if (!p) notFound();

  if (p.status === "pago")
    return (
      <div className="sec-pad">
        <div className="receipt">
          <div className="rh"><div className="ok"><Ic n="check" /></div><h3 style={{ fontSize: 20, fontWeight: 800 }}>Pix recebido</h3><div className="muted" style={{ fontSize: 13 }}>{brl(p.valor_centavos)} na sua carteira</div></div>
        </div>
        <div className="box" style={{ marginTop: 12 }}><div className="between"><span className="muted">Saldo</span><b className="mono">{brl(m.saldo_centavos)}</b></div></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Link className="btn btn-ghost" href="/carteira">Carteira</Link>
          <Link className="btn btn-volt" href="/">Recarregar</Link>
        </div>
      </div>
    );

  if (p.status !== "pendente")
    return (
      <div className="sec-pad">
        <div className="aviso erro">Este Pix {p.status === "expirado" ? "expirou" : "não está mais disponível"}. Gere outro na carteira.</div>
        <Link className="btn btn-dark btn-block" href="/carteira">Voltar à carteira</Link>
      </div>
    );

  const simulado = p.provedor === "simulado" && provedorPagamentos().simulado;
  return (
    <div className="sec-pad">
      <AutoAtualizar ms={4_000} />
      <div className="box">
        <div className="pix-box">
          <b>Pague {brl(p.valor_centavos)} com Pix</b>
          <div className="pix-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={await qrPix(p.pix_copia_cola)} alt="QR code do Pix" width={150} height={150} />
          </div>
          <CopiarPix codigo={p.pix_copia_cola} />
          <div className="muted" style={{ fontSize: 12.5, margin: "10px 0" }}>
            Vale até {new Date(p.expira_em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}. O saldo cai sozinho quando o banco confirmar.
          </div>
          {simulado && (
            <form action={simularPagamentoPix}>
              <input type="hidden" name="id" value={p.id} />
              <button className="btn btn-volt btn-block">Simular pagamento (teste)</button>
            </form>
          )}
        </div>
      </div>
      <Link className="btn btn-ghost btn-block" href="/carteira">Voltar à carteira</Link>
    </div>
  );
}
