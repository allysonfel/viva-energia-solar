"use client";

// Endereço do carregador com botão de copiar (o admin cola no celular ou
// manda para o técnico que vai digitar no carregador).
import { useState } from "react";
import { Ic } from "@/components/Ic";

export function CopiarTexto({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="copiar-texto">
      <div className="ocpp-url" style={{ wordBreak: "break-all" }}>{texto}</div>
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
        onClick={() => navigator.clipboard?.writeText(texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2500); })}>
        <Ic n={copiado ? "check" : "copy"} />{copiado ? "Copiado" : rotulo}
      </button>
    </div>
  );
}
