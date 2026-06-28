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
    db()
      .prepare("UPDATE utenti SET tenant_id = ?, onboarding_completo = 0 WHERE id = ?")
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

export function creaSessione(utenteId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  db()
    .prepare("INSERT INTO sessioni (token, utente_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, utenteId, new Date(now).toISOString(), new Date(now + GIORNI_SESSIONE).toISOString());
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
    .get(token) as (Utente & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    eliminaSessione(token);
    return null;
  }
  const { expires_at: _scade, ...utente } = row;
  return utente;
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
  db().prepare("DELETE FROM sessioni WHERE token = ?").run(token);
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
