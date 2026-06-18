import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// ──────────────────────────────────────────────────────────────────────────
// Connessione singleton al database SQLite (MULTI-TENANT).
// Ogni professionista (utente) è un tenant: tutti i dati hanno tenant_id.
// In locale: ./data/orion.db. In produzione: DATA_DIR = disco persistente.
// ──────────────────────────────────────────────────────────────────────────

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(path.join(dir, "orion.db"));
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  return _db;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS utenti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nome TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessioni (
      token TEXT PRIMARY KEY,
      utente_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profili (
      tenant_id INTEGER PRIMARY KEY,
      nome TEXT,
      professione TEXT,
      durata_visita_min INTEGER,
      gestione_cancellazioni TEXT,
      canale_comunicazione TEXT,
      problemi_tempo TEXT,
      abitudini TEXT,
      piva TEXT,
      codice_fiscale TEXT,
      indirizzo TEXT,
      regime_fiscale TEXT,
      pec TEXT,
      sdi TEXT,
      onboarding_completo INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clienti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      note TEXT,
      piva TEXT,
      codice_fiscale TEXT,
      indirizzo TEXT,
      ultima_visita TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appuntamenti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      titolo TEXT NOT NULL,
      inizio TEXT NOT NULL,
      fine TEXT NOT NULL,
      stato TEXT NOT NULL DEFAULT 'da_confermare',
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      titolo TEXT,
      contenuto TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pagamenti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      importo REAL NOT NULL,
      metodo TEXT NOT NULL,
      stato TEXT NOT NULL DEFAULT 'incassato',
      data TEXT NOT NULL,
      descrizione TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comunicazioni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      direzione TEXT NOT NULL,
      canale TEXT NOT NULL DEFAULT 'whatsapp',
      tipo TEXT NOT NULL DEFAULT 'testo',
      contenuto TEXT,
      allegato_nome TEXT,
      allegato_url TEXT,
      stato TEXT NOT NULL DEFAULT 'inviato',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fatture (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      numero TEXT NOT NULL,
      importo REAL NOT NULL,
      descrizione TEXT,
      stato TEXT NOT NULL DEFAULT 'bozza',
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS promemoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      testo TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'attivita',
      scadenza TEXT,
      completato INTEGER NOT NULL DEFAULT 0,
      notificato INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documenti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      titolo TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'documento',
      testo TEXT,
      immagine TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lista_attesa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      nome TEXT NOT NULL,
      motivo TEXT,
      priorita TEXT NOT NULL DEFAULT 'normale',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Numero WhatsApp collegato dal professionista via Embedded Signup (Fase 2).
    -- Un account per tenant. Il token è il business token Meta scoped alla sua WABA.
    CREATE TABLE IF NOT EXISTS whatsapp_accounts (
      tenant_id INTEGER PRIMARY KEY,
      waba_id TEXT,
      phone_number_id TEXT,
      display_phone_number TEXT,
      verified_name TEXT,
      token TEXT,
      stato TEXT NOT NULL DEFAULT 'collegato',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_wa_phone ON whatsapp_accounts(phone_number_id);
  `);

  // Migrazione idempotente per DB creati con lo schema precedente:
  // aggiunge le colonne nuove (ignora l'errore se già presenti).
  // IMPORTANTE: questi ALTER devono girare PRIMA di creare gli indici su
  // tenant_id — su un DB vecchio (single-tenant) la colonna non esiste ancora.
  const alters = [
    "ALTER TABLE comunicazioni ADD COLUMN allegato_url TEXT",
    "ALTER TABLE promemoria ADD COLUMN notificato INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE clienti ADD COLUMN tenant_id INTEGER",
    "ALTER TABLE appuntamenti ADD COLUMN tenant_id INTEGER",
    "ALTER TABLE note ADD COLUMN tenant_id INTEGER",
    "ALTER TABLE pagamenti ADD COLUMN tenant_id INTEGER",
    "ALTER TABLE comunicazioni ADD COLUMN tenant_id INTEGER",
    "ALTER TABLE fatture ADD COLUMN tenant_id INTEGER",
    "ALTER TABLE promemoria ADD COLUMN tenant_id INTEGER",
    "ALTER TABLE documenti ADD COLUMN tenant_id INTEGER",
    "ALTER TABLE lista_attesa ADD COLUMN tenant_id INTEGER",
    "ALTER TABLE push_subscriptions ADD COLUMN tenant_id INTEGER",
  ];
  for (const sql of alters) {
    try {
      d.exec(sql);
    } catch {
      /* colonna già presente */
    }
  }

  // Indici sulle colonne tenant_id: creati ORA, dopo che gli ALTER le hanno
  // garantite anche sui DB migrati dal vecchio schema single-tenant.
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_clienti_tenant ON clienti(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_appuntamenti_tenant ON appuntamenti(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_pagamenti_tenant ON pagamenti(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_comunicazioni_tenant ON comunicazioni(tenant_id);
  `);
}

// Formattazione date locali "YYYY-MM-DDTHH:MM".
function localISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
}
function atToday(off: number, h: number, m: number): string {
  const d = new Date();
  d.setDate(d.getDate() + off);
  d.setHours(h, m, 0, 0);
  return localISO(d);
}
function dateOnly(off: number): string {
  const d = new Date();
  d.setDate(d.getDate() + off);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Dati demo per un singolo tenant (chiamato alla creazione dell'account, così
// il professionista vede subito i pannelli "vivi" da esplorare).
export function seedDemoPerTenant(tenantId: number) {
  const d = db();
  const now = new Date().toISOString();
  const insC = d.prepare(
    `INSERT INTO clienti (tenant_id, nome, telefono, email, note, ultima_visita, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const clienti: number[] = [];
  const seed: [string, string, string, string, number][] = [
    ["Marco Rossi", "+39 333 1234567", "marco.rossi@email.it", "Preferisce il mattino.", -7],
    ["Giulia Bianchi", "+39 340 9876543", "giulia.bianchi@email.it", "Allergica al lattice.", -3],
    ["Luca Verdi", "+39 348 5551212", "luca.verdi@email.it", "Paga in contanti.", -21],
    ["Anna Esposito", "+39 339 4443322", "anna.esposito@email.it", "Nuova cliente.", -1],
    ["Paolo Conti", "+39 366 7778899", "paolo.conti@email.it", "Da richiamare.", -45],
  ];
  for (const [nome, tel, email, note, last] of seed) {
    clienti.push(Number(insC.run(tenantId, nome, tel, email, note, dateOnly(last), now).lastInsertRowid));
  }
  const insA = d.prepare(
    `INSERT INTO appuntamenti (tenant_id, cliente_id, titolo, inizio, fine, stato, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insA.run(tenantId, clienti[0], "Visita di controllo", atToday(0, 9, 0), atToday(0, 9, 30), "confermato", now);
  insA.run(tenantId, clienti[1], "Prima visita", atToday(0, 10, 0), atToday(0, 10, 45), "da_confermare", now);
  insA.run(tenantId, clienti[3], "Consulto", atToday(0, 11, 30), atToday(0, 12, 0), "da_confermare", now);
  insA.run(tenantId, clienti[2], "Controllo", atToday(0, 15, 0), atToday(0, 15, 30), "confermato", now);

  const insP = d.prepare(
    `INSERT INTO pagamenti (tenant_id, cliente_id, importo, metodo, stato, data, descrizione, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insP.run(tenantId, clienti[0], 80, "pos", "incassato", dateOnly(-7), "Visita", now);
  insP.run(tenantId, clienti[2], 50, "contanti", "incassato", dateOnly(-21), "Controllo", now);
  insP.run(tenantId, clienti[1], 120, "bonifico", "da_incassare", dateOnly(-3), "Prima visita", now);

  const insPr = d.prepare(
    `INSERT INTO promemoria (tenant_id, cliente_id, testo, categoria, scadenza, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  insPr.run(tenantId, clienti[4], "Richiamare per controllo periodico", "richiamo", dateOnly(0), now);
  insPr.run(tenantId, null, "Inviare documenti al commercialista", "commercialista", dateOnly(3), now);
}
