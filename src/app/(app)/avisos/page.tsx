import Link from "next/link";
import { requireMotorista } from "@/lib/motorista";
import { sql } from "@/lib/db";
import { quando } from "@/lib/format";
import { Ic } from "@/components/Ic";

// Caixa de avisos do app. Abrir a tela marca tudo como lido.
export default async function Avisos() {
  const m = await requireMotorista();
  const lista = await sql<{ id: number; titulo: string; texto: string; link: string | null; lido: boolean; criado_em: Date }[]>`
    SELECT id, titulo, texto, link, lido, criado_em FROM avisos_motorista WHERE motorista_id = ${m.id} ORDER BY id DESC LIMIT 40`;
  await sql`UPDATE avisos_motorista SET lido = true WHERE motorista_id = ${m.id} AND NOT lido`;
  const seguro = (l: string | null) => (l && /^\/(?!\/)/.test(l) ? l : null);
  return (
    <div className="sec-pad">
      <div className="box">
        {lista.length === 0 && (
          <div className="empty"><div className="em-ic"><Ic n="bell" /></div><b>Nenhum aviso</b><div className="muted" style={{ fontSize: 13 }}>Avisos de recarga e da carteira aparecem aqui.</div></div>
        )}
        {lista.map((a) => {
          const corpo = (
            <>
              <span className="li-ic" style={a.lido ? undefined : { background: "var(--g100)" }}><Ic n="bolt" /></span>
              <div className="li-main"><b>{a.titulo}</b><small>{a.texto}</small><small className="muted">{quando(a.criado_em)}</small></div>
              {!a.lido && <span className="dot st-disponivel" />}
            </>
          );
          const href = seguro(a.link);
          return href ? <Link key={a.id} className="list-item" href={href} style={{ textDecoration: "none", color: "inherit" }}>{corpo}</Link> : <div key={a.id} className="list-item">{corpo}</div>;
        })}
      </div>
    </div>
  );
}
