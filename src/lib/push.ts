import webpush from "web-push";
import { listSubscriptions, rimuoviSubscription } from "./data";

// La chiave PUBBLICA può stare nel codice (è pubblica per natura).
// La chiave PRIVATA arriva SOLO da env (segreta): su Railway → variabile VAPID_PRIVATE_KEY.
const PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BBM6DHXb9ZKfZ1O4y2CPQPVx5MAx66Ib_Km-LW-ZpPFZNUlipdhuWEal_joWyiIVfiZUi-Y_4UPBNKrj0q51nws";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:orion@orion.app";

let configurato = false;
function preparaVapid(): boolean {
  if (configurato) return true;
  if (!PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configurato = true;
  return true;
}

export function pushPublicKey(): string {
  return PUBLIC_KEY;
}

export function pushConfigurato(): boolean {
  return Boolean(PRIVATE_KEY);
}

export async function inviaPushATutti(payload: {
  titolo: string;
  corpo: string;
  url?: string;
}): Promise<{ inviati: number; configurato: boolean }> {
  if (!preparaVapid()) return { inviati: 0, configurato: false };
  const subs = listSubscriptions();
  const body = JSON.stringify({
    title: payload.titolo,
    body: payload.corpo,
    url: payload.url ?? "/",
  });

  let inviati = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        inviati++;
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        // 404/410 = iscrizione scaduta/non valida → la rimuovo.
        if (code === 404 || code === 410) rimuoviSubscription(s.endpoint);
      }
    })
  );
  return { inviati, configurato: true };
}
