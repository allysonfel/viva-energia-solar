import type { Metadata, Viewport } from "next";
import { Archivo, Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex" });

export const metadata: Metadata = {
  title: "Viva Energia · Recarga de veículos elétricos",
  description: "Encontre, libere e pague a recarga nas estações da Viva Energia.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#062A1E", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${manrope.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
