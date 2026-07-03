import {
  getCalendarAccount,
  salvaSyncToken,
  appuntamentiDaSpingere,
  setGcal,
  upsertAppuntamentoDaGcal,
  listTombstones,
  rimuoviTombstone,
  logAudit,
} from "./data";
import { decifra } from "./crypto";

// ──────────────────────────────────────────────────────────────────────────
// GOOGLE CALENDAR: sync BIDIREZIONALE senza SDK (solo fetch REST).
//
// Perché è vitale: nessun professionista abbandona il proprio calendario.
// ORION deve vivere DENTRO il calendario che già usa: ciò che prenoti a voce
// (o che prenota il centralino) compare su Google; ciò che metti su Google
// compare in ORION. Il conflitto è impossibile perché gli slot si calcolano
// sugli appuntamenti ORION, che includono anche quelli tirati giù da Google.
//
// VARIABILI: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (console.cloud.google.com,
// OAuth "Web application", redirect: https://<dominio>/api/calendario/callback).
//
// MOTORE (in ordine, per tenant, dal cron ogni ~15'):
//  1. LAPIDI  : appuntamenti eliminati su ORION → DELETE dell'evento remoto.
//  2. PUSH    : appuntamenti nuovi (gcal_id NULL) → insert; modificati (dirty) → patch.
//  3. PULL    : eventi Google nuovi/cambiati (syncToken incrementale) → upsert su ORION.
// Tutto idempotente e "best effort": un errore non blocca il giro successivo.
// ──────────────────────────────────────────────────────────────────────────

const clientId = () => (process.env.GOOGLE_CLIENT_ID || "").trim();
const clientSecret = () => (process.env.GOOGLE_CLIENT_SECRET || "").trim();

export function googleConfigurato(): boolean {
  return Boolean(clientId() && clientSecret());
}

export function urlAutorizzazione(redirectUri: string, state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId());
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events openid email");
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent"); // garantisce il refresh_token
  u.searchParams.set("state", state);
  return u.toString();
}

export async function scambiaCodice(
  code: string,
  redirectUri: string
): Promise<{ refresh_token?: string; access_token?: string; email?: string; errore?: string }> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId(),
        client_secret: clientSecret(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const data = (await res.json()) as { access_token?: string; refresh_token?: string; id_token?: string; error_description?: string };
    if (!res.ok || !data.refresh_token) {
      return { errore: data.error_description ?? `scambio codice fallito (${res.status})` };
    }
    // Email dall'id_token (JWT), solo per mostrare quale account è collegato.
    let email: string | undefined;
    if (data.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(data.id_token.split(".")[1], "base64").toString("utf8")) as { email?: string };
        email = payload.email;
      } catch {
        /* facoltativo */
      }
    }
    return { refresh_token: data.refresh_token, access_token: data.access_token, email };
  } catch (e) {
    return { errore: e instanceof Error ? e.message : String(e) };
  }
}

async function accessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId(),
        client_secret: clientSecret(),
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

// ── Conversioni orarie ──────────────────────────────────────────────────────
// ORION usa "YYYY-MM-DDTHH:MM" locale (Europe/Rome); Google usa RFC3339.

const TZ = "Europe/Rome";

function localeDaRfc3339(rfc: string): string {
  const d = new Date(rfc);
  // Trucco standard: sv-SE produce "YYYY-MM-DD HH:MM" nel fuso richiesto.
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return s.replace(" ", "T");
}

type EventoGoogle = {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

const BASE = (cal: string) => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events`;

// ── Il motore di sync (da chiamare DENTRO runWithTenant) ────────────────────

export async function sincronizzaCalendario(): Promise<{ push: number; pull: number; cancellati: number } | null> {
  const acc = getCalendarAccount();
  if (!acc?.refresh_token || acc.stato !== "collegato" || !googleConfigurato()) return null;

  const refresh = decifra(acc.refresh_token);
  if (!refresh) return null;
  const token = await accessToken(refresh);
  if (!token) {
    logAudit({ canale: "cron", azione: "sync_calendario", dettaglio: "token non rinnovabile", esito: "errore" });
    return null;
  }
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const cal = acc.calendar_id || "primary";
  let push = 0;
  let pull = 0;
  let cancellati = 0;

  // 1) LAPIDI: eliminati su ORION → cancella su Google.
  for (const t of listTombstones()) {
    try {
      const res = await fetch(`${BASE(cal)}/${encodeURIComponent(t.gcal_id)}`, { method: "DELETE", headers: H });
      if (res.ok || res.status === 404 || res.status === 410) {
        rimuoviTombstone(t.id);
        cancellati++;
      }
    } catch {
      /* riproverà al giro dopo */
    }
  }

  // 2) PUSH: nuovi e modificati.
  for (const app of appuntamentiDaSpingere()) {
    const body = JSON.stringify({
      summary: app.cliente_nome ? `${app.titolo} — ${app.cliente_nome}` : app.titolo,
      description: "Creato da ORION",
      start: { dateTime: `${app.inizio}:00`, timeZone: TZ },
      end: { dateTime: `${app.fine}:00`, timeZone: TZ },
    });
    try {
      if (app.gcal_id) {
        const res = await fetch(`${BASE(cal)}/${encodeURIComponent(app.gcal_id)}`, { method: "PATCH", headers: H, body });
        if (res.ok) {
          setGcal(app.id, app.gcal_id);
          push++;
        } else if (res.status === 404 || res.status === 410) {
          // L'evento remoto non c'è più: lo ricreiamo al prossimo punto.
          const rc = await fetch(BASE(cal), { method: "POST", headers: H, body });
          if (rc.ok) {
            const j = (await rc.json()) as { id?: string };
            if (j.id) setGcal(app.id, j.id);
            push++;
          }
        }
      } else {
        const res = await fetch(BASE(cal), { method: "POST", headers: H, body });
        if (res.ok) {
          const j = (await res.json()) as { id?: string };
          if (j.id) setGcal(app.id, j.id);
          push++;
        }
      }
    } catch {
      /* best effort */
    }
  }

  // 3) PULL: eventi nuovi/cambiati da Google (sync incrementale).
  try {
    const raccogli = async (syncToken: string | null): Promise<{ eventi: EventoGoogle[]; nextSync: string | null; scaduto: boolean }> => {
      const eventi: EventoGoogle[] = [];
      let pageToken: string | null = null;
      let nextSync: string | null = null;
      do {
        const u = new URL(BASE(cal));
        if (syncToken) u.searchParams.set("syncToken", syncToken);
        else {
          // Primo giro: solo dal presente in avanti (il passato non ci serve).
          u.searchParams.set("timeMin", new Date(Date.now() - 24 * 3600_000).toISOString());
          u.searchParams.set("singleEvents", "true");
        }
        u.searchParams.set("maxResults", "100");
        if (pageToken) u.searchParams.set("pageToken", pageToken);
        const res = await fetch(u, { headers: H });
        if (res.status === 410) return { eventi: [], nextSync: null, scaduto: true }; // syncToken scaduto
        if (!res.ok) return { eventi, nextSync: null, scaduto: false };
        const j = (await res.json()) as { items?: EventoGoogle[]; nextPageToken?: string; nextSyncToken?: string };
        eventi.push(...(j.items ?? []));
        pageToken = j.nextPageToken ?? null;
        nextSync = j.nextSyncToken ?? nextSync;
      } while (pageToken);
      return { eventi, nextSync, scaduto: false };
    };

    let r = await raccogli(acc.sync_token);
    if (r.scaduto) {
      // Token scaduto: ripartiamo da zero (full sync dal presente).
      r = await raccogli(null);
    }
    for (const e of r.eventi) {
      if (!e.id) continue;
      // Gli eventi creati da ORION tornano indietro nel pull: setGcal li ha già
      // registrati, quindi l'upsert li riconosce e non fa nulla (idempotente).
      if (e.status === "cancelled") {
        if (upsertAppuntamentoDaGcal({ gcal_id: e.id, titolo: "", inizio: "", fine: "", cancellato: true }) !== "ignorato") pull++;
        continue;
      }
      const inizio = e.start?.dateTime ? localeDaRfc3339(e.start.dateTime) : null;
      const fine = e.end?.dateTime ? localeDaRfc3339(e.end.dateTime) : null;
      if (!inizio || !fine) continue; // eventi "tutto il giorno": non sono appuntamenti
      const esito = upsertAppuntamentoDaGcal({ gcal_id: e.id, titolo: e.summary || "Impegno (da Google Calendar)", inizio, fine });
      if (esito !== "ignorato") pull++;
    }
    if (r.nextSync) salvaSyncToken(r.nextSync);
  } catch (e) {
    console.error("[gcal] pull:", e instanceof Error ? e.message : e);
  }

  if (push || pull || cancellati) {
    logAudit({ canale: "cron", azione: "sync_calendario", dettaglio: `push ${push}, pull ${pull}, cancellati ${cancellati}` });
  }
  return { push, pull, cancellati };
}
