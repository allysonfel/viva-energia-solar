// Duas funções:
// 1. Content-Security-Policy com nonce novo a cada requisição: só roda script
//    do próprio sistema (o Next aplica o nonce nos scripts dele sozinho).
// 2. Atalho de redirecionamento: sem o cookie da equipe, o painel manda para a
//    tela de entrar. NÃO é a checagem de segurança: assinatura, validade,
//    usuário ativo e perfil são conferidos em cada página, action e rota.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLICAS = ["/painel/entrar"];

// style-src aceita 'unsafe-inline' porque as telas usam atributos style.
function csp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
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
  const doPainel = pathname === "/painel" || pathname.startsWith("/painel/") || pathname.startsWith("/api/painel/");
  if (doPainel && !PUBLICAS.includes(pathname) && !request.cookies.has("viva_equipe")) {
    if (pathname.startsWith("/api/")) return new NextResponse("sessão expirada", { status: 401 });
    return NextResponse.redirect(new URL("/painel/entrar", process.env.APP_URL || request.url));
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icone|robots.txt|ocpp).*)"],
};
