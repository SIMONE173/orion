import nodemailer from "nodemailer";

// ──────────────────────────────────────────────────────────────────────────
// INVIO EMAIL DI SISTEMA (codici di verifica / 2FA). Transazionali, dal
// dominio di ORION — diverse dalle email dei CLIENTI (src/lib/email.ts, che
// usano l'account IMAP/SMTP collegato dal professionista).
//
// Config via env (SMTP: Resend, Postmark, Gmail app-password…):
//   MAIL_HOST, MAIL_PORT (587), MAIL_USER, MAIL_PASS,
//   MAIL_FROM ("ORION <no-reply@orionvision.it>"), MAIL_SECURE ("1" per 465).
//
// Se non configurato: DEGRADO utile in sviluppo — il codice NON viene spedito
// ma restituito al chiamante (che lo mostra solo fuori produzione) e scritto
// nei log, così il flusso è collaudabile senza un vero server email.
// ──────────────────────────────────────────────────────────────────────────

export function mailerConfigurato(): boolean {
  return Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS);
}

const MITTENTE = process.env.MAIL_FROM || "ORION <no-reply@orionvision.it>";

let _tx: nodemailer.Transporter | null = null;
function transport(): nodemailer.Transporter | null {
  if (!mailerConfigurato()) return null;
  if (_tx) return _tx;
  _tx = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: process.env.MAIL_SECURE === "1",
    auth: { user: process.env.MAIL_USER!, pass: process.env.MAIL_PASS! },
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

// Invia il codice. Ritorna { inviata, codiceDev? }: codiceDev è valorizzato solo
// quando il mailer NON è configurato e non siamo in produzione (per i test).
export async function inviaCodice(
  email: string,
  codice: string,
  scopo: "signup" | "login"
): Promise<{ inviata: boolean; codiceDev?: string }> {
  const tx = transport();
  if (!tx) {
    console.warn(`[mailer] NON configurato: codice ${scopo} per ${email} = ${codice} (non spedito)`);
    return { inviata: false, ...(process.env.NODE_ENV !== "production" ? { codiceDev: codice } : {}) };
  }
  const { testo, html, oggetto } = corpoCodice(codice, scopo);
  try {
    await tx.sendMail({ from: MITTENTE, to: email, subject: oggetto, text: testo, html });
    return { inviata: true };
  } catch (e) {
    console.error("[mailer] invio fallito:", e instanceof Error ? e.message : e);
    return { inviata: false };
  }
}
