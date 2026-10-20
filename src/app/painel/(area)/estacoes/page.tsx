import Link from "next/link";
import { requireAba, parceiroDoEscopo } from "@/lib/session";
import { listarEstacoes } from "@/lib/estacoes";
import { Ic } from "@/components/Ic";
import { GradeEstacoes } from "./GradeEstacoes";

export default async function Estacoes() {
  const u = await requireAba("estacoes");
  const lista = await listarEstacoes(parceiroDoEscopo(u));
  return (
    <>
      {u.perfil === "admin" && (
        <div className="between" style={{ marginBottom: 14 }}>
          <span />
          <Link className="btn btn-dark btn-sm" href="/painel/estacoes/nova"><Ic n="plus" />Nova estação</Link>
        </div>
      )}
      <GradeEstacoes inicial={lista} />
    </>
  );
}
