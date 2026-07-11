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

    -- Abbonamento del professionista (Stripe, Fase 3). Un record per tenant.
    -- stato: 'prova' | 'attivo' | 'scaduto' | 'annullato'. La prova si calcola
    -- comunque da utenti.created_at; qui teniamo lo stato Stripe.
    CREATE TABLE IF NOT EXISTS abbonamenti (
      tenant_id INTEGER PRIMARY KEY,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stato TEXT NOT NULL DEFAULT 'prova',
      periodo_fine TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_abb_customer ON abbonamenti(stripe_customer_id);

    -- Azienda/team (onboarding Caso B). Un'azienda è un AMBIENTE CONDIVISO: il suo
    -- tenant_id (PK) coincide con l'id dell'utente fondatore, che diventa il tenant
    -- dei dati condivisi. I dipendenti vengono "agganciati" a questo stesso tenant
    -- (utenti.tenant_id) inserendo il codice_aziendale → vedono clienti/agenda/memoria
    -- in comune. memoria_operativa è un JSON libero (organigramma, processi, regole…).
    CREATE TABLE IF NOT EXISTS aziende (
      tenant_id INTEGER PRIMARY KEY,
      nome TEXT,
      settore TEXT,
      dimensioni TEXT,
      sedi TEXT,
      codice_aziendale TEXT UNIQUE,
      memoria_operativa TEXT,
      piva TEXT,
      codice_fiscale TEXT,
      indirizzo TEXT,
      regime_fiscale TEXT,
      pec TEXT,
      sdi TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_aziende_codice ON aziende(codice_aziendale);

    -- ── MEMORIA DI CONTESTO VIVENTE ─────────────────────────────────────────
    -- Livello 1: memoria VIVA. Intuizioni che evolvono nel tempo, con il PERCHÉ,
    -- la confidenza e il rinforzo (più volte osservata → più certa). soggetto è
    -- libero (es. "paziente Rossi") o NULL=generale. stato='superato' = evoluta.
    CREATE TABLE IF NOT EXISTS memoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'contesto',
      soggetto TEXT,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      contenuto TEXT NOT NULL,
      motivo TEXT,
      confidenza TEXT NOT NULL DEFAULT 'medio',
      evidenze INTEGER NOT NULL DEFAULT 1,
      stato TEXT NOT NULL DEFAULT 'attivo',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      ultima_conferma TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_memoria_tenant ON memoria(tenant_id, stato);
    CREATE INDEX IF NOT EXISTS idx_memoria_cliente ON memoria(tenant_id, cliente_id);

    -- Livello 2a: registro EVENTI (azioni/cambiamenti significativi) → "cosa è
    -- successo ieri / cosa è cambiato". Puro DB, niente costo AI.
    CREATE TABLE IF NOT EXISTS eventi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      soggetto TEXT,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      descrizione TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_eventi_tenant ON eventi(tenant_id, created_at);

    -- Livello 2b: DIARIO (sintesi di sessione/giornata) → "dove eravamo rimasti".
    CREATE TABLE IF NOT EXISTS diario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      riassunto TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_diario_tenant ON diario(tenant_id, created_at);

    -- Livello 2c: conversazione INTEGRALE persistita (scelta utente) → continuità
    -- al reload + richiamo esatto di dettagli vecchi. Il contesto live resta
    -- comunque LIMITATO (finestra recente + sintesi).
    CREATE TABLE IF NOT EXISTS messaggi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      utente_id INTEGER,
      ruolo TEXT NOT NULL,
      contenuto TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messaggi_tenant ON messaggi(tenant_id, id);

    -- ── MODALITÀ AZIENDA ────────────────────────────────────────────────────
    -- Organigramma vivo: TUTTE le persone dell'azienda, anche chi NON usa ORION
    -- (es. i 12 operai di un reparto). utente_id collega opzionalmente un account.
    CREATE TABLE IF NOT EXISTS organico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      ruolo TEXT,
      reparto TEXT,
      responsabilita TEXT,
      riporta_a TEXT,
      contatti TEXT,
      note TEXT,
      utente_id INTEGER,
      attivo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_organico_tenant ON organico(tenant_id, attivo);

    -- Attività assegnate, con ciclo di vita e cadenza di aggiornamento.
    CREATE TABLE IF NOT EXISTS compiti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      titolo TEXT NOT NULL,
      descrizione TEXT,
      assegnatario TEXT,
      assegnato_da TEXT,
      reparto TEXT,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      riferimento TEXT,
      stato TEXT NOT NULL DEFAULT 'aperto',
      scadenza TEXT,
      frequenza_giorni INTEGER,
      ultimo_aggiornamento TEXT,
      notificato INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_compiti_tenant ON compiti(tenant_id, stato);

    -- Passaggio di consegne tra turni/persone.
    CREATE TABLE IF NOT EXISTS consegne (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      reparto TEXT,
      da_nome TEXT,
      completato TEXT,
      in_sospeso TEXT,
      problemi TEXT,
      suggerimenti TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_consegne_tenant ON consegne(tenant_id, created_at);

    -- Account email del tenant (IMAP/SMTP, app-password). Gated: senza riga, le
    -- funzioni email degradano con garbo. La password è in chiaro (come il token
    -- WhatsApp) → in futuro cifratura a riposo.
    CREATE TABLE IF NOT EXISTS email_accounts (
      tenant_id INTEGER PRIMARY KEY,
      email TEXT,
      password TEXT,
      imap_host TEXT,
      imap_port INTEGER,
      smtp_host TEXT,
      smtp_port INTEGER,
      from_name TEXT,
      stato TEXT NOT NULL DEFAULT 'collegato',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- ── ECOSISTEMA COGNITIVO (sistemi esterni) ──────────────────────────────
    -- Registro dei software già usati dal professionista/azienda (gestionali,
    -- CRM, ERP…). Anche solo "descritto" rende ORION competente sull'ambiente.
    -- token: segreto per il webhook di ingest (se modalita='ingest'). GATED:
    -- senza righe, ORION funziona esattamente come oggi.
    CREATE TABLE IF NOT EXISTS connessioni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'altro',
      nome TEXT NOT NULL,
      descrizione TEXT,
      regole TEXT,
      modalita TEXT NOT NULL DEFAULT 'descritto',
      apertura TEXT,
      token TEXT UNIQUE,
      autorizzato INTEGER NOT NULL DEFAULT 1,
      attivo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_connessioni_tenant ON connessioni(tenant_id, attivo);
    CREATE INDEX IF NOT EXISTS idx_connessioni_token ON connessioni(token);

    -- Modello cognitivo UNIFICATO: i record dei sistemi esterni, COLLEGATI alle
    -- entità native (clienti, organico) e fra loro (riferimento → catena).
    CREATE TABLE IF NOT EXISTS entita_esterne (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      connessione_id INTEGER REFERENCES connessioni(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL DEFAULT 'altro',
      chiave_esterna TEXT,
      titolo TEXT,
      dati TEXT,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      organico_id INTEGER REFERENCES organico(id) ON DELETE SET NULL,
      riferimento TEXT,
      aggiornato_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entita_tenant ON entita_esterne(tenant_id, connessione_id);
    CREATE INDEX IF NOT EXISTS idx_entita_cliente ON entita_esterne(tenant_id, cliente_id);
    CREATE INDEX IF NOT EXISTS idx_entita_chiave ON entita_esterne(connessione_id, chiave_esterna);

    -- Import dei dati esistenti (esportazioni CSV/Excel dei software già in uso):
    -- il file analizzato resta in staging finché ORION non esegue la mappatura
    -- (righe = JSON string[][]). Le voci vecchie vengono ripulite dopo 24 ore.
    CREATE TABLE IF NOT EXISTS import_stage (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      nome_file TEXT NOT NULL,
      colonne TEXT NOT NULL,
      righe TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_import_stage_tenant ON import_stage(tenant_id, created_at);

    -- ── CENTRALINO AI (telefono) ────────────────────────────────────────────
    -- Registro delle chiamate gestite dall'assistente telefonico. La trascrizione
    -- è il JSON dei turni (caller/orion) accumulati durante la chiamata; l'esito
    -- è la sintesi finale ("prenotato appuntamento martedì 15:00").
    CREATE TABLE IF NOT EXISTS chiamate (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      call_sid TEXT UNIQUE,
      da_numero TEXT,
      stato TEXT NOT NULL DEFAULT 'in_corso',
      esito TEXT,
      trascrizione TEXT,
      appuntamento_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chiamate_tenant ON chiamate(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chiamate_sid ON chiamate(call_sid);

    -- Numero di telefono dello studio collegato al centralino (Twilio). Il tenant
    -- si risolve dal numero chiamato (To); fallback: primo tenant (sviluppo).
    CREATE TABLE IF NOT EXISTS telefono_accounts (
      tenant_id INTEGER PRIMARY KEY,
      numero TEXT UNIQUE,
      messaggio_benvenuto TEXT,
      attivo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telefono_numero ON telefono_accounts(numero);

    -- ── AUDIT (fiducia / AI Act) ────────────────────────────────────────────
    -- Registro immutabile delle AZIONI eseguite (da ORION o in automatico):
    -- chi/cosa/quando/canale/esito. È la tracciabilità richiesta a un deployer
    -- di AI che agisce verso il pubblico (promemoria, telefono, email, fatture).
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      utente_id INTEGER,
      canale TEXT NOT NULL DEFAULT 'voce',
      azione TEXT NOT NULL,
      dettaglio TEXT,
      esito TEXT NOT NULL DEFAULT 'ok',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit(tenant_id, created_at);

    -- ── CALENDARIO ESTERNO (Google) ─────────────────────────────────────────
    -- Account Google Calendar collegato dal professionista (OAuth2). Il refresh
    -- token è cifrato a riposo (crypto.ts). sync_token = sync incrementale.
    CREATE TABLE IF NOT EXISTS calendar_accounts (
      tenant_id INTEGER PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'google',
      email TEXT,
      refresh_token TEXT,
      calendar_id TEXT NOT NULL DEFAULT 'primary',
      sync_token TEXT,
      ultimo_sync TEXT,
      stato TEXT NOT NULL DEFAULT 'collegato',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Lapidi degli appuntamenti eliminati su ORION ma ancora presenti su Google:
    -- il cron le processa (cancella l'evento remoto) e le rimuove.
    CREATE TABLE IF NOT EXISTS gcal_tombstones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      gcal_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- ── MOTORE RICAVI: riempi-buchi automatico ──────────────────────────────
    -- Quando uno slot si libera, ORION lo offre via WhatsApp alla lista d'attesa
    -- (uno alla volta, con scadenza). stato: 'inviata' | 'accettata' |
    -- 'rifiutata' | 'scaduta' | 'annullata' (slot rioccupato nel frattempo).
    CREATE TABLE IF NOT EXISTS offerte_slot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      attesa_id INTEGER,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      telefono TEXT,
      inizio TEXT NOT NULL,
      fine TEXT NOT NULL,
      stato TEXT NOT NULL DEFAULT 'inviata',
      scadenza TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_offerte_tenant ON offerte_slot(tenant_id, stato);
    CREATE INDEX IF NOT EXISTS idx_offerte_cliente ON offerte_slot(tenant_id, cliente_id, stato);

    -- ── STAFFETTA DEL TEAM: messaggi interni fra colleghi ───────────────────
    -- "Di' a Marco che…": ORION consegna il messaggio a voce quando il
    -- destinatario apre ORION (briefing) e gli manda subito una push mirata.
    CREATE TABLE IF NOT EXISTS messaggi_team (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      da_utente_id INTEGER,
      da_nome TEXT,
      per_nome TEXT,
      per_utente_id INTEGER,
      per_reparto TEXT,
      testo TEXT NOT NULL,
      urgente INTEGER NOT NULL DEFAULT 0,
      consegnato INTEGER NOT NULL DEFAULT 0,
      consegnato_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_msgteam_attesa ON messaggi_team(tenant_id, consegnato);

    -- ── APPROVAZIONI: richiesta → sì/no del responsabile → esito a chi chiede.
    -- Le "regole operative" ("oltre 500€ serve l'ok") diventano un flusso vero:
    -- la richiesta aspetta l'approvatore (briefing + push), la decisione torna
    -- a chi ha chiesto (briefing + push, finché non gli è stata comunicata).
    CREATE TABLE IF NOT EXISTS approvazioni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      da_utente_id INTEGER,
      da_nome TEXT,
      a_nome TEXT,
      a_utente_id INTEGER,
      richiesta TEXT NOT NULL,
      riferimento TEXT,
      urgente INTEGER NOT NULL DEFAULT 0,
      stato TEXT NOT NULL DEFAULT 'in_attesa',
      nota_esito TEXT,
      deciso_da TEXT,
      esito_comunicato INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      deciso_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_approvazioni_stato ON approvazioni(tenant_id, stato, esito_comunicato);
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
    // Onboarding dinamico — livello UTENTE: tenant dati su cui opera (per i
    // dipendenti = tenant aziendale), azienda di appartenenza, ruolo/reparto,
    // preferenze personali (JSON) e stato onboarding PER-UTENTE.
    "ALTER TABLE utenti ADD COLUMN tenant_id INTEGER",
    "ALTER TABLE utenti ADD COLUMN azienda_id INTEGER",
    "ALTER TABLE utenti ADD COLUMN ruolo TEXT",
    "ALTER TABLE utenti ADD COLUMN reparto TEXT",
    "ALTER TABLE utenti ADD COLUMN preferenze TEXT",
    "ALTER TABLE utenti ADD COLUMN onboarding_completo INTEGER",
    // Onboarding dinamico — livello PROFILO (autonomo/personale): tipo d'uso,
    // tipo di lavoro e memoria operativa flessibile (JSON).
    "ALTER TABLE profili ADD COLUMN tipo_uso TEXT",
    "ALTER TABLE profili ADD COLUMN tipo_lavoro TEXT",
    "ALTER TABLE profili ADD COLUMN memoria_operativa TEXT",
    // Memoria di contesto vivente: data dell'ultima consolidazione giornaliera
    // (guardia idempotente: la distillazione AI gira una sola volta al giorno).
    "ALTER TABLE profili ADD COLUMN ultima_consolidazione TEXT",
    // Modalità azienda: collega gli eventi in CATENE (es. "ordine 245").
    "ALTER TABLE eventi ADD COLUMN riferimento TEXT",
    // Fatturazione elettronica (SDI): XML FatturaPA, stato di trasmissione
    // ('da_trasmettere' | 'trasmessa' | 'consegnata' | 'scartata'), id presso il
    // provider e bollo virtuale (importo, se dovuto).
    "ALTER TABLE fatture ADD COLUMN xml TEXT",
    "ALTER TABLE fatture ADD COLUMN stato_sdi TEXT",
    "ALTER TABLE fatture ADD COLUMN sdi_id TEXT",
    "ALTER TABLE fatture ADD COLUMN bollo REAL",
    // Indirizzo strutturato per FatturaPA (CAP/comune/provincia), lato emittente
    // (profilo/azienda) e lato cliente.
    "ALTER TABLE profili ADD COLUMN cap TEXT",
    "ALTER TABLE profili ADD COLUMN comune TEXT",
    "ALTER TABLE profili ADD COLUMN provincia TEXT",
    "ALTER TABLE aziende ADD COLUMN cap TEXT",
    "ALTER TABLE aziende ADD COLUMN comune TEXT",
    "ALTER TABLE aziende ADD COLUMN provincia TEXT",
    "ALTER TABLE clienti ADD COLUMN cap TEXT",
    "ALTER TABLE clienti ADD COLUMN comune TEXT",
    "ALTER TABLE clienti ADD COLUMN provincia TEXT",
    // Anti no-show: quando il promemoria WhatsApp dell'appuntamento è partito.
    "ALTER TABLE appuntamenti ADD COLUMN promemoria_inviato INTEGER NOT NULL DEFAULT 0",
    // Caparra (opzionale): importo richiesto ai nuovi appuntamenti e link di
    // pagamento dello studio (Stripe Payment Link, PayPal.me, Satispay…).
    // Se entrambi presenti, le conferme automatiche includono la richiesta.
    "ALTER TABLE profili ADD COLUMN caparra_importo REAL",
    "ALTER TABLE profili ADD COLUMN link_pagamento TEXT",
    // Sync Google Calendar: id evento remoto + flag "da riallineare".
    "ALTER TABLE appuntamenti ADD COLUMN gcal_id TEXT",
    "ALTER TABLE appuntamenti ADD COLUMN gcal_dirty INTEGER NOT NULL DEFAULT 0",
    // SPECCHIO VIVO DEL GESTIONALE: provenienza + idempotenza sui dati core. Un
    // record sincronizzato da un sistema esterno porta l'id della connessione,
    // la sua chiave nel gestionale (per aggiornare invece di duplicare) e quando
    // è stato allineato l'ultima volta. NULL = nato dentro ORION.
    "ALTER TABLE clienti ADD COLUMN origine_connessione_id INTEGER",
    "ALTER TABLE clienti ADD COLUMN origine_chiave TEXT",
    "ALTER TABLE clienti ADD COLUMN sincronizzato_at TEXT",
    "ALTER TABLE appuntamenti ADD COLUMN origine_connessione_id INTEGER",
    "ALTER TABLE appuntamenti ADD COLUMN origine_chiave TEXT",
    "ALTER TABLE appuntamenti ADD COLUMN sincronizzato_at TEXT",
    // Fonte di verità del tenant: NULL/'orion' = ORION è il gestionale; oppure
    // l'id della connessione-gestionale di cui ORION è lo specchio vivo.
    "ALTER TABLE profili ADD COLUMN fonte_dati TEXT",
    "ALTER TABLE profili ADD COLUMN fonte_connessione_id INTEGER",
    // Come si apre un software collegato (nome app o URL): per la routine del
    // mattino, ORION lo apre da solo e poi lo guarda.
    "ALTER TABLE connessioni ADD COLUMN apertura TEXT",
    // AREE RISERVATE (permessi per ruolo in azienda): JSON { area: [classi] }
    // deciso a voce dal titolare; i default vivono in data.ts.
    "ALTER TABLE aziende ADD COLUMN permessi TEXT",
    // Push MIRATE: a chi appartiene l'iscrizione (per notificare la singola
    // persona: compito assegnato, messaggio del team), non tutto il tenant.
    "ALTER TABLE push_subscriptions ADD COLUMN utente_id INTEGER",
  ];
  for (const sql of alters) {
    try {
      d.exec(sql);
    } catch {
      /* colonna già presente */
    }
  }

  // Indici per il dedup della sincronia (creati DOPO gli ALTER: su un DB vecchio
  // le colonne non esistevano al CREATE TABLE).
  for (const sql of [
    "CREATE INDEX IF NOT EXISTS idx_clienti_origine ON clienti(tenant_id, origine_connessione_id, origine_chiave)",
    "CREATE INDEX IF NOT EXISTS idx_appuntamenti_origine ON appuntamenti(tenant_id, origine_connessione_id, origine_chiave)",
  ]) {
    try {
      d.exec(sql);
    } catch {
      /* indice già presente */
    }
  }

  // Backfill idempotente per i DB esistenti (single-user):
  //  - ogni utente opera sul proprio tenant (tenant_id = id) finché non si
  //    aggancia a un'azienda;
  //  - lo stato onboarding per-utente eredita quello del profilo del tenant,
  //    così gli account già configurati NON rifanno la Chiamata 0.
  // Tocca solo le righe ancora NULL → non sovrascrive nulla ai giri successivi.
  d.exec(`
    UPDATE utenti SET tenant_id = id WHERE tenant_id IS NULL;
    UPDATE utenti SET onboarding_completo = COALESCE(
      (SELECT p.onboarding_completo FROM profili p WHERE p.tenant_id = utenti.id), 0
    ) WHERE onboarding_completo IS NULL;
  `);

  // Indici sulle colonne tenant_id: creati ORA, dopo che gli ALTER le hanno
  // garantite anche sui DB migrati dal vecchio schema single-tenant.
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_clienti_tenant ON clienti(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_appuntamenti_tenant ON appuntamenti(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_pagamenti_tenant ON pagamenti(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_comunicazioni_tenant ON comunicazioni(tenant_id);
  `);
}

// ── BACKUP AUTOMATICO ───────────────────────────────────────────────────────
// Snapshot giornaliero del database (better-sqlite3 .backup = copia consistente
// anche a caldo, senza fermare l'app). File in DATA_DIR/backups/orion-YYYY-MM-DD.db,
// si tengono gli ultimi `conserva`. Idempotente: una sola copia al giorno.
// Lanciato dal cron; richiamabile anche a mano.
export async function backupGiornaliero(conserva = 7): Promise<string | null> {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const cartella = path.join(dir, "backups");
  const oggi = new Date().toISOString().slice(0, 10);
  const destinazione = path.join(cartella, `orion-${oggi}.db`);
  if (fs.existsSync(destinazione)) return null; // già fatto oggi
  fs.mkdirSync(cartella, { recursive: true });
  await db().backup(destinazione);
  // Ruota: elimina i backup più vecchi oltre la finestra.
  const vecchi = fs
    .readdirSync(cartella)
    .filter((f) => /^orion-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort();
  for (const f of vecchi.slice(0, Math.max(0, vecchi.length - conserva))) {
    try {
      fs.unlinkSync(path.join(cartella, f));
    } catch {
      /* non bloccare per un file che non si lascia eliminare */
    }
  }
  return destinazione;
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
