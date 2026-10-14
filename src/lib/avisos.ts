// Avisos para a equipe (sino do painel). Um aviso aberto por tipo e estação/
// recarga: repetir o mesmo problema não duplica (índice único parcial).
import { sql } from "./db";

export async function abrirAviso(tipo: string, ref: { estacao?: number | null; recarga?: number | null }, titulo: string, texto = "") {
  await sql`
    INSERT INTO avisos (tipo, estacao_id, recarga_id, titulo, texto)
    VALUES (${tipo}, ${ref.estacao ?? null}, ${ref.recarga ?? null}, ${titulo.slice(0, 120)}, ${texto.slice(0, 300)})
    ON CONFLICT DO NOTHING`;
}

export async function resolverAviso(tipo: string, ref: { estacao?: number | null; recarga?: number | null }) {
  await sql`
    UPDATE avisos SET resolvido_em = now()
    WHERE resolvido_em IS NULL AND tipo = ${tipo}
      AND coalesce(estacao_id, 0) = ${ref.estacao ?? 0} AND coalesce(recarga_id, 0) = ${ref.recarga ?? 0}`;
}
