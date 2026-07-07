import crypto from "node:crypto";

// ──────────────────────────────────────────────────────────────────────────
// SICUREZZA WEBHOOK: verifica delle firme di Twilio (telefono) e Meta
// (WhatsApp). Senza queste verifiche, chiunque scopra l'URL del webhook può
// iniettare chiamate/messaggi finti (prenotazioni fantasma, conferme false).
//
// Politica: FAIL-CLOSED in produzione (firma assente o segreto non
// configurato → richiesta rifiutata), permissivo in sviluppo (simulatori e
// curl locali funzionano senza configurare nulla).
// Escape hatch esplicito e sconsigliato: ORION_WEBHOOK_INSICURI=1.
//
// Variabili:
//   TWILIO_AUTH_TOKEN  Auth Token dell'account Twilio (Console → Account Info)
//   META_APP_SECRET    App Secret dell'app Meta (già usato dall'Embedded Signup)
//   PUBLIC_URL         URL pubblico dell'app (es. https://orion.up.railway.app)
//                      — serve alla firma Twilio, che copre l'URL esatto.
//                      Senza, si ricostruisce dagli header x-forwarded-*.
// ──────────────────────────────────────────────────────────────────────────

const inProduzione = () => process.env.NODE_ENV === "production";
const bypassEsplicito = () => process.env.ORION_WEBHOOK_INSICURI === "1";

export type EsitoFirma = { ok: boolean; motivo?: string };

function timingEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// URL pubblico ESATTO della richiesta (quello configurato su Twilio), query
// inclusa. Dietro proxy (Railway & co.) host/proto arrivano da x-forwarded-*.
export function urlPubblicoRichiesta(req: {
  headers: Headers;
  nextUrl: { pathname: string; search: string; protocol: string; host: string };
}): string {
  const percorso = req.nextUrl.pathname + (req.nextUrl.search || "");
  const base = (process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (base) return base + percorso;
  const proto = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "") || "https").split(",")[0].trim();
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host).split(",")[0].trim();
  return `${proto}://${host}${percorso}`;
}

// ── TWILIO ──────────────────────────────────────────────────────────────────
// X-Twilio-Signature = base64(HMAC-SHA1(authToken, URL + k1v1k2v2…)) con i
// parametri POST ordinati alfabeticamente per chiave.
// https://www.twilio.com/docs/usage/security#validating-requests
export function verificaFirmaTwilioRaw(
  authToken: string,
  url: string,
  params: Record<string, string>,
  firma: string | null
): EsitoFirma {
  if (!firma) return { ok: false, motivo: "firma assente" };
  let payload = url;
  for (const k of Object.keys(params).sort()) payload += k + params[k];
  const attesa = crypto.createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
  return timingEq(firma, attesa) ? { ok: true } : { ok: false, motivo: "firma non valida" };
}

export function verificaFirmaTwilio(
  req: {
    headers: Headers;
    nextUrl: { pathname: string; search: string; protocol: string; host: string };
  },
  form: FormData
): EsitoFirma {
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!token) {
    if (inProduzione() && !bypassEsplicito()) {
      return { ok: false, motivo: "TWILIO_AUTH_TOKEN non configurato (in produzione i webhook non firmati vengono rifiutati)" };
    }
    return { ok: true }; // sviluppo: simulatori e curl locali
  }
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = typeof v === "string" ? v : "";
  return verificaFirmaTwilioRaw(token, urlPubblicoRichiesta(req), params, req.headers.get("x-twilio-signature"));
}

// ── META (WhatsApp Cloud API) ───────────────────────────────────────────────
// X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app_secret, corpo RAW) in hex.
// Va calcolata sul corpo grezzo: la route deve leggere req.text() e passarlo qui.
export function verificaFirmaMeta(rawBody: string, header: string | null): EsitoFirma {
  const secret = (process.env.META_APP_SECRET || "").trim();
  if (!secret) {
    if (inProduzione() && !bypassEsplicito()) {
      return { ok: false, motivo: "META_APP_SECRET non configurato (in produzione i webhook non firmati vengono rifiutati)" };
    }
    return { ok: true }; // sviluppo
  }
  if (!header || !header.startsWith("sha256=")) return { ok: false, motivo: "firma assente" };
  const attesa = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingEq(header, attesa) ? { ok: true } : { ok: false, motivo: "firma non valida" };
}

// ── Fallback tenant nei webhook ─────────────────────────────────────────────
// In sviluppo è comodo attribuire tutto al primo account; in produzione un
// numero non riconosciuto NON deve mai finire nei dati di un altro studio.
export function fallbackTenantConsentito(): boolean {
  return !inProduzione();
}
