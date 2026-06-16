// Osservazione continua lato server: ogni 15 minuti chiama l'endpoint interno
// /api/cron/run (è lì che vive web-push, tra i route handler esternalizzati).
// Questo file NON importa web-push, così non rompe il bundle di instrumentation.
let avviato = false;

export function avviaScheduler() {
  if (avviato) return;
  avviato = true;

  const INTERVALLO = 15 * 60 * 1000; // 15 minuti
  const porta = process.env.PORT || "3000";
  const segreto = process.env.VAPID_PRIVATE_KEY || "";

  const tick = async () => {
    try {
      await fetch(`http://127.0.0.1:${porta}/api/cron/run`, {
        method: "POST",
        headers: { "x-orion-cron": segreto },
      });
    } catch (e) {
      console.error("[scheduler]", e instanceof Error ? e.message : e);
    }
  };

  setTimeout(tick, 30_000); // primo giro 30s dopo l'avvio
  setInterval(tick, INTERVALLO);
  console.log("[ORION] scheduler promemoria avviato");
}
