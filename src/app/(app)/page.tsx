import { requireMotorista } from "@/lib/motorista";
import { estacoesDoMapa } from "@/lib/app";
import { MapaApp } from "./MapaApp";

// Imagens do mapa: OpenStreetMap por padrão. Em produção, trocar por um
// provedor com cota (MapTiler, Mapbox...) via MAPA_TILES e MAPA_ATRIBUICAO.
const TILES = process.env.MAPA_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATRIBUICAO = process.env.MAPA_ATRIBUICAO || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export default async function Mapa() {
  const m = await requireMotorista();
  const estacoes = await estacoesDoMapa();
  return <MapaApp inicial={estacoes} tiles={TILES} atribuicao={ATRIBUICAO} meusConectores={m.conectores} />;
}
