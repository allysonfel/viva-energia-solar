"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { Ic } from "@/components/Ic";

// Entende o que o QR traz: o endereço /e/<código>/<conector> ou só o código.
function destino(texto: string): string | null {
  const t = texto.trim();
  const m = t.match(/\/e\/([A-Za-z0-9._-]{3,40})(?:\/(\d{1,2}))?/);
  if (m) return `/estacao/${encodeURIComponent(m[1].toUpperCase())}${m[2] ? `?c=${m[2]}` : ""}`;
  if (/^[A-Za-z0-9._-]{3,40}$/.test(t)) return `/estacao/${encodeURIComponent(t.toUpperCase())}`;
  return null;
}

// Câmera traseira + jsQR (funciona também no iPhone, que não tem leitor nativo no navegador).
export function Leitor() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [invalido, setInvalido] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let parado = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const ler = () => {
      if (parado) return;
      const v = video.current;
      if (v && ctx && v.readyState >= 2 && v.videoWidth) {
        const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * 480);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        const qr = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        const d = qr && destino(qr.data);
        if (d) {
          parado = true;
          navigator.vibrate?.(60);
          router.push(d);
          return;
        }
      }
      raf = requestAnimationFrame(ler);
    };
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
        raf = requestAnimationFrame(ler);
      })
      .catch(() => setErro("Não consegui abrir a câmera. Libere o acesso nas configurações do navegador ou digite o código impresso."));
    if (!navigator.mediaDevices) setErro("Este navegador não abre a câmera. Digite o código impresso no carregador.");
    return () => {
      parado = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  function digitado(e: React.FormEvent) {
    e.preventDefault();
    const d = destino(codigo);
    if (d) router.push(d);
    else setInvalido(true);
  }

  return (
    <div className="scan-view">
      <div className="between" style={{ padding: "16px 18px" }}>
        <Link className="icon-btn" href="/" style={{ background: "rgba(255,255,255,.08)", borderColor: "transparent", color: "#fff" }} aria-label="Fechar"><Ic n="close" /></Link>
        <b>Ler QR code da estação</b>
        <span style={{ width: 40 }} />
      </div>
      <div className="cam" style={{ position: "relative", overflow: "hidden" }}>
        <video ref={video} playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div className="viewfinder"><i /><i /><i /><i /><div className="laser" /></div>
      </div>
      <form className="bottom" onSubmit={digitado}>
        <b>Aponte para o QR code no carregador</b>
        <p>{erro ?? "Ele fica no painel frontal, logo abaixo da tela. Se preferir, digite o código impresso."}</p>
        <div className="code-input">
          <input placeholder="Ex.: VIVA-JPA-03" value={codigo} onChange={(e) => { setCodigo(e.target.value); setInvalido(false); }} maxLength={40} autoCapitalize="characters" />
          <button className="btn btn-volt">Ok</button>
        </div>
        {invalido && <p style={{ color: "#FFB4B8", marginTop: 8 }}>Código inválido. Use letras, números e hífen (ex.: VIVA-JPA-03).</p>}
      </form>
    </div>
  );
}
