import nodemailer from "nodemailer";

// ──────────────────────────────────────────────────────────────────────────
// INVIO EMAIL DI SISTEMA (codici di verifica / 2FA). Transazionali, dal
// dominio di ORION — diverse dalle email dei CLIENTI (src/lib/email.ts).
//
// Due strade, in ordine di preferenza:
//  1) API HTTP di Resend (RESEND_API_KEY, o MAIL_PASS che inizia con "re_"):
//     va su HTTPS/443, mai bloccata dagli host, veloce. CONSIGLIATA.
//  2) SMTP classico (MAIL_HOST/PORT/USER/PASS) con timeout stretti, così un
//     problema di rete non blocca MAI la registrazione dell'utente.
// Se niente è configurato: in sviluppo il codice viene restituito al chiamante
// (mostrato solo fuori produzione), così il flusso è collaudabile senza email.
//
// Env: MAIL_FROM ("ORION <no-reply@orionvision.it>"); per SMTP anche
// MAIL_HOST/MAIL_PORT/MAIL_USER/MAIL_PASS/MAIL_SECURE("1" per 465).
// ──────────────────────────────────────────────────────────────────────────

const MITTENTE = process.env.MAIL_FROM || "ORION <no-reply@orionvision.it>";
const TIMEOUT_MS = 10_000;

function chiaveResend(): string | null {
  const k = (process.env.RESEND_API_KEY || process.env.MAIL_PASS || "").trim();
  return k.startsWith("re_") ? k : null;
}
function smtpConfigurato(): boolean {
  return Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS);
}
export function mailerConfigurato(): boolean {
  return Boolean(chiaveResend()) || smtpConfigurato();
}

let _tx: nodemailer.Transporter | null = null;
function transport(): nodemailer.Transporter | null {
  if (!smtpConfigurato()) return null;
  if (_tx) return _tx;
  _tx = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: process.env.MAIL_SECURE === "1",
    auth: { user: process.env.MAIL_USER!, pass: process.env.MAIL_PASS! },
    // Timeout stretti: se l'SMTP non risponde, si fallisce in fretta (mai un
    // hang che blocca la registrazione).
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  return _tx;
}

function corpoCodice(codice: string, scopo: "signup" | "login"): { testo: string; html: string; oggetto: string } {
  const titolo = scopo === "signup" ? "Conferma la tua email" : "Il tuo codice di accesso";
  const intro =
    scopo === "signup"
      ? "Benvenuto in ORION. Per completare la registrazione inserisci questo codice:"
      : "Per accedere al tuo ORION inserisci questo codice:";
  const testo = `${intro}\n\n   ${codice}\n\nIl codice scade tra 10 minuti. Se non hai richiesto tu questo accesso, ignora questa email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#05070d;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:460px;margin:0 auto;padding:40px 28px;color:#e6edf6">
    <div style="letter-spacing:.35em;font-weight:700;color:#38e8ff;font-size:15px">ORION</div>
    <h1 style="font-size:20px;margin:22px 0 8px">${titolo}</h1>
    <p style="color:#9fb3c2;font-size:14px;line-height:1.5;margin:0 0 22px">${intro}</p>
    <div style="font-size:34px;font-weight:700;letter-spacing:.32em;color:#fff;background:rgba(56,232,255,.08);border:1px solid rgba(56,232,255,.25);border-radius:14px;padding:18px;text-align:center">${codice}</div>
    <p style="color:#64788a;font-size:12px;line-height:1.5;margin:22px 0 0">Il codice scade tra 10 minuti. Se non hai richiesto tu questo accesso, ignora questa email — il tuo account resta al sicuro.</p>
  </div></body></html>`;
  return { testo, html, oggetto: `${codice} — ${titolo} · ORION` };
}

async function inviaViaResend(key: string, email: string, oggetto: string, testo: string, html: string): Promise<boolean> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MITTENTE, to: [email], subject: oggetto, text: testo, html }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.ok) return true;
    const dettaglio = await r.text().catch(() => "");
    console.error(`[mailer] Resend API ${r.status}: ${dettaglio.slice(0, 300)}`);
    return false;
  } catch (e) {
    console.error("[mailer] Resend API errore:", e instanceof Error ? e.message : e);
    return false;
  }
}

// Invio generico di un'email di sistema (usato anche dalle transazionali di
// email-orion.ts). Non lancia mai: torna false e logga, così un problema di
// posta non rompe MAI il flusso che l'ha richiesta.
export async function inviaEmail(email: string, oggetto: string, testo: string, html: string): Promise<boolean> {
  const key = chiaveResend();
  if (key) return inviaViaResend(key, email, oggetto, testo, html);

  const tx = transport();
  if (tx) {
    try {
      await tx.sendMail({ from: MITTENTE, to: email, subject: oggetto, text: testo, html });
      return true;
    } catch (e) {
      console.error("[mailer] SMTP invio fallito:", e instanceof Error ? e.message : e);
      return false;
    }
  }

  console.warn(`[mailer] NON configurato: "${oggetto}" per ${email} non spedita`);
  return false;
}

// Invia il codice. Ritorna { inviata, codiceDev? }: codiceDev è valorizzato solo
// quando NON c'è mailer e non siamo in produzione (per i test).
export async function inviaCodice(
  email: string,
  codice: string,
  scopo: "signup" | "login"
): Promise<{ inviata: boolean; codiceDev?: string }> {
  const { testo, html, oggetto } = corpoCodice(codice, scopo);
  const inviata = await inviaEmail(email, oggetto, testo, html);
  if (!inviata && !mailerConfigurato()) {
    console.warn(`[mailer] codice ${scopo} per ${email} = ${codice} (non spedito)`);
    return { inviata: false, ...(process.env.NODE_ENV !== "production" ? { codiceDev: codice } : {}) };
  }
  return { inviata };
}
