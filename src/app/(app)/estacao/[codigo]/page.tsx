import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMotorista } from "@/lib/motorista";
import { estacoesDoMapa, recargaEmAndamento, vouchersDisponiveis } from "@/lib/app";
import { listarTarifas, horaBrasilia } from "@/lib/tarifas";
import { getSettings } from "@/lib/settings";
import { EstacaoApp } from "./EstacaoApp";

export default async function Estacao({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<{ c?: string }> }) {
  const m = await requireMotorista();
  const codigo = decodeURIComponent((await params).codigo).toUpperCase().slice(0, 40);
  const { c } = await searchParams;
  const aberta = await recargaEmAndamento(m.id);
  if (aberta) redirect(`/recarga/${aberta.id}`);
  const [e] = /^[A-Z0-9._-]{3,40}$/.test(codigo) ? await estacoesDoMapa(codigo) : [];
  const s = await getSettings();
  if (!e)
    return (
      <div className="sec-pad" style={{ textAlign: "center", paddingTop: 60 }}>
        <h3 style={{ fontSize: 20, fontWeight: 800 }}>Estação não encontrada</h3>
        <p className="muted" style={{ margin: "8px 0 20px" }}>Confira o código impresso no carregador.</p>
        <Link className="btn btn-dark" href="/ler">Ler outro código</Link>
      </div>
    );
  const [tarifas, vouchers] = await Promise.all([listarTarifas(), vouchersDisponiveis(m.id, e.id)]);
  return (
    <EstacaoApp e={e} conectorInicial={Number(c) || null} saldo={m.saldo_centavos} saldoMinimo={s.saldoMinimoCentavos} meusConectores={m.conectores}
      tarifas={tarifas} horaAgora={horaBrasilia()} vouchers={vouchers.map((v) => ({ mv: v.mv, codigo: v.codigo, pct: v.pct }))} />
  );
}
