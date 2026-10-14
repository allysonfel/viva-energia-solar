"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Recarrega os dados da tela (sem recarregar a página) a cada X ms.
// Pausa com a aba escondida.
export function AutoAtualizar({ ms }: { ms: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ms);
    return () => clearInterval(t);
  }, [ms, router]);
  return null;
}
