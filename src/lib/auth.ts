import crypto from "node:crypto";
import { db, seedDemoPerTenant } from "./db";

// Autenticazione professionisti (multi-tenant). Password con scrypt (cifratura
// nativa di Node, niente dipendenze), sessioni con token casuale in cookie.

export type Utente = { id: number; email: string; nome: string | null; created_at: string };

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
  const r = db()
    .prepare("INSERT INTO utenti (email, password_hash, nome, created_at) VALUES (?, ?, ?, ?)")
    .run(email.toLowerCase().trim(), hashPassword(password), nome ?? null, now);
  const id = Number(r.lastInsertRowid);
  // Crea il profilo (memoria operativa) vuoto per questo tenant → fa partire la Chiamata 0.
  db()
    .prepare("INSERT INTO profili (tenant_id, onboarding_completo, updated_at) VALUES (?, 0, ?)")
    .run(id, now);
  // Dati demo iniziali (pannelli vivi da subito).
  seedDemoPerTenant(id);
  return db().prepare("SELECT id, email, nome, created_at FROM utenti WHERE id = ?").get(id) as Utente;
}

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
      `SELECT u.id, u.email, u.nome, u.created_at, s.expires_at
       FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE s.token = ?`
    )
    .get(token) as (Utente & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    eliminaSessione(token);
    return null;
  }
  return { id: row.id, email: row.email, nome: row.nome, created_at: row.created_at };
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
