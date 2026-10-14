// Servidor da Viva Energia: o Next (painel e app) e a central OCPP no mesmo
// processo e na mesma porta. Os carregadores conectam por WebSocket em
// /ocpp/<código-da-estação> (subprotocolo ocpp1.6, autenticação Basic).
//
// Este arquivo só faz a ponte. A lógica (autenticação da estação, mensagens,
// comandos) é TypeScript em src/lib/ocpp/, registrada pelo instrumentation.ts
// em globalThis.__vivaOcpp quando o Next sobe.
import { createServer } from "node:http";
import next from "next";
import nextEnv from "@next/env";
import { WebSocketServer } from "ws";

// Modo dev só com "--dev" (npm run dev). Sem isso é produção, mesmo que
// NODE_ENV não venha definido na hospedagem.
const dev = process.argv.includes("--dev");
if (!dev) process.env.NODE_ENV = "production";
// .env.local antes de ler a porta (o Next só carregaria dentro do prepare).
nextEnv.loadEnvConfig(process.cwd(), dev);
const port = Number(process.env.PORT || 3000);
const httpServer = createServer();
const app = next({ dev, port, httpServer });
const handle = app.getRequestHandler();

// Uma mensagem OCPP é pequena; 64 KB é folga e corta abuso.
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 64 * 1024,
  handleProtocols: (protocols) => (protocols.has("ocpp1.6") ? "ocpp1.6" : false),
});

function recusar(socket, status, texto) {
  socket.write(`HTTP/1.1 ${status} ${texto}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

await app.prepare();
// Sem isto o Next prende o próprio "upgrade" no servidor na primeira
// requisição e disputa as conexões dos carregadores com a central. Aqui o
// "upgrade" é um só: /ocpp vai para a central; o resto (recarga ao vivo do
// modo dev) vai para o tratador interno do Next, o mesmo que ele mesmo
// registraria (o getUpgradeHandler público não cuida do modo dev).
app.didWebSocketSetup = true;
const upgradeNext = (req, socket, head) => app.upgradeHandler(req, socket, head);

httpServer.on("request", (req, res) => handle(req, res));

httpServer.on("upgrade", async (req, socket, head) => {
  const caminho = (req.url || "").split("?")[0];
  const m = caminho.match(/^\/ocpp\/([A-Za-z0-9._-]{3,40})\/?$/);
  if (!m) return upgradeNext(req, socket, head); // recarga ao vivo do modo dev
  const ocpp = globalThis.__vivaOcpp;
  if (!ocpp) return recusar(socket, 503, "Service Unavailable");
  const protocolos = String(req.headers["sec-websocket-protocol"] || "").split(",").map((p) => p.trim());
  if (!protocolos.includes("ocpp1.6")) return recusar(socket, 400, "Bad Request");
  let ok = false;
  try {
    ok = await ocpp.autenticar(m[1], req.headers.authorization, req.socket.remoteAddress);
  } catch (err) {
    console.error("[ocpp] erro na autenticação:", err instanceof Error ? err.message : err);
  }
  if (!ok) return recusar(socket, 401, "Unauthorized");
  wss.handleUpgrade(req, socket, head, (ws) => ocpp.conectar(ws, m[1]));
});

httpServer.listen(port, () => {
  console.log(`> Viva Energia em http://localhost:${port} (${dev ? "desenvolvimento" : "produção"}); OCPP em /ocpp/<estação>`);
});
