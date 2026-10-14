import type { MetadataRoute } from "next";

// App instalável (tela de início do celular).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Viva Energia",
    short_name: "Viva Energia",
    description: "Encontre, libere e pague a recarga do seu carro elétrico.",
    start_url: "/",
    display: "standalone",
    background_color: "#062A1E",
    theme_color: "#062A1E",
    lang: "pt-BR",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-mask-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
