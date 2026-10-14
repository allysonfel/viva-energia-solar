"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Ic } from "./Ic";

const TITULO: [RegExp, string][] = [
  [/^\/carteira/, "Carteira"],
  [/^\/historico/, "Minhas recargas"],
  [/^\/recibo/, "Recibo"],
  [/^\/perfil/, "Perfil"],
  [/^\/ajuda/, "Ajuda e suporte"],
];

// Moldura do app: cabeçalho (exceto mapa, estação e recarga ao vivo) e abas.
// O botão do meio vira "Recarga" quando há uma em andamento.
export function AppShell({ children, nome, recargaInicial }: { children: React.ReactNode; nome: string; recargaInicial: number | null }) {
  const path = usePathname();
  const [recarga, setRecarga] = useState(recargaInicial);

  // Confere a cada 15 s se há recarga em andamento (começou pelo cartão, terminou...).
  useEffect(() => {
    let vivo = true;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/app/recarga-atual", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => vivo && d && setRecarga(d.id ?? null))
        .catch(() => {});
    }, 15_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  const titulo = TITULO.find(([r]) => r.test(path))?.[1];
  const tela = path === "/" ? "mapa" : path.split("/")[1];
  const semAbas = tela === "recarga" || tela === "ler";
  const on = (t: string) => (tela === t ? "on" : "");

  return (
    <div className="app-stage">
      <div className="app">
        {titulo && (
          <div className="app-head">
            <div>
              <div className="hello">Olá, {nome.split(" ")[0]}</div>
              <div className="name">{titulo}</div>
            </div>
            <Link className="icon-btn" href="/ajuda" aria-label="Ajuda"><Ic n="help" /></Link>
          </div>
        )}
        <div className="app-body">{children}</div>
        {!semAbas && (
          <div className="tabbar">
            <Link href="/" className={on("mapa") || on("estacao")}><Ic n="map" />Mapa</Link>
            <Link href="/carteira" className={on("carteira")}><Ic n="wallet" />Carteira</Link>
            <Link href={recarga ? `/recarga/${recarga}` : "/ler"} className="scan">
              <span className="ring"><Ic n={recarga ? "bolt" : "qr"} /></span>
              {recarga ? "Recarga" : "Ler QR"}
            </Link>
            <Link href="/historico" className={on("historico") || on("recibo")}><Ic n="list" />Recargas</Link>
            <Link href="/perfil" className={on("perfil") || on("ajuda")}><Ic n="user" />Perfil</Link>
          </div>
        )}
      </div>
    </div>
  );
}
