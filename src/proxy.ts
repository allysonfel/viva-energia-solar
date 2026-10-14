// Duas funções:
// 1. Content-Security-Policy com nonce novo a cada requisição: só roda script
//    do próprio sistema (o Next aplica o nonce nos scripts dele sozinho).
// 2. Atalho de redirecionamento: sem o cookie da equipe, o painel manda para a
//    tela de entrar da equipe; sem o cookie do motorista, o app manda para a
//    tela de entrar do app. NÃO é a checagem de segurança: assinatura,
//    validade, conta ativa e perfil são conferidos em cada página, action e rota.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLICAS = ["/painel/entrar"];
// Telas do app abertas sem login. /e/... é o QR code do carregador (manda para o login guardando o destino).
const PUBLICAS_APP = ["/entrar", "/cadastro", "/recuperar", "/redefinir", "/privacidade", "/manifest.webmanifest", "/sw.js", "/icone.svg"];

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icone|robots.txt|ocpp|leaflet).*)"],
};
