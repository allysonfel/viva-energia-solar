import type { MetadataRoute } from "next";

// App instalável (tela de início do celular). Ícones PNG e avisos no celular entram na fase 4.
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
    icons: [{ src: "/icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
