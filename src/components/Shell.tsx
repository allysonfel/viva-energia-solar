"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ic } from "./Ic";
import { Sino } from "./Sino";

type Perfil = "admin" | "operador" | "parceiro";
type Item = { href: string; nome: string; ic: string; perfis?: Perfil[] };

const NAV: (Item | string)[] = [
  { href: "/painel", nome: "Visão geral", ic: "grid" },
  { href: "/painel/estacoes", nome: "Estações", ic: "plug" },
  { href: "/painel/recargas", nome: "Recargas", ic: "list" },
  "Gestão",
  { href: "/painel/equipe", nome: "Equipe", ic: "shield", perfis: ["admin"] },
  { href: "/painel/simulador", nome: "Simulador", ic: "sliders", perfis: ["admin", "operador"] },
  { href: "/painel/configuracoes", nome: "Configurações", ic: "settings", perfis: ["admin"] },
];

const TITULO: [RegExp, string][] = [
  [/^\/painel$/, "Visão geral"],
  [/^\/painel\/estacoes\/nova/, "Nova estação"],
  [/^\/painel\/estacoes\/.+/, "Estação"],
  [/^\/painel\/estacoes/, "Estações"],
  [/^\/painel\/recargas/, "Recargas"],
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
}: {
  children: React.ReactNode;
  user: { nome: string; perfil: Perfil; parceiro: string | null };
  empresa: string;
  simulador: boolean;
  sair: () => Promise<void>;
}) {
  const path = usePathname();
  const pode = (n: Item) => (!n.perfis || n.perfis.includes(user.perfil)) && (n.href !== "/painel/simulador" || simulador);
  const itens = NAV.filter((n) => typeof n === "string" || pode(n));
  // Grupo sem itens visíveis não aparece.
  const visiveis = itens.filter((n, i) => typeof n !== "string" || (itens[i + 1] && typeof itens[i + 1] !== "string"));
  const titulo = TITULO.find(([r]) => r.test(path))?.[1] ?? "";
  const on = (h: string) => (h === "/painel" ? path === h : path === h || path.startsWith(h + "/"));

  return (
    <div className="adm">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark"><Ic n="bolt" /></span>
          {empresa}
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
      <div className="mob-nav">
        {visiveis.filter((n): n is Item => typeof n !== "string").map((n) => (
          <Link key={n.href} href={n.href} className={on(n.href) ? "on" : ""}>
            <Ic n={n.ic} />
            {n.nome}
          </Link>
        ))}
      </div>
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">{empresa} · Gestão de eletropostos</div>
            <h1>{titulo}</h1>
          </div>
          <div className="acts">
            <Sino />
            <form action={sair}>
              <button className="icon-btn keep" title="Sair" aria-label="Sair"><Ic n="logout" /></button>
            </form>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
