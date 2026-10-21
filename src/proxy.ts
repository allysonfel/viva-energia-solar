// Três funções:
// 0. Freio de volume por IP (janela de 1 min): o geral pega tudo; login,
//    cadastro e exportações têm limite próprio, mais baixo. Passou, responde
//    429. Webhooks ficam de fora (têm assinatura e não podem perder evento).
// 1. Content-Security-Policy com nonce novo a cada requisição: só roda script
//    do próprio sistema (o Next aplica o nonce nos scripts dele sozinho).
// 2. Atalho de redirecionamento: sem o cookie da equipe, o painel manda para a
//    tela de entrar da equipe; sem o cookie do motorista, o app manda para a
//    tela de entrar do app. NÃO é a checagem de segurança: assinatura,
//    validade, conta ativa e perfil são conferidos em cada página, action e rota.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { dentroDoLimite, ipDe } from "@/lib/limiteRequisicoes";

const LIMITE_GERAL = 240;
const LIMITES: [regra: RegExp, max: number][] = [
  [/^\/recuperar$/, 10],
  [/^\/(entrar|cadastro|redefinir|painel\/entrar)$/, 20],
  [/^\/painel\/(clientes|recargas|relatorios)\/exportar/, 10],
  [/^\/painel\/clientes\/[^/]+\/dados/, 10],
  [/^\/api\/app\/meus-dados/, 5],
];

function muitas(esperarSeg: number, api: boolean) {
  const headers = { "Retry-After": String(esperarSeg) };
  return api
    ? Response.json({ erro: "Muitas requisições. Aguarde um pouco e tente de novo." }, { status: 429, headers })
    : new NextResponse("Muitas requisições. Aguarde um pouco e tente de novo.", { status: 429, headers });
}

const PUBLICAS = ["/painel/entrar"];
// Telas do app abertas sem login. /e/... é o QR code do carregador (manda para o login guardando o destino).
const PUBLICAS_APP = ["/entrar", "/cadastro", "/recuperar", "/redefinir", "/privacidade", "/reembolso", "/manifest.webmanifest", "/sw.js", "/icone.svg"];

// Imagens do mapa: o host das imagens (tiles) vem da mesma variável que o mapa usa.
function hostMapa(): string {
  try {
    const u = new URL((process.env.MAPA_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png").replace(/\{[a-z]\}/g, "a"));
    return `${u.protocol}//${u.hostname.replace(/^a\./, "*.")}`;
  } catch {
    return "";
  }
}

// style-src aceita 'unsafe-inline' porque as telas usam atributos style.
function csp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${hostMapa()}`.trim(),
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/webhooks/")) {
    const ip = ipDe(request.headers);
    const api = pathname.startsWith("/api/");
    const geral = dentroDoLimite(`g:${ip}`, LIMITE_GERAL);
    if (!geral.ok) return muitas(geral.esperarSeg, api);
    const regra = LIMITES.find(([r]) => r.test(pathname));
    if (regra) {
      const r = dentroDoLimite(`${regra[0].source}:${ip}`, regra[1]);
      if (!r.ok) return muitas(r.esperarSeg, api);
    }
  }
  const base = process.env.APP_URL || request.url;
  const doPainel = pathname === "/painel" || pathname.startsWith("/painel/") || pathname.startsWith("/api/painel/");
  if (doPainel && !PUBLICAS.includes(pathname) && !request.cookies.has("viva_equipe")) {
    if (pathname.startsWith("/api/")) return new NextResponse("sessão expirada", { status: 401 });
    return NextResponse.redirect(new URL("/painel/entrar", base));
  }
  const publicaApp = PUBLICAS_APP.includes(pathname) || pathname.startsWith("/api/saude") || pathname.startsWith("/api/webhooks/");
  if (!doPainel && !publicaApp && !request.cookies.has("viva_motorista")) {
    if (pathname.startsWith("/api/")) return new NextResponse("sessão expirada", { status: 401 });
    const destino = new URL("/entrar", base);
    if (pathname !== "/") destino.searchParams.set("voltar", pathname + request.nextUrl.search);
    return NextResponse.redirect(destino);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const politica = csp(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", politica);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", politica);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icone|logo-viva|robots.txt|ocpp|leaflet).*)"],
};
