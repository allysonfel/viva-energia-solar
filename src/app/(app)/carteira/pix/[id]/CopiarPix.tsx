"use client";

import { useState } from "react";
import { Ic } from "@/components/Ic";

export function CopiarPix({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="copy-line">
      <span>{codigo}</span>
      <button
        type="button"
        aria-label="Copiar código Pix"
        onClick={() => navigator.clipboard?.writeText(codigo).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        })}
      >
        {copiado ? <Ic n="check" /> : <Ic n="copy" />}
      </button>
    </div>
  );
}
