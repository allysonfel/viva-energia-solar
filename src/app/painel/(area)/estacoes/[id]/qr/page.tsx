import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireUser, parceiroDoEscopo } from "@/lib/session";
import { listarEstacoes } from "@/lib/estacoes";
import { kw } from "@/lib/format";
import { Ic } from "@/components/Ic";

// QR code de cada conector, para imprimir e colar no carregador. Leva para
// /e/<código>/<conector>: o app abre a estação com o conector escolhido.
export default async function QrEstacao({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const id = Number((await params).id);
  const [e] = Number.isInteger(id) && id > 0 ? await listarEstacoes(parceiroDoEscopo(u), id) : [];
  if (!e) notFound();
  let base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (!base) base = `http://${(await headers()).get("host") ?? "localhost"}`;
  const qrs = await Promise.all(
    e.conectores.map(async (c) => {
      const url = `${base}/e/${encodeURIComponent(e.codigo)}/${c.numero}`;
      return { ...c, url, img: await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark: "#062A1E", light: "#FFFFFF" } }) };
    }),
  );
  return (
    <>
      <div className="between" style={{ marginBottom: 14 }}>
        <Link className="link" href={`/painel/estacoes/${id}`} style={{ display: "flex", alignItems: "center", gap: 4 }}><Ic n="back" />{e.nome}</Link>
        <span className="muted" style={{ fontSize: 12.5 }}>Imprima (Ctrl+P) e cole cada QR no conector certo.</span>
      </div>
      <div className="qr-imprimir">
        {qrs.map((q) => (
          <figure key={q.numero}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={q.img} alt={`QR do conector ${q.numero}`} />
            <figcaption>
              <b>{e.nome}</b>
              <div className="mono" style={{ fontSize: 13 }}>{e.codigo} · conector {q.numero}</div>
              <div className="muted" style={{ fontSize: 12 }}>{q.tipo} · {kw(q.potencia_w)} kW</div>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
