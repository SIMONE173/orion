import { tenantIdOpzionale } from "./tenant";
import { getWhatsappAccountByTenant } from "./data";

// ──────────────────────────────────────────────────────────────────────────
// Adapter WhatsApp (Meta Cloud API).
//
// CREDENZIALI (in ordine di priorità):
//  1. Account collegato dal professionista via Embedded Signup (Fase 2):
//     token + phone_number_id salvati per-tenant in whatsapp_accounts.
//  2. Numero condiviso da variabili d'ambiente (sviluppo / numero di prova):
//     WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID.
//  3. Nessuna → modalità SIMULATA (il messaggio viene solo registrato).
//
// EMBEDDED SIGNUP (per collegare il numero del medico, "alla Jarvis"):
//  META_APP_ID       id dell'app Meta (pubblico, serve anche al client)
//  META_APP_SECRET   segreto dell'app (SOLO server: scambio code→token)
//  META_CONFIG_ID    id della configurazione Embedded Signup (dal dashboard Meta)
//  META_GRAPH_VERSION (opz.) versione Graph API, default v21.0
//
// I valori vengono "trimmati": spazi/ritorni a capo invisibili da copia-incolla
// romperebbero l'header Authorization → errore 401.
// Punto d'aggancio storico dell'invio: `logCommunication` in data.ts.
// ──────────────────────────────────────────────────────────────────────────

const VERSIONE = (process.env.META_GRAPH_VERSION || "v21.0").trim();
const API = `https://graph.facebook.com/${VERSIONE}`;

const envToken = () => (process.env.WHATSAPP_TOKEN || "").trim();
const envPhoneId = () => (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();

// Credenziali del mittente per il tenant corrente (o numero condiviso d'ambiente).
function credenziali(): { token: string; phoneId: string } | null {
  const tid = tenantIdOpzionale();
  if (tid) {
    const acc = getWhatsappAccountByTenant(tid);
    if (acc?.token && acc.phone_number_id) {
      return { token: acc.token.trim(), phoneId: acc.phone_number_id.trim() };
    }
  }
  const t = envToken();
  const p = envPhoneId();
  return t && p ? { token: t, phoneId: p } : null;
}

// Vero se esiste il numero CONDIVISO da env (usato dalla diagnostica del numero di prova).
export function whatsappConfigurato(): boolean {
  return Boolean(envToken() && envPhoneId());
}

export type EsitoInvio = { ok: boolean; simulato?: boolean; id?: string; errore?: string };

export async function inviaMessaggioWhatsApp(to: string, testo: string): Promise<EsitoInvio> {
  const cred = credenziali();
  if (!cred) return { ok: true, simulato: true };

  const numero = to.replace(/\D/g, "");
  if (!numero) return { ok: false, errore: "Numero di telefono mancante o non valido." };

  try {
    const res = await fetch(`${API}/${cred.phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cred.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: numero,
        type: "text",
        text: { body: testo },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error(`[whatsapp] invio fallito ${res.status}: ${t}`);
      return { ok: false, errore: `WhatsApp API ${res.status}: ${t.slice(0, 220)}` };
    }
    const data = await res.json();
    return { ok: true, id: data?.messages?.[0]?.id };
  } catch (e) {
    console.error("[whatsapp] invio errore:", e);
    return { ok: false, errore: e instanceof Error ? e.message : String(e) };
  }
}

// Scarica un allegato in arrivo (per id media) e lo restituisce come data URL.
export async function scaricaMediaWhatsApp(
  mediaId: string
): Promise<{ dataUrl: string; mime: string } | null> {
  const cred = credenziali();
  if (!cred) return null;
  try {
    const meta = await fetch(`${API}/${mediaId}`, {
      headers: { Authorization: `Bearer ${cred.token}` },
    });
    if (!meta.ok) return null;
    const info = (await meta.json()) as { url?: string; mime_type?: string };
    if (!info.url) return null;
    const bin = await fetch(info.url, { headers: { Authorization: `Bearer ${cred.token}` } });
    if (!bin.ok) return null;
    const buf = Buffer.from(await bin.arrayBuffer());
    const mime = info.mime_type ?? "application/octet-stream";
    return { dataUrl: `data:${mime};base64,${buf.toString("base64")}`, mime };
  } catch {
    return null;
  }
}

// Diagnostica: verifica il token CONDIVISO chiamando l'endpoint del numero (non invia nulla).
export async function diagnosiWhatsApp(): Promise<{ ok: boolean; stato: number; dettaglio: string }> {
  if (!whatsappConfigurato()) return { ok: false, stato: 0, dettaglio: "non configurato (token/phone id mancanti)" };
  try {
    const res = await fetch(`${API}/${envPhoneId()}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${envToken()}` },
    });
    const t = await res.text();
    return { ok: res.ok, stato: res.status, dettaglio: t.slice(0, 300) };
  } catch (e) {
    return { ok: false, stato: 0, dettaglio: e instanceof Error ? e.message : String(e) };
  }
}

// ── Embedded Signup ──────────────────────────────────────────────────────────

export const metaAppId = () => (process.env.META_APP_ID || "").trim();
const metaAppSecret = () => (process.env.META_APP_SECRET || "").trim();
export const metaConfigId = () => (process.env.META_CONFIG_ID || "").trim();
export const graphVersion = () => VERSIONE;

// La piattaforma è pronta a collegare numeri solo se app id, segreto e config
// id sono presenti (gli ultimi due li imposta l'amministratore dopo l'OK di Meta).
export function embeddedSignupConfigurato(): boolean {
  return Boolean(metaAppId() && metaAppSecret() && metaConfigId());
}

// Scambia il codice di autorizzazione (dal popup) con il business token.
export async function scambiaCodicePerToken(
  code: string
): Promise<{ token?: string; errore?: string }> {
  try {
    const url = new URL(`${API}/oauth/access_token`);
    url.searchParams.set("client_id", metaAppId());
    url.searchParams.set("client_secret", metaAppSecret());
    url.searchParams.set("code", code);
    const res = await fetch(url, { method: "GET" });
    const data = (await res.json()) as { access_token?: string; error?: { message?: string } };
    if (!res.ok || !data.access_token) {
      return { errore: data?.error?.message ?? `scambio token fallito (${res.status})` };
    }
    return { token: data.access_token };
  } catch (e) {
    return { errore: e instanceof Error ? e.message : String(e) };
  }
}

// Legge nome verificato e numero leggibile del telefono collegato.
export async function dettagliNumero(
  phoneNumberId: string,
  token: string
): Promise<{ display_phone_number?: string; verified_name?: string }> {
  try {
    const res = await fetch(
      `${API}/${phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return {};
    return (await res.json()) as { display_phone_number?: string; verified_name?: string };
  } catch {
    return {};
  }
}

// Iscrive la nostra app ai webhook della WABA del cliente: senza questo i
// messaggi in arrivo non ci verrebbero recapitati.
export async function sottoscriviWaba(
  wabaId: string,
  token: string
): Promise<{ ok: boolean; errore?: string }> {
  try {
    const res = await fetch(`${API}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, errore: `subscribe ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) };
  }
}

// Registra il numero sulla Cloud API (best-effort: spesso è già registrato dopo
// l'Embedded Signup). Un PIN di verifica in due passaggi è opzionale.
export async function registraNumero(
  phoneNumberId: string,
  token: string,
  pin = "000000"
): Promise<{ ok: boolean; errore?: string }> {
  try {
    const res = await fetch(`${API}/${phoneNumberId}/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, errore: `register ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) };
  }
}
