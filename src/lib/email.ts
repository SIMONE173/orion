import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { db } from "./db";
import { tenantIdCorrente } from "./tenant";
import { cifra, decifra } from "./crypto";

// ──────────────────────────────────────────────────────────────────────────
// Email per tenant via IMAP (lettura) + SMTP (invio), con APP-PASSWORD.
// GATED: senza una riga in email_accounts tutte le funzioni degradano con garbo
// (niente crash). Le credenziali stanno in chiaro in SQLite, come il token
// WhatsApp → in futuro cifratura a riposo. Self-service: niente OAuth/verifica.
// ──────────────────────────────────────────────────────────────────────────

export type EmailAccount = {
  tenant_id: number;
  email: string | null;
  password: string | null;
  imap_host: string | null;
  imap_port: number | null;
  smtp_host: string | null;
  smtp_port: number | null;
  from_name: string | null;
  stato: string;
  created_at: string;
  updated_at: string;
};

export type EmailMessaggio = {
  uid: number;
  da: string;
  oggetto: string;
  data: string | null;
  letto: boolean;
  anteprima: string;
};

const T = () => tenantIdCorrente();

// Preset automatici dei server dal dominio dell'indirizzo (l'utente di solito
// non conosce host/porte). Per domini ignoti si chiede di indicarli a mano.
const PRESET: Record<string, { imap_host: string; imap_port: number; smtp_host: string; smtp_port: number }> = {
  "gmail.com": { imap_host: "imap.gmail.com", imap_port: 993, smtp_host: "smtp.gmail.com", smtp_port: 465 },
  "googlemail.com": { imap_host: "imap.gmail.com", imap_port: 993, smtp_host: "smtp.gmail.com", smtp_port: 465 },
  "outlook.com": { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 },
  "hotmail.com": { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 },
  "live.com": { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 },
  "office365.com": { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 },
  "yahoo.com": { imap_host: "imap.mail.yahoo.com", imap_port: 993, smtp_host: "smtp.mail.yahoo.com", smtp_port: 465 },
  "icloud.com": { imap_host: "imap.mail.me.com", imap_port: 993, smtp_host: "smtp.mail.me.com", smtp_port: 587 },
  "libero.it": { imap_host: "imapmail.libero.it", imap_port: 993, smtp_host: "smtp.libero.it", smtp_port: 465 },
  "aruba.it": { imap_host: "imaps.aruba.it", imap_port: 993, smtp_host: "smtps.aruba.it", smtp_port: 465 },
  "pec.it": { imap_host: "imaps.aruba.it", imap_port: 993, smtp_host: "smtps.aruba.it", smtp_port: 465 },
};

export function presetPerEmail(email: string): { imap_host: string; imap_port: number; smtp_host: string; smtp_port: number } | null {
  const dominio = email.split("@")[1]?.toLowerCase();
  return dominio ? PRESET[dominio] ?? null : null;
}

// ── Persistenza account (gated) ──────────────────────────────────────────────

export function getEmailAccount(): EmailAccount | undefined {
  return db().prepare("SELECT * FROM email_accounts WHERE tenant_id = ?").get(T()) as EmailAccount | undefined;
}

export function emailConfigurato(): boolean {
  const a = getEmailAccount();
  return !!(a && a.email && a.password && a.imap_host && a.smtp_host);
}

export function salvaEmailAccount(a: {
  email: string;
  password: string;
  imap_host?: string;
  imap_port?: number;
  smtp_host?: string;
  smtp_port?: number;
  from_name?: string;
}): EmailAccount {
  const now = new Date().toISOString();
  const p = presetPerEmail(a.email);
  const imap_host = a.imap_host || p?.imap_host || null;
  const imap_port = a.imap_port || p?.imap_port || 993;
  const smtp_host = a.smtp_host || p?.smtp_host || null;
  const smtp_port = a.smtp_port || p?.smtp_port || 465;
  db()
    .prepare(
      `INSERT INTO email_accounts (tenant_id, email, password, imap_host, imap_port, smtp_host, smtp_port, from_name, stato, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'collegato', ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET email=excluded.email, password=excluded.password,
         imap_host=excluded.imap_host, imap_port=excluded.imap_port, smtp_host=excluded.smtp_host,
         smtp_port=excluded.smtp_port, from_name=excluded.from_name, stato='collegato', updated_at=excluded.updated_at`
    )
    .run(T(), a.email, cifra(a.password), imap_host, imap_port, smtp_host, smtp_port, a.from_name ?? null, now, now);
  return getEmailAccount()!;
}

export function rimuoviEmailAccount() {
  db().prepare("DELETE FROM email_accounts WHERE tenant_id = ?").run(T());
}

// ── IMAP: lettura inbox ──────────────────────────────────────────────────────

function clientImap(a: EmailAccount): ImapFlow {
  return new ImapFlow({
    host: a.imap_host!,
    port: a.imap_port || 993,
    secure: (a.imap_port || 993) === 993,
    // decifra: gestisce sia i valori cifrati (DB) sia quelli in chiaro (candidato
    // dal collegamento, o legacy) → restituiti così come sono.
    auth: { user: a.email!, pass: decifra(a.password)! },
    logger: false,
  });
}

// Verifica che le credenziali funzionino (connessione IMAP). Per il collegamento.
export async function verificaConnessione(a: EmailAccount): Promise<{ ok: boolean; errore?: string }> {
  const client = clientImap(a);
  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (e) {
    try {
      await client.close();
    } catch {
      /* noop */
    }
    return { ok: false, errore: e instanceof Error ? e.message : String(e) };
  }
}

export async function leggiInbox(n = 15): Promise<{ ok: boolean; messaggi: EmailMessaggio[]; errore?: string }> {
  const a = getEmailAccount();
  if (!a || !emailConfigurato()) return { ok: false, messaggi: [], errore: "non_configurato" };
  const client = clientImap(a);
  const messaggi: EmailMessaggio[] = [];
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen("INBOX");
    const totale = mailbox.exists;
    if (totale > 0) {
      const da = Math.max(1, totale - n + 1);
      for await (const msg of client.fetch(`${da}:*`, { envelope: true, flags: true })) {
        const from = msg.envelope?.from?.[0];
        messaggi.push({
          uid: msg.uid,
          da: from ? `${from.name || ""} <${from.address || ""}>`.trim() : "—",
          oggetto: msg.envelope?.subject || "(senza oggetto)",
          data: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
          letto: msg.flags?.has("\\Seen") ?? false,
          anteprima: "",
        });
      }
    }
    await client.logout();
    messaggi.reverse(); // più recenti in cima
    return { ok: true, messaggi };
  } catch (e) {
    try {
      await client.close();
    } catch {
      /* noop */
    }
    return { ok: false, messaggi: [], errore: e instanceof Error ? e.message : String(e) };
  }
}

// ── IMAP: i NUOVI arrivi (con corpo) per la posta che si annuncia da sola ────

export type EmailNuova = {
  uid: number;
  daNome: string;
  daIndirizzo: string;
  oggetto: string;
  data: string | null;
  corpo: string;
  bulk: boolean; // segnali da lista/marketing (List-Unsubscribe, Precedence: bulk…)
};

// Trova la parte di testo del messaggio (text/plain, poi text/html).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function trovaParteTesto(nodo: any): { part: string; html: boolean } | null {
  if (!nodo) return null;
  if (!nodo.childNodes || nodo.childNodes.length === 0) {
    const tipo = String(nodo.type || "").toLowerCase();
    if (tipo === "text/plain") return { part: nodo.part ?? "1", html: false };
    if (tipo === "text/html") return { part: nodo.part ?? "1", html: true };
    return null;
  }
  let html: { part: string; html: boolean } | null = null;
  for (const figlio of nodo.childNodes) {
    const r = trovaParteTesto(figlio);
    if (r && !r.html) return r;
    if (r && !html) html = r;
  }
  return html;
}

function spogliaHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Legge i messaggi con uid > dopoUid (i NUOVI), corpo incluso (max ~6KB l'uno).
export async function leggiMessaggiDopoUid(
  dopoUid: number,
  max = 10
): Promise<{ ok: boolean; uidvalidity?: string; uidProssimo?: number; messaggi: EmailNuova[]; errore?: string }> {
  const a = getEmailAccount();
  if (!a || !emailConfigurato()) return { ok: false, messaggi: [], errore: "non_configurato" };
  const client = clientImap(a);
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen("INBOX");
    const uidvalidity = String(mailbox.uidValidity ?? "");
    const uidProssimo = Number(mailbox.uidNext ?? 1);
    const grezzi: (EmailNuova & { part?: string; html?: boolean })[] = [];
    if (uidProssimo - 1 > dopoUid) {
      for await (const msg of client.fetch(
        { uid: `${dopoUid + 1}:*` },
        { uid: true, envelope: true, bodyStructure: true, headers: ["list-unsubscribe", "precedence", "auto-submitted", "x-mailer"] }
      )) {
        if (msg.uid <= dopoUid) continue; // alcuni server tornano comunque l'ultimo
        const from = msg.envelope?.from?.[0];
        const intestazioni = (msg.headers ?? Buffer.alloc(0)).toString().toLowerCase();
        const parte = trovaParteTesto(msg.bodyStructure);
        grezzi.push({
          uid: msg.uid,
          daNome: from?.name || "",
          daIndirizzo: (from?.address || "").toLowerCase(),
          oggetto: msg.envelope?.subject || "(senza oggetto)",
          data: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
          corpo: "",
          bulk: /list-unsubscribe|precedence:\s*(bulk|list)|auto-submitted:\s*auto/.test(intestazioni),
          part: parte?.part,
          html: parte?.html,
        });
      }
    }
    // I corpi si scaricano FUORI dal ciclo di fetch (un comando alla volta).
    const scelti = grezzi.slice(-max);
    for (const m of scelti) {
      if (!m.part) continue;
      try {
        const dl = await client.download(String(m.uid), m.part, { uid: true });
        const pezzi: Buffer[] = [];
        let tot = 0;
        for await (const chunk of dl.content) {
          pezzi.push(chunk as Buffer);
          tot += (chunk as Buffer).length;
          if (tot > 60_000) break;
        }
        let testo = Buffer.concat(pezzi).toString("utf8");
        if (m.html) testo = spogliaHtml(testo);
        m.corpo = testo.trim().slice(0, 6000);
      } catch {
        /* corpo non scaricabile: resta l'oggetto */
      }
    }
    await client.logout();
    return {
      ok: true,
      uidvalidity,
      uidProssimo,
      messaggi: scelti.map(({ part: _p, html: _h, ...m }) => m),
    };
  } catch (e) {
    try {
      await client.close();
    } catch {
      /* noop */
    }
    return { ok: false, messaggi: [], errore: e instanceof Error ? e.message : String(e) };
  }
}

// ── SMTP: invio ──────────────────────────────────────────────────────────────

export async function inviaEmail(to: string, subject: string, corpo: string): Promise<{ ok: boolean; errore?: string }> {
  const a = getEmailAccount();
  if (!a || !emailConfigurato()) return { ok: false, errore: "non_configurato" };
  try {
    const transporter = nodemailer.createTransport({
      host: a.smtp_host!,
      port: a.smtp_port || 465,
      secure: (a.smtp_port || 465) === 465,
      auth: { user: a.email!, pass: decifra(a.password)! },
    });
    await transporter.sendMail({
      from: a.from_name ? `${a.from_name} <${a.email}>` : a.email!,
      to,
      subject,
      text: corpo,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) };
  }
}
