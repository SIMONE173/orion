// Eseguito una volta all'avvio del server. Avvia lo scheduler dei promemoria
// solo nel runtime Node (non in edge, non in build) e fa i CONTROLLI DI AVVIO:
// in produzione i segreti minimi devono esserci, altrimenti meglio non partire
// che partire insicuri (fail-fast).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const prod = process.env.NODE_ENV === "production";

  // 1) Cifratura a riposo: senza chiave, password email e token WhatsApp
  //    verrebbero scritti IN CHIARO nel DB. In produzione non è accettabile.
  const chiaveCifratura = process.env.ORION_ENC_KEY || process.env.VAPID_PRIVATE_KEY;
  if (prod && !chiaveCifratura && process.env.ORION_ALLOW_PLAINTEXT !== "1") {
    throw new Error(
      "[ORION] Avvio bloccato: in produzione serve ORION_ENC_KEY (o VAPID_PRIVATE_KEY) " +
        "per cifrare i segreti salvati nel database. Imposta la variabile su Railway. " +
        "Per forzare l'avvio senza cifratura (sconsigliato): ORION_ALLOW_PLAINTEXT=1."
    );
  }

  // 2) Avvisi non bloccanti: cose che in produzione dovrebbero esserci.
  const avvisi: string[] = [];
  if (prod && !process.env.TWILIO_AUTH_TOKEN) {
    avvisi.push("TWILIO_AUTH_TOKEN assente → i webhook del centralino rifiutano tutte le richieste (fail-closed). Va bene solo se il centralino non è attivo.");
  }
  if (prod && !process.env.META_APP_SECRET) {
    avvisi.push("META_APP_SECRET assente → il webhook WhatsApp rifiuta tutte le richieste (fail-closed). Va bene solo se WhatsApp non è attivo.");
  }
  if (!process.env.VAPID_PRIVATE_KEY) {
    avvisi.push("VAPID_PRIVATE_KEY assente → niente notifiche push e nessun segreto per il cron esterno.");
  }
  if (prod && !process.env.PUBLIC_URL) {
    avvisi.push("PUBLIC_URL assente → la firma Twilio si baserà sugli header x-forwarded-* (di solito ok dietro Railway; impostala se la verifica fallisce).");
  }
  for (const a of avvisi) console.warn("[ORION][avvio]", a);

  const { avviaScheduler } = await import("./lib/scheduler");
  avviaScheduler();
}
