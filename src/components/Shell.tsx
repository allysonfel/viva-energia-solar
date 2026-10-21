"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Ic } from "./Ic";
import { Sino } from "./Sino";
import { BotaoSair } from "./BotaoSair";

type Perfil = "admin" | "operador" | "parceiro";
type Item = { href: string; nome: string; ic: string; aba?: string; perfis?: Perfil[] };

const NAV: (Item | string)[] = [
  { href: "/painel", nome: "Visão geral", ic: "grid" },
  { href: "/painel/estacoes", nome: "Estações", ic: "plug", aba: "estacoes" },
  { href: "/painel/recargas", nome: "Recargas", ic: "list", aba: "recargas" },
  "Comercial",
  { href: "/painel/tarifas", nome: "Tarifas", ic: "clock", aba: "tarifas" },
  { href: "/painel/vouchers", nome: "Vouchers", ic: "ticket", aba: "vouchers" },
  { href: "/painel/clientes", nome: "Clientes", ic: "users", aba: "clientes" },
  { href: "/painel/relatorios", nome: "Relatórios", ic: "chart", aba: "relatorios" },
  "Gestão",
  { href: "/painel/equipe", nome: "Equipe", ic: "shield", perfis: ["admin"] },
  { href: "/painel/simulador", nome: "Simulador", ic: "sliders", aba: "simulador" },
  { href: "/painel/configuracoes", nome: "Configurações", ic: "settings", perfis: ["admin"] },
];

const TITULO: [RegExp, string][] = [
  [/^\/painel$/, "Visão geral"],
  [/^\/painel\/estacoes\/nova/, "Nova estação"],
  [/^\/painel\/estacoes\/.+/, "Estação"],
  [/^\/painel\/estacoes/, "Estações"],
  [/^\/painel\/recargas/, "Recargas"],
  [/^\/painel\/tarifas/, "Tarifas"],
  [/^\/painel\/vouchers/, "Vouchers"],
  [/^\/painel\/clientes\/.+/, "Cliente"],
  [/^\/painel\/clientes/, "Clientes"],
  [/^\/painel\/relatorios/, "Relatórios"],
  [/^\/painel\/equipe/, "Equipe e permissões"],
  [/^\/painel\/simulador/, "Simulador de carregadores"],
  [/^\/painel\/configuracoes/, "Configurações"],
  [/^\/painel\/conta/, "Minha conta"],
];

const PERFIL_NOME: Record<Perfil, string> = { admin: "Administrador", operador: "Operador", parceiro: "Parceiro" };
const iniciais = (n: string) => n.split(" ").filter((x) => /^[A-Za-zÀ-ú]/.test(x)).map((x) => x[0]).slice(0, 2).join("").toUpperCase() || "?";

export function Shell({
  children,
  user,
  empresa,
  simulador,
  sair,
  vapid,
  tema: temaInicial,
}: {
  children: React.ReactNode;
  user: { nome: string; perfil: Perfil; parceiro: string | null; abas: string[] };
  empresa: string;
  simulador: boolean;
  sair: () => Promise<void>;
  vapid: string | null;
  tema: "claro" | "escuro";
}) {
  const [tema, setTema] = useState(temaInicial);
  const alternarTema = () => {
    const novo = tema === "escuro" ? "claro" : "escuro";
    setTema(novo);
    document.cookie = `viva_painel_tema=${novo}; path=/painel; max-age=31536000; samesite=lax`;
  };
  const path = usePathname();
  const pode = (n: Item) => (!n.perfis || n.perfis.includes(user.perfil)) && (!n.aba || user.abas.includes(n.aba)) && (n.href !== "/painel/simulador" || simulador);
  const itens = NAV.filter((n) => typeof n === "string" || pode(n));
  // Grupo sem itens visíveis não aparece.
  const visiveis = itens.filter((n, i) => typeof n !== "string" || (itens[i + 1] && typeof itens[i + 1] !== "string"));
  const titulo = TITULO.find(([r]) => r.test(path))?.[1] ?? "";
  const on = (h: string) => (h === "/painel" ? path === h : path === h || path.startsWith(h + "/"));

  return (
    <div className="adm" data-tema={tema}>
      <aside className="side">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/logo-viva-branco.png" alt={empresa} />
        </div>
        <nav>
          {visiveis.map((n) =>
            typeof n === "string" ? (
              <div key={n} className="grp">{n}</div>
            ) : (
              <Link key={n.href} href={n.href} className={on(n.href) ? "on" : ""}>
                <Ic n={n.ic} />
                {n.nome}
              </Link>
            ),
          )}
        </nav>
        <Link className="me-box" href="/painel/conta" title="Minha conta" style={{ textDecoration: "none" }}>
          <div className="av">{iniciais(user.nome)}</div>
          <div style={{ minWidth: 0 }}>
            <b>{user.nome}</b>
            <small>{user.perfil === "parceiro" ? `Parceiro · ${user.parceiro ?? ""}` : PERFIL_NOME[user.perfil]}</small>
          </div>
        </Link>
      </aside>
      <div className="main">
        <div className="topbar">
          <Link href="/painel" className="top-logo" aria-label={empresa}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-viva-branco.png" alt="" />
          </Link>
          <div className="top-titulo">
            <div className="crumb">{empresa} · Gestão de eletropostos</div>
            <h1>{titulo}</h1>
          </div>
          <div className="acts">
            <button type="button" className="icon-btn keep" onClick={alternarTema} title={tema === "escuro" ? "Modo claro" : "Modo escuro"} aria-label={tema === "escuro" ? "Modo claro" : "Modo escuro"}><Ic n={tema === "escuro" ? "sun" : "moon"} /></button>
            <Sino vapid={vapid} />
            <BotaoSair acao={sair} className="icon-btn keep" title="Sair"><Ic n="logout" /></BotaoSair>
          </div>
        </div>
        <div className="mob-nav">
          {visiveis.filter((n): n is Item => typeof n !== "string").map((n) => (
            <Link key={n.href} href={n.href} className={on(n.href) ? "on" : ""}>
              <Ic n={n.ic} />
              {n.nome}
            </Link>
          ))}
        </div>
        <h1 className="mob-titulo">{titulo}</h1>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
