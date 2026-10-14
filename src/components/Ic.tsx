// Ícones do protótipo aprovado (traço de 1,8 px, 24x24). Conteúdo fixo do
// código, nunca dado de usuário: por isso o innerHTML é seguro aqui.
const IC: Record<string, string> = {
  map: "<path d=\"M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z\"/><path d=\"M9 4v14M15 6v14\"/>",
  wallet: "<rect x=\"3\" y=\"6\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M3 10h18M16 15h2\"/><path d=\"M6 6V5a1 1 0 0 1 1-1h10\"/>",
  qr: "<rect x=\"4\" y=\"4\" width=\"6\" height=\"6\"/><rect x=\"14\" y=\"4\" width=\"6\" height=\"6\"/><rect x=\"4\" y=\"14\" width=\"6\" height=\"6\"/><path d=\"M14 14h2v2h-2zM18 18h2v2h-2zM14 18v2M18 14h2\"/>",
  bolt: "<path d=\"M13 3 5 14h6l-1 7 8-11h-6l1-7z\"/>",
  user: "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6\"/>",
  bell: "<path d=\"M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2z\"/><path d=\"M10 21h4\"/>",
  search: "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-4-4\"/>",
  back: "<path d=\"m15 5-7 7 7 7\"/>",
  close: "<path d=\"M6 6l12 12M18 6 6 18\"/>",
  grid: "<rect x=\"4\" y=\"4\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"13\" y=\"4\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"4\" y=\"13\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"13\" y=\"13\" width=\"7\" height=\"7\" rx=\"1\"/>",
  plug: "<path d=\"M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4\"/>",
  list: "<path d=\"M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01\"/>",
  clock: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
  ticket: "<path d=\"M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6z\"/><path d=\"M14 6v12\" stroke-dasharray=\"2 2.5\"/>",
  users: "<circle cx=\"9\" cy=\"8\" r=\"3.5\"/><path d=\"M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5\"/><path d=\"M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .7 3 2.5 3.5 5.5\"/>",
  chart: "<path d=\"M4 20V10M10 20V4M16 20v-7M21 20H3\"/>",
  shield: "<path d=\"M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z\"/><path d=\"m9 12 2 2 4-4\"/>",
  settings: "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z\"/>",
  power: "<path d=\"M12 3v9\"/><path d=\"M6.3 7a8 8 0 1 0 11.4 0\"/>",
  refresh: "<path d=\"M20 11a8 8 0 0 0-14.5-4.5L4 8\"/><path d=\"M4 4v4h4\"/><path d=\"M4 13a8 8 0 0 0 14.5 4.5L20 16\"/><path d=\"M20 20v-4h-4\"/>",
  play: "<path d=\"M7 4v16l13-8L7 4z\"/>",
  ban: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m5.6 5.6 12.8 12.8\"/>",
  card: "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M3 10h18M7 15h4\"/>",
  pix: "<path d=\"m12 3 9 9-9 9-9-9z\"/><path d=\"m8.5 8.5 7 7M15.5 8.5l-7 7\"/>",
  pin: "<path d=\"M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z\"/><circle cx=\"12\" cy=\"9\" r=\"2.5\"/>",
  nav: "<path d=\"m3 11 18-8-8 18-2-8-8-2z\"/>",
  help: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01\"/>",
  logout: "<path d=\"M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10\"/>",
  download: "<path d=\"M12 4v11M7 10l5 5 5-5M5 20h14\"/>",
  plus: "<path d=\"M12 5v14M5 12h14\"/>",
  check: "<path d=\"m5 12 5 5 9-10\"/>",
  car: "<path d=\"M5 16v-5l2-5h10l2 5v5M3 16h18v3H3zM7 19v1M17 19v1M5 11h14\"/>",
  sliders: "<path d=\"M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12\"/><circle cx=\"16\" cy=\"6\" r=\"2\"/><circle cx=\"10\" cy=\"12\" r=\"2\"/><circle cx=\"18\" cy=\"18\" r=\"2\"/>",
  stop: "<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"1.5\"/>",
  right: "<path d=\"m9 5 7 7-7 7\"/>",
  tag: "<path d=\"M3 12V4h8l10 10-8 8L3 12z\"/><circle cx=\"7.5\" cy=\"8.5\" r=\"1.3\"/>",
  alert: "<path d=\"M12 4 2.5 20h19L12 4z\"/><path d=\"M12 10v4M12 17h.01\"/>",
  copy: "<rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3\"/>",
  star: "<path d=\"m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z\"/>",
  leaf: "<path d=\"M5 19c0-8 5-13 15-14-1 10-6 15-14 15\"/><path d=\"M5 19 13 11\"/>",
  edit: "<path d=\"M4 20h4L19 9l-4-4L4 16v4z\"/>",
  building: "<path d=\"M4 21V5l8-2v18M12 8h8v13M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M2 21h20\"/>",
};

export type IconeNome = keyof typeof IC;

export function Ic({ n, s, className }: { n: string; s?: number; className?: string }) {
  return (
    <svg
      className={`i ${className ?? ""}`}
      viewBox="0 0 24 24"
      style={s ? { width: s, height: s } : undefined}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: IC[n] ?? "" }}
    />
  );
}
