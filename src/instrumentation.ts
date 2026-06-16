// Eseguito una volta all'avvio del server. Avvia lo scheduler dei promemoria
// solo nel runtime Node (non in edge, non in build).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { avviaScheduler } = await import("./lib/scheduler");
  avviaScheduler();
}
