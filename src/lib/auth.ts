import crypto from "node:crypto";
import { db } from "./db";

// Autenticazione professionisti (multi-tenant). Password con scrypt (cifratura
// nativa di Node, niente dipendenze), sessioni con token casuale in cookie.

// `tenant_id` = tenant DATI su cui l'utente opera. Per un autonomo/uso personale
// coincide con `id`; per un dipendente agganciato a un'azienda è il tenant
// aziendale condiviso. `onboarding_completo` è PER-UTENTE (il fondatore configura
// l'azienda una volta, ogni dipendente fa solo il suo onboarding personale).
export type Utente = {
  id: number;
  email: string;
  nome: string | null;
  created_at: string;
  tenant_id: number;
  azienda_id: number | null;
  ruolo: string | null;
  reparto: string | null;
  onboarding_completo: number;
  preferenze: string | null;
};

const GIORNI_SESSIONE = 30 * 24 * 60 * 60 * 1000;

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(pw, salt, 64).toString("hex");
  const a = Buffer.from(calc, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function trovaUtenteByEmail(email: string): (Utente & { password_hash: string }) | undefined {
  return db()
    .prepare("SELECT * FROM utenti WHERE email = ?")
    .get(email.toLowerCase().trim()) as (Utente & { password_hash: string }) | undefined;
}

export function creaUtente(email: string, password: string, nome?: string): Utente {
  const now = new Date().toISOString();
  const emailNorm = email.toLowerCase().trim();
  const hash = hashPassword(password);
  // Tutto in transazione: se il seed fallisse, niente account "a metà" (orfano).
  const crea = db().transaction(() => {
    const r = db()
      .prepare("INSERT INTO utenti (email, password_hash, nome, created_at) VALUES (?, ?, ?, ?)")
      .run(emailNorm, hash, nome ?? null, now);
    const id = Number(r.lastInsertRowid);
    // Di default l'utente opera sul proprio tenant e deve ancora fare l'onboarding.
    // email_verificata = 0: dovrà confermare l'email col codice prima di entrare.
    db()
      .prepare("UPDATE utenti SET tenant_id = ?, onboarding_completo = 0, email_verificata = 0 WHERE id = ?")
      .run(id, id);
    // Profilo (memoria operativa) vuoto per questo tenant → fa partire la Chiamata 0.
    db()
      .prepare("INSERT INTO profili (tenant_id, onboarding_completo, updated_at) VALUES (?, 0, ?)")
      .run(id, now);
    // Avvio PULITO: nessun dato demo finto. ORION si riempie col colloquio e coi
    // dati reali — più professionale e adatto a qualsiasi settore/azienda.
    return id;
  });
  const id = crea();
  return db().prepare(`${SELECT_UTENTE} WHERE id = ?`).get(id) as Utente;
}

// Proiezione comune dell'utente, con tenant_id risolto (COALESCE) e onboarding
// per-utente normalizzato a 0 se ancora NULL.
const SELECT_UTENTE = `SELECT id, email, nome, created_at,
  COALESCE(tenant_id, id) AS tenant_id, azienda_id, ruolo, reparto,
  COALESCE(onboarding_completo, 0) AS onboarding_completo, preferenze
  FROM utenti`;

// Nel DB non vive MAI il token di sessione, solo la sua impronta SHA-256: un
// furto del database non regala sessioni valide (il token vero ce l'ha solo
// il cookie del browser). Il costo è zero: una hash per richiesta.
function improntaToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function creaSessione(utenteId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  db()
    .prepare("INSERT INTO sessioni (token, utente_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(improntaToken(token), utenteId, new Date(now).toISOString(), new Date(now + GIORNI_SESSIONE).toISOString());
  return token;
}

export function utenteDaSessione(token: string | undefined | null): Utente | null {
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.nome, u.created_at,
              COALESCE(u.tenant_id, u.id) AS tenant_id, u.azienda_id, u.ruolo, u.reparto,
              COALESCE(u.onboarding_completo, 0) AS onboarding_completo, u.preferenze,
              s.expires_at
       FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE s.token = ?`
    )
    .get(improntaToken(token)) as (Utente & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    eliminaSessione(token);
    return null;
  }
  const { expires_at: _scade, ...utente } = row;
  return utente;
}

// Igiene: via le sessioni scadute (il cron la chiama ogni giorno). Le sessioni
// legacy in chiaro (pre-impronta) non matchano più nessun cookie: si eliminano
// qui riconoscendole dalla scadenza passata o restano inerti fino ad allora.
export function eliminaSessioniScadute(): number {
  const r = db().prepare("DELETE FROM sessioni WHERE expires_at < ?").run(new Date().toISOString());
  return r.changes;
}

// ── Stato per-utente (onboarding, preferenze, aggancio azienda) ──────────────

export function setOnboardingUtente(utenteId: number, completo: boolean) {
  db().prepare("UPDATE utenti SET onboarding_completo = ? WHERE id = ?").run(completo ? 1 : 0, utenteId);
}

export function setPreferenzeUtente(utenteId: number, preferenze: string) {
  db().prepare("UPDATE utenti SET preferenze = ? WHERE id = ?").run(preferenze, utenteId);
}

export function setNomeUtente(utenteId: number, nome: string) {
  db().prepare("UPDATE utenti SET nome = ? WHERE id = ?").run(nome, utenteId);
}

// Aggancia un utente (dipendente) a un'azienda: da ora opera sul tenant aziendale
// condiviso e ha un ruolo/reparto. Non tocca la password né la sessione.
export function collegaUtenteAdAzienda(
  utenteId: number,
  opts: { tenantId: number; aziendaId: number; ruolo?: string | null; reparto?: string | null }
) {
  db()
    .prepare("UPDATE utenti SET tenant_id = ?, azienda_id = ?, ruolo = ?, reparto = ? WHERE id = ?")
    .run(opts.tenantId, opts.aziendaId, opts.ruolo ?? null, opts.reparto ?? null, utenteId);
}

export function getUtente(utenteId: number): Utente | null {
  const row = db().prepare(`${SELECT_UTENTE} WHERE id = ?`).get(utenteId) as Utente | undefined;
  return row ?? null;
}

export function eliminaSessione(token: string) {
  db().prepare("DELETE FROM sessioni WHERE token = ?").run(improntaToken(token));
}

// ── VERIFICA EMAIL + 2FA A CODICE ────────────────────────────────────────────
// Codice a 6 cifre, nel DB solo l'impronta (email come sale). Scade in 10',
// max 5 tentativi, usa-e-getta. scopo = 'signup' (conferma email) | 'login' (2FA).

const SCADENZA_CODICE_MIN = 10;
const MAX_TENTATIVI_CODICE = 5;

function improntaCodice(email: string, codice: string): string {
  return crypto.createHash("sha256").update(`${email.toLowerCase().trim()}:${codice}`).digest("hex");
}

export function creaCodiceVerifica(email: string, scopo: "signup" | "login"): string {
  const e = email.toLowerCase().trim();
  // Un solo codice valido per volta: invalida i precedenti non usati.
  db().prepare("UPDATE codici_verifica SET usato = 1 WHERE email = ? AND scopo = ? AND usato = 0").run(e, scopo);
  const codice = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const scadenza = new Date(Date.now() + SCADENZA_CODICE_MIN * 60_000).toISOString();
  db()
    .prepare("INSERT INTO codici_verifica (email, codice_hash, scopo, scadenza, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(e, improntaCodice(e, codice), scopo, scadenza, new Date().toISOString());
  return codice;
}

// Ritorna ok=true solo se il codice è giusto, non scaduto, entro i tentativi.
export function verificaCodice(email: string, codice: string, scopo: "signup" | "login"): { ok: boolean; errore?: string } {
  const e = email.toLowerCase().trim();
  const riga = db()
    .prepare("SELECT * FROM codici_verifica WHERE email = ? AND scopo = ? AND usato = 0 ORDER BY id DESC LIMIT 1")
    .get(e, scopo) as { id: number; codice_hash: string; tentativi: number; scadenza: string } | undefined;
  if (!riga) return { ok: false, errore: "Nessun codice in attesa. Richiedine uno nuovo." };
  if (new Date(riga.scadenza).getTime() < Date.now()) {
    db().prepare("UPDATE codici_verifica SET usato = 1 WHERE id = ?").run(riga.id);
    return { ok: false, errore: "Codice scaduto. Richiedine uno nuovo." };
  }
  if (riga.tentativi >= MAX_TENTATIVI_CODICE) {
    db().prepare("UPDATE codici_verifica SET usato = 1 WHERE id = ?").run(riga.id);
    return { ok: false, errore: "Troppi tentativi. Richiedi un nuovo codice." };
  }
  const atteso = Buffer.from(riga.codice_hash, "hex");
  const dato = Buffer.from(improntaCodice(e, codice), "hex");
  const giusto = atteso.length === dato.length && crypto.timingSafeEqual(atteso, dato);
  if (!giusto) {
    db().prepare("UPDATE codici_verifica SET tentativi = tentativi + 1 WHERE id = ?").run(riga.id);
    const rimasti = MAX_TENTATIVI_CODICE - (riga.tentativi + 1);
    return { ok: false, errore: rimasti > 0 ? `Codice non corretto. ${rimasti} tentativi rimasti.` : "Troppi tentativi. Richiedi un nuovo codice." };
  }
  db().prepare("UPDATE codici_verifica SET usato = 1 WHERE id = ?").run(riga.id);
  return { ok: true };
}

export function setEmailVerificata(email: string) {
  db().prepare("UPDATE utenti SET email_verificata = 1 WHERE email = ?").run(email.toLowerCase().trim());
}

export function emailVerificata(utenteId: number): boolean {
  const r = db().prepare("SELECT email_verificata FROM utenti WHERE id = ?").get(utenteId) as { email_verificata: number } | undefined;
  return r?.email_verificata === 1;
}

export function eliminaCodiciScaduti(): number {
  return db().prepare("DELETE FROM codici_verifica WHERE scadenza < ? OR usato = 1").run(new Date().toISOString()).changes;
}

// ── DISPOSITIVI FIDATI ("ricorda questo dispositivo 30 giorni") ──────────────
const GIORNI_DISPOSITIVO = 30 * 24 * 60 * 60 * 1000;

export function creaDispositivoFidato(utenteId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  db()
    .prepare("INSERT INTO dispositivi_fidati (utente_id, token_hash, scadenza, created_at) VALUES (?, ?, ?, ?)")
    .run(utenteId, improntaToken(token), new Date(Date.now() + GIORNI_DISPOSITIVO).toISOString(), new Date().toISOString());
  return token;
}

export function dispositivoFidato(utenteId: number, token: string | undefined | null): boolean {
  if (!token) return false;
  const r = db()
    .prepare("SELECT scadenza FROM dispositivi_fidati WHERE utente_id = ? AND token_hash = ?")
    .get(utenteId, improntaToken(token)) as { scadenza: string } | undefined;
  if (!r) return false;
  if (new Date(r.scadenza).getTime() < Date.now()) return false;
  return true;
}

export function tuttiITenant(): number[] {
  return (db().prepare("SELECT id FROM utenti").all() as { id: number }[]).map((u) => u.id);
}

// Primo tenant registrato. Usato dal webhook WhatsApp in Fase 1, quando il numero
// Meta è condiviso (uno solo): l'inbound viene attribuito a questo account.
// In Fase 2 (Embedded Signup) ogni tenant avrà il proprio numero → routing per phone_number_id.
export function primoTenant(): number | null {
  const r = db().prepare("SELECT id FROM utenti ORDER BY id LIMIT 1").get() as { id: number } | undefined;
  return r?.id ?? null;
}
