// Sobe junto com o servidor: entrega a central OCPP ao server.mjs (que recebe
// as conexões dos carregadores), liga os carregadores simulados e roda as
// rotinas: ping nas conexões a cada 30 s e aviso de estação offline a cada minuto.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const { ensureSchema } = await import("./lib/db");
  const central = await import("./lib/ocpp/central");
  const { iniciarSimuladores } = await import("./lib/ocpp/simulador");

  (globalThis as unknown as { __vivaOcpp: unknown }).__vivaOcpp = {
    autenticar: central.autenticar,
    conectar: central.conectar,
  };

  await ensureSchema().catch((err) => console.error("[rotina] banco indisponível", err instanceof Error ? err.message : err));
  // Quem estava marcado como conectado antes do reinício reconecta sozinho.
  const { sql } = await import("./lib/db");
  await sql`UPDATE estacoes SET conectada = false WHERE conectada`.catch(() => {});

  setTimeout(() => iniciarSimuladores().catch((err) => console.error("[simulador]", err instanceof Error ? err.message : err)), 3_000);
  setInterval(central.rotinaPing, 30_000).unref();
  setInterval(() => {
    central.rotinaOffline().catch((err) => console.error("[rotina] erro", err instanceof Error ? err.message : err));
  }, 60_000).unref();
}
