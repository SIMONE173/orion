import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// ──────────────────────────────────────────────────────────────────────────
// Connessione singleton al database SQLite.
// Il file vive in /data/orion.db (gitignored). Cancellarlo = reset completo.
// ──────────────────────────────────────────────────────────────────────────

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;

  // In locale: ./data. In produzione (Railway/Render): DATA_DIR = disco persistente (es. /data).
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const dbPath = path.join(dir, "orion.db");
  const existed = fs.existsSync(dbPath);

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  migrate(_db);
  if (!existed) seedDemo(_db);

  return _db;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS profilo (
      id INTEGER PRIMARY KEY CHECK (id = 1),
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
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      titolo TEXT,
      contenuto TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pagamenti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      testo TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'attivita',
      scadenza TEXT,
      completato INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documenti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      titolo TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'documento',
      testo TEXT,
      immagine TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lista_attesa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      nome TEXT NOT NULL,
      motivo TEXT,
      priorita TEXT NOT NULL DEFAULT 'normale',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Migrazione idempotente: aggiunge colonne nuove a DB già esistenti.
  try {
    d.exec("ALTER TABLE comunicazioni ADD COLUMN allegato_url TEXT");
  } catch {
    /* colonna già presente */
  }
  try {
    d.exec("ALTER TABLE promemoria ADD COLUMN notificato INTEGER NOT NULL DEFAULT 0");
  } catch {
    /* colonna già presente */
  }

  // La riga profilo esiste sempre (id=1), inizialmente vuota → fa partire la Chiamata 0.
  const exists = d.prepare("SELECT 1 FROM profilo WHERE id = 1").get();
  if (!exists) {
    d.prepare(
      "INSERT INTO profilo (id, onboarding_completo, updated_at) VALUES (1, 0, ?)"
    ).run(new Date().toISOString());
  }
}

// Formatta una data locale come "YYYY-MM-DDTHH:MM" (naive, senza fuso).
function localISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

function atToday(offsetDays: number, h: number, m: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, m, 0, 0);
  return localISO(d);
}

function dateOnly(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Dati demo operativi: clienti, agenda di oggi, pagamenti, una conversazione.
// Il PROFILO resta vuoto di proposito → la prima conversazione è la Chiamata 0.
function seedDemo(d: Database.Database) {
  const now = new Date().toISOString();

  const insCliente = d.prepare(
    `INSERT INTO clienti (nome, telefono, email, note, ultima_visita, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const clienti: number[] = [];
  const seedClienti: [string, string, string, string, number][] = [
    ["Marco Rossi", "+39 333 1234567", "marco.rossi@email.it", "Preferisce appuntamenti al mattino.", -7],
    ["Giulia Bianchi", "+39 340 9876543", "giulia.bianchi@email.it", "Allergica al lattice.", -3],
    ["Luca Verdi", "+39 348 5551212", "luca.verdi@email.it", "Paga sempre in contanti.", -21],
    ["Anna Esposito", "+39 339 4443322", "anna.esposito@email.it", "Nuova cliente.", -1],
    ["Paolo Conti", "+39 366 7778899", "paolo.conti@email.it", "Da richiamare per controllo.", -45],
    ["Mario Rossi", "+39 333 7654321", "mario.rossi@email.it", "Omonimo: attenzione a non confonderlo con Marco.", -14],
  ];
  for (const [nome, tel, email, note, last] of seedClienti) {
    const r = insCliente.run(nome, tel, email, note, dateOnly(last), now);
    clienti.push(Number(r.lastInsertRowid));
  }

  const insApp = d.prepare(
    `INSERT INTO appuntamenti (cliente_id, titolo, inizio, fine, stato, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  // Agenda di oggi
  insApp.run(clienti[0], "Visita di controllo", atToday(0, 9, 0), atToday(0, 9, 30), "confermato", null, now);
  insApp.run(clienti[1], "Prima visita", atToday(0, 10, 0), atToday(0, 10, 45), "da_confermare", null, now);
  insApp.run(clienti[3], "Consulto", atToday(0, 11, 30), atToday(0, 12, 0), "da_confermare", null, now);
  insApp.run(clienti[2], "Controllo", atToday(0, 15, 0), atToday(0, 15, 30), "confermato", null, now);
  // Domani
  insApp.run(clienti[4], "Controllo periodico", atToday(1, 9, 30), atToday(1, 10, 0), "confermato", null, now);

  const insPag = d.prepare(
    `INSERT INTO pagamenti (cliente_id, importo, metodo, stato, data, descrizione, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insPag.run(clienti[0], 80, "pos", "incassato", dateOnly(-7), "Visita di controllo", now);
  insPag.run(clienti[2], 50, "contanti", "incassato", dateOnly(-21), "Controllo", now);
  insPag.run(clienti[1], 120, "bonifico", "da_incassare", dateOnly(-3), "Prima visita", now);
  insPag.run(clienti[0], 80, "pos", "incassato", dateOnly(-2), "Visita", now);
  insPag.run(clienti[4], 60, "contanti", "incassato", dateOnly(-1), "Controllo periodico", now);

  const insCom = d.prepare(
    `INSERT INTO comunicazioni (cliente_id, direzione, canale, tipo, contenuto, stato, created_at)
     VALUES (?, ?, 'whatsapp', ?, ?, ?, ?)`
  );
  insCom.run(clienti[0], "in", "testo", "Buongiorno, confermo l'appuntamento di oggi.", "ricevuto", now);
  insCom.run(clienti[1], "in", "testo", "Posso spostare la visita di domani?", "ricevuto", now);

  const insProm = d.prepare(
    `INSERT INTO promemoria (cliente_id, testo, categoria, scadenza, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  insProm.run(clienti[4], "Richiamare per controllo periodico", "richiamo", dateOnly(0), now);
  insProm.run(null, "Inviare i documenti al commercialista", "commercialista", dateOnly(3), now);
  insProm.run(null, "Ordinare materiale di consumo", "attivita", dateOnly(5), now);

  const insAttesa = d.prepare(
    `INSERT INTO lista_attesa (cliente_id, nome, motivo, priorita, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  insAttesa.run(null, "Sara Neri", "Disponibile per anticipo se si libera uno slot", "alta", now);
  insAttesa.run(null, "Davide Moretti", "In attesa di richiamo per prima visita", "normale", now);
}
