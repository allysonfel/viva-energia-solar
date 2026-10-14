import { redirect } from "next/navigation";

// Endereço do QR code colado no carregador: /e/<código>/<conector>. Leva para
// a tela da estação com o conector já escolhido (sem login, o proxy manda para
// entrar e volta para cá depois). Página (e não rota) para o redirecionamento
// funcionar também na navegação dentro do app.
export default async function Qr({ params }: { params: Promise<{ codigo: string; conector: string }> }) {
  const { codigo, conector } = await params;
  const c = decodeURIComponent(codigo).toUpperCase();
  const n = Number(conector);
  if (!/^[A-Z0-9._-]{3,40}$/.test(c)) redirect("/ler");
  redirect(`/estacao/${encodeURIComponent(c)}${Number.isInteger(n) && n >= 1 && n <= 20 ? `?c=${n}` : ""}`);
}
