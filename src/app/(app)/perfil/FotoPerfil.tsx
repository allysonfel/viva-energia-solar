"use client";

import { useActionState, useRef, useState } from "react";
import { Ic } from "@/components/Ic";
import { enviarFoto, removerFoto, type Resposta } from "../acoes";

// Reduz a foto no aparelho (lado maior 640 px, JPEG) antes de enviar: foto de
// celular passa de 5 MB e o envio fica lento no 4G. O servidor refaz a imagem.
async function reduzir(arq: File): Promise<Blob> {
  const bmp = await createImageBitmap(arq);
  const escala = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * escala);
  c.height = Math.round(bmp.height * escala);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error("canvas"))), "image/jpeg", 0.86));
}

export function FotoPerfil({ iniciais, fotoEm }: { iniciais: string; fotoEm: string | null }) {
  const [res, enviar, enviando] = useActionState<Resposta, FormData>(enviarFoto, null);
  const [erro, setErro] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const ocupado = enviando || preparando;

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    if (!arq.type.startsWith("image/")) return setErro("Escolha uma imagem.");
    setErro(null);
    setPreparando(true);
    try {
      const fd = new FormData();
      fd.set("foto", await reduzir(arq), "foto.jpg");
      enviar(fd);
    } catch {
      setErro("Não conseguimos abrir essa foto. Tente outra.");
    } finally {
      setPreparando(false);
    }
  }

  return (
    <div className="foto-perfil">
      <button type="button" className="avatar avatar-foto" onClick={() => entrada.current?.click()} disabled={ocupado} aria-label="Trocar foto de perfil">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {fotoEm ? <img src={`/api/app/foto?v=${encodeURIComponent(fotoEm)}`} alt="" /> : iniciais}
        <span className="avatar-cam"><Ic n={ocupado ? "clock" : "camera"} /></span>
      </button>
      <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={escolher} />
      {fotoEm && !ocupado && (
        <form action={removerFoto}><button className="link" style={{ fontSize: 12 }}>Remover foto</button></form>
      )}
      {(erro || (res && !res.ok)) && <div className="aviso erro" style={{ marginTop: 8 }}>{erro ?? res?.texto}</div>}
    </div>
  );
}
