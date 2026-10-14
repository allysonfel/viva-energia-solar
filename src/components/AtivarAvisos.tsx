"use client";

import { useEffect, useState } from "react";

const chave = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

type Estado = "carregando" | "indisponivel" | "iphone" | "bloqueado" | "desligado" | "ligado";

// Liga os avisos no celular/navegador deste aparelho. No iPhone, só funciona
// com o app instalado na Tela de Início (limite do iOS).
export function AtivarAvisos({ vapid, inscrever, compacto }: { vapid: string | null; inscrever: (s: PushSubscriptionJSON) => Promise<boolean>; compacto?: boolean }) {
  const [estado, setEstado] = useState<Estado>("carregando");

  useEffect(() => {
    // Navegador que não termina de registrar o service worker não trava a tela.
    const limite = setTimeout(() => setEstado((e) => (e === "carregando" ? "indisponivel" : e)), 6_000);
    (async () => {
      if (!vapid || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        const ios = /iPhone|iPad/.test(navigator.userAgent) && !(navigator as Navigator & { standalone?: boolean }).standalone;
        return setEstado(ios && vapid ? "iphone" : "indisponivel");
      }
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await inscrever(sub.toJSON()); // renova (ex.: depois de trocar a senha)
        setEstado("ligado");
      } else setEstado("desligado");
    })()
      .catch(() => setEstado("indisponivel"))
      .finally(() => clearTimeout(limite));
    return () => clearTimeout(limite);
  }, [vapid, inscrever]);

  async function ligar() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setEstado(perm === "denied" ? "bloqueado" : "desligado");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave(vapid!) }));
      setEstado((await inscrever(sub.toJSON())) ? "ligado" : "indisponivel");
    } catch {
      setEstado("indisponivel");
    }
  }

  async function desligar() {
    const reg = await navigator.serviceWorker.getRegistration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
    setEstado("desligado");
  }

  const texto: Record<Estado, string> = {
    carregando: "Verificando...",
    indisponivel: "Este navegador não recebe avisos.",
    iphone: "No iPhone: toque em Compartilhar > Adicionar à Tela de Início e abra pelo ícone para ligar os avisos.",
    bloqueado: "Avisos bloqueados nas configurações do navegador.",
    desligado: "Receba um aviso quando algo importante acontecer.",
    ligado: "Avisos ligados neste aparelho.",
  };
  return (
    <div className={compacto ? "" : "set-row"} style={compacto ? { padding: "10px 0" } : undefined}>
      <div><b>Avisos no celular</b><small>{texto[estado]}</small></div>
      {estado === "desligado" && <button type="button" className="btn btn-dark btn-sm" onClick={ligar}>Ativar</button>}
      {estado === "ligado" && <button type="button" className="btn btn-ghost btn-sm" onClick={desligar}>Desligar</button>}
    </div>
  );
}

// Antes de sair, o aparelho cancela a própria inscrição (o servidor apaga a
// inscrição na próxima tentativa de envio, quando o serviço responder 410).
export async function cancelarPushDoAparelho() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {}
}
