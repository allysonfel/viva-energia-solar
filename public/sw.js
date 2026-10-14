// Service worker do app e do painel: só recebe os avisos (push) e abre a tela
// certa ao tocar. Não guarda nada em cache: os dados vêm sempre do servidor.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const interno = (l) => (typeof l === "string" && l.startsWith("/") && !l.startsWith("//") ? l : "/");

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {}
  e.waitUntil(
    self.registration.showNotification(d.titulo || "Viva Energia", {
      body: d.texto || "",
      tag: d.tag || undefined,
      data: { link: interno(d.link) },
      icon: "/icone-192.png",
      badge: "/icone-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(interno(e.notification.data && e.notification.data.link), self.location.origin).href;
  e.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const j of janelas) {
        try {
          await j.focus();
          await j.navigate(url);
          return;
        } catch {}
      }
      await self.clients.openWindow(url);
    })(),
  );
});
