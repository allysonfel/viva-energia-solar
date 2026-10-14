import type { NextConfig } from "next";

function hostPublico(): string[] {
  try {
    return process.env.APP_URL ? [new URL(process.env.APP_URL).host] : [];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  poweredByHeader: false,
  // ws: cliente dos carregadores simulados; fica fora do pacote do Next.
  serverExternalPackages: ["ws"],
  // allowedOrigins: se o acesso chegar por um roteador de domínio (outro
  // projeto do Railway), libera as server actions vindas do APP_URL.
  experimental: {
    serverActions: { bodySizeLimit: "2mb", allowedOrigins: hostPublico() },
  },
  // Cabeçalhos de segurança em todas as páginas. A CSP com nonce sai do proxy.ts.
  // Câmera (QR code) e localização (mapa) só para o próprio site.
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
