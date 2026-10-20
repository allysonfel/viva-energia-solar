"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Ic } from "./Ic";
import { RecargaFlutuante } from "./RecargaFlutuante";

const TITULO: [RegExp, string][] = [
  [/^\/carteira/, "Carteira"],
  [/^\/historico/, "Minhas recargas"],
  [/^\/recibo/, "Recibo"],
  [/^\/perfil/, "Perfil"],
  [/^\/ajuda/, "Ajuda e suporte"],
  [/^\/avisos/, "Avisos"],
];

// Moldura do app: cabeçalho (exceto mapa, estação e recarga ao vivo) e abas.
// O botão do meio vira "Recarga" quando há uma em andamento.
export function AppShell({ children, nome, recargaInicial, naoLidosInicial, tema }: { children: React.ReactNode; nome: string; recargaInicial: number | null; naoLidosInicial: number; tema: "auto" | "claro" | "escuro" }) {
  const path = usePathname();
  const [recarga, setRecarga] = useState(recargaInicial);
  const [naoLidos, setNaoLidos] = useState(naoLidosInicial);
  // Aba tocada: marca na hora, sem esperar a tela nova chegar do servidor.
  const [indo, setIndo] = useState<string | null>(null);
  useEffect(() => setIndo(null), [path]);

  // Confere se há recarga em andamento a cada troca de tela e a cada 15 s
  // (começou pelo cartão no carregador, terminou, foi encerrada pelo botão).
  useEffect(() => {
    let vivo = true;
    const conferir = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/app/recarga-atual", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!vivo || !d) return;
          setRecarga(d.id ?? null);
          setNaoLidos(d.naoLidos ?? 0);
        })
        .catch(() => {});
    };
    conferir();
    const t = setInterval(conferir, 15_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [path]);

  const titulo = TITULO.find(([r]) => r.test(path))?.[1];
  const tela = path === "/" ? "mapa" : path.split("/")[1];
  const semAbas = tela === "recarga" || tela === "ler";
  const on = (t: string) => ((indo ?? tela) === t ? "on" : "");
  const aba = (href: string, t: string, ic: string, rotulo: string, extra?: string) => (
    <Link href={href} className={on(t) || (extra ? on(extra) : "")} onClick={() => tela !== t && setIndo(t)}>
      <span className="tab-ic"><Ic n={ic} /></span>{rotulo}
    </Link>
  );

  return (
    <div className="app-stage">
      <div className="app" data-tema={tema === "auto" ? undefined : tema}>
        {titulo && (
          <div className="app-head">
            <div>
              <div className="hello">Olá, {nome.split(" ")[0]}</div>
              <div className="name">{titulo}</div>
            </div>
            <Link className="icon-btn" href="/avisos" aria-label="Avisos" onClick={() => setNaoLidos(0)}><Ic n="bell" />{naoLidos > 0 && <span className="pip" />}</Link>
          </div>
        )}
        <div className="app-body">{children}</div>
        {recarga && !semAbas && <RecargaFlutuante key={recarga} id={recarga} />}
        {!semAbas && (
          <div className="tabbar">
            {aba("/", "mapa", "map", "Mapa", "estacao")}
            {aba("/carteira", "carteira", "wallet", "Carteira")}
            <Link href={recarga ? `/recarga/${recarga}` : "/ler"} className="scan">
              <span className="ring"><Ic n={recarga ? "bolt" : "qr"} /></span>
              {recarga ? "Recarga" : "Ler QR"}
            </Link>
            {aba("/historico", "historico", "list", "Recargas", "recibo")}
            {aba("/perfil", "perfil", "user", "Perfil", "ajuda")}
          </div>
        )}
      </div>
    </div>
  );
}
