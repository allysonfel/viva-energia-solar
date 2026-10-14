"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type * as L from "leaflet";
import { Badge } from "@/components/Badge";
import { Ic } from "@/components/Ic";
import { brl, kw } from "@/lib/format";
import type { EstacaoApp } from "@/lib/app";

type Filtro = "todos" | "livres" | "rapido" | string;

const BOLT = '<svg class="i" viewBox="0 0 24 24"><path d="M13 3 5 14h6l-1 7 8-11h-6l1-7z"/></svg>';

function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
type ComCoord = EstacaoApp & { lat: number; lng: number };
const comCoord = (e: EstacaoApp): e is ComCoord => e.lat !== null && e.lng !== null;
const distTxt = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);

export function MapaApp({ inicial, tiles, atribuicao, meusConectores }: { inicial: EstacaoApp[]; tiles: string; atribuicao: string; meusConectores: string[] }) {
  const [estacoes, setEstacoes] = useState(inicial);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [eu, setEu] = useState<{ lat: number; lng: number } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  const lib = useRef<typeof L | null>(null);
  const linha = useRef<HTMLDivElement>(null);

  // Lista ao vivo a cada 15 s.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/app/estacoes", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setEstacoes(d.estacoes))
        .catch(() => {});
    }, 15_000);
    return () => clearInterval(t);
  }, []);

  // Localização (opcional): ordena por distância e mostra o ponto azul.
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setEu({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 },
    );
  }, []);

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const n = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return estacoes
      .filter(comCoord)
      .filter((e) => !b || n(`${e.nome} ${e.bairro} ${e.cidade}`).includes(b))
      .filter((e) =>
        filtro === "todos" ? true
        : filtro === "livres" ? e.conectores.some((c) => c.situacao === "disponivel")
        : filtro === "rapido" ? e.conectores.some((c) => c.potencia_w >= 40_000)
        : e.conectores.some((c) => c.tipo === filtro),
      )
      .map((e) => ({ ...e, km: eu ? distKm(eu, e) : null }))
      .sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  }, [estacoes, filtro, busca, eu]);

  // Cria o mapa uma vez.
  useEffect(() => {
    let vivo = true;
    import("leaflet").then((Lf) => {
      if (!vivo || !caixa.current || mapa.current) return;
      lib.current = Lf;
      const m = Lf.map(caixa.current, { zoomControl: false, attributionControl: true });
      m.attributionControl.setPrefix(false);
      Lf.tileLayer(tiles, { maxZoom: 19, attribution: atribuicao }).addTo(m);
      const pts = inicial.filter(comCoord).map((e) => [e.lat, e.lng] as [number, number]);
      if (pts.length) m.fitBounds(Lf.latLngBounds(pts), { padding: [60, 60], maxZoom: 15 });
      else m.setView([-7.115, -34.86], 12);
      camada.current = Lf.layerGroup().addTo(m);
      mapa.current = m;
      setEstacoes((x) => [...x]); // desenha os pinos
    });
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pinos (redesenha quando muda lista, seleção ou localização).
  useEffect(() => {
    const Lf = lib.current, g = camada.current;
    if (!Lf || !g) return;
    g.clearLayers();
    for (const e of lista) {
      const maxKw = Math.max(...e.conectores.map((c) => c.potencia_w), 0);
      const icone = Lf.divIcon({
        className: "pin-icone",
        iconSize: [0, 0],
        html: `<div class="pin ${e.situacao}${sel === e.codigo ? " sel" : ""}"><span class="bubble">${BOLT}${kw(maxKw)} kW</span><span class="stem"></span></div>`,
      });
      Lf.marker([e.lat, e.lng], { icon: icone, title: e.nome, keyboard: true })
        .on("click", () => {
          setSel(e.codigo);
          document.getElementById(`card-${e.codigo}`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
        })
        .addTo(g);
    }
    if (eu) Lf.marker([eu.lat, eu.lng], { icon: Lf.divIcon({ className: "pin-icone", iconSize: [0, 0], html: '<div class="me"></div>' }), interactive: false }).addTo(g);
  }, [lista, sel, eu]);

  const chips: [Filtro, string][] = [
    ["todos", "Todas"],
    ["livres", "Livres agora"],
    ["rapido", "Rápidas 40 kW+"],
    ...(meusConectores.length ? meusConectores : ["CCS2", "Tipo 2"]).map((c) => [c, c] as [Filtro, string]),
  ];

  return (
    <div className="map-wrap">
      <div ref={caixa} className="mapa" aria-label="Mapa das estações" />
      <div className="map-top">
        <div className="searchbar">
          <Ic n="search" />
          <input placeholder="Buscar estação ou bairro" value={busca} onChange={(e) => setBusca(e.target.value)} maxLength={60} />
        </div>
        <div className="chips">
          {chips.map(([k, t]) => (
            <button key={k} className={`chip ${filtro === k ? "on" : ""}`} onClick={() => setFiltro(k)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="near">
        {lista.length ? (
          <div className="near-row" ref={linha}>
            {lista.map((e) => (
              <Link key={e.codigo} id={`card-${e.codigo}`} className="near-card" href={`/estacao/${encodeURIComponent(e.codigo)}`}
                style={sel === e.codigo ? { outline: "2px solid var(--g600)" } : undefined}>
                <div className="between"><div className="t">{e.nome}</div><Badge s={e.situacao} /></div>
                <div className="m">{[e.km !== null ? distTxt(e.km) : null, e.bairro].filter(Boolean).join(" · ")}</div>
                <div className="r">
                  <span className="badge b-neutral mono">{brl(e.preco_kwh_centavos)}/kWh</span>
                  {e.conectores.map((c) => <span key={c.numero} className="badge b-neutral">{c.tipo} {kw(c.potencia_w)} kW</span>)}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div style={{ margin: "0 14px", background: "#fff", borderRadius: 16, padding: 18, textAlign: "center" }}>
            <b>Nenhuma estação com esse filtro</b>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Tente outro tipo de conector ou limpe a busca.</div>
          </div>
        )}
      </div>
    </div>
  );
}
