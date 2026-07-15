import crypto from "node:crypto";
import { db } from "./db";
import { tenantIdCorrente } from "./tenant";
import { cifra } from "./crypto";
import { eBetaTester, SCONTO_BETA } from "./beta";

// ──────────────────────────────────────────────────────────────────────────
// Accesso ai dati, MULTI-TENANT: ogni query è filtrata per tenant_id, preso
// dal contesto della richiesta (tenant.ts). Le funzioni vanno chiamate dentro
// runWithTenant(...) — lo fanno le route dopo aver verificato la sessione.
// Punto d'integrazione WhatsApp reale: `logCommunication`.
// ──────────────────────────────────────────────────────────────────────────

export type Profilo = {
  tenant_id: number;
  nome: string | null;
  professione: string | null;
  durata_visita_min: number | null;
  gestione_cancellazioni: string | null;
  canale_comunicazione: string | null;
  problemi_tempo: string | null;
  abitudini: string | null;
  piva: string | null;
  codice_fiscale: string | null;
  indirizzo: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  regime_fiscale: string | null;
  pec: string | null;
  sdi: string | null;
  // Caparra opzionale per i nuovi appuntamenti: importo e link di pagamento
  // dello studio (Stripe Payment Link, PayPal.me, Satispay…). Se entrambi
  // presenti, le conferme automatiche (centralino, riempi-buchi) la richiedono.
  caparra_importo: number | null;
  link_pagamento: string | null;
  // Onboarding dinamico:
  tipo_uso: string | null; // 'personale' | 'lavoro'
  tipo_lavoro: string | null; // 'autonomo' | 'azienda'
  memoria_operativa: string | null; // JSON flessibile: { tema: dettaglio, ... }
  ultima_consolidazione: string | null; // data (YYYY-MM-DD) ultima distillazione AI
  // Fonte di verità dei dati: NULL/'orion' = ORION è il gestionale; 'gestionale'
  // = ORION è lo specchio vivo del sistema in fonte_connessione_id.
  fonte_dati: string | null;
  fonte_connessione_id: number | null;
  onboarding_completo: number;
  updated_at: string;
};

// Una voce di memoria operativa: tema (chiave breve) → dettaglio (testo libero).
export type VoceMemoria = { tema: string; dettaglio: string };

// Azienda/team (onboarding Caso B): ambiente condiviso. tenant_id = id del
// fondatore = tenant dei dati comuni. I dipendenti si agganciano col codice.
export type Azienda = {
  tenant_id: number;
  nome: string | null;
  settore: string | null;
  dimensioni: string | null;
  sedi: string | null;
  codice_aziendale: string | null;
  memoria_operativa: string | null; // JSON: organigramma, processi, regole…
  permessi: string | null; // JSON { area: [classi di ruolo] } — aree riservate
  piva: string | null;
  codice_fiscale: string | null;
  indirizzo: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  regime_fiscale: string | null;
  pec: string | null;
  sdi: string | null;
  created_at: string;
  updated_at: string;
};

export type Cliente = {
  id: number;
  nome: string;
  telefono: string | null;
  email: string | null;
  note: string | null;
  piva: string | null;
  codice_fiscale: string | null;
  indirizzo: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  ultima_visita: string | null;
  // Provenienza (specchio del gestionale): NULL = nato in ORION.
  origine_connessione_id?: number | null;
  origine_chiave?: string | null;
  sincronizzato_at?: string | null;
  created_at: string;
};

export type Appuntamento = {
  id: number;
  cliente_id: number | null;
  cliente_nome?: string | null;
  cliente_telefono?: string | null;
  titolo: string;
  inizio: string;
  fine: string;
  stato: string;
  note: string | null;
  promemoria_inviato?: number;
  gcal_id?: string | null;
  origine_connessione_id?: number | null;
  origine_chiave?: string | null;
  sincronizzato_at?: string | null;
  created_at: string;
};

export type Pagamento = {
  id: number;
  cliente_id: number | null;
  cliente_nome?: string | null;
  importo: number;
  metodo: string;
  stato: string;
  data: string;
  descrizione: string | null;
  created_at: string;
};

export type Comunicazione = {
  id: number;
  cliente_id: number | null;
  cliente_nome?: string | null;
  direzione: string;
  canale: string;
  tipo: string;
  contenuto: string | null;
  allegato_nome: string | null;
  allegato_url: string | null;
  stato: string;
  created_at: string;
};

export type Nota = {
  id: number;
  cliente_id: number | null;
  cliente_nome?: string | null;
  titolo: string | null;
  contenuto: string;
  created_at: string;
};

export type Promemoria = {
  id: number;
  cliente_id: number | null;
  cliente_nome?: string | null;
  testo: string;
  categoria: string;
  scadenza: string | null;
  completato: number;
  created_at: string;
};

export type Documento = {
  id: number;
  cliente_id: number | null;
  cliente_nome?: string | null;
  titolo: string;
  tipo: string;
  testo: string | null;
  immagine: string | null;
  created_at: string;
};

export type VoceAttesa = {
  id: number;
  cliente_id: number | null;
  nome: string;
  motivo: string | null;
  priorita: string;
  created_at: string;
};

export type Segnalazione = { categoria: string; titolo: string; dettaglio: string; azione: string };
export type PushSub = { endpoint: string; p256dh: string; auth: string };

export type WhatsappAccount = {
  tenant_id: number;
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  token: string | null;
  stato: string;
  created_at: string;
  updated_at: string;
};

export type Abbonamento = {
  tenant_id: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stato: string;
  piano: string | null;
  periodo_fine: string | null;
  created_at: string;
  updated_at: string;
};

export type StatoAbbonamento = {
  configurato: boolean;
  stato: "demo" | "da_attivare" | "prova" | "attivo" | "scaduto" | "annullato";
  piano: "pro" | "azienda" | null;
  inProva: boolean;
  giorniProvaRimasti: number;
  attivo: boolean;
  accessoConsentito: boolean;
  periodoFine: string | null;
  founder: boolean; // iscritto alla beta → sconto a vita agganciato all'account
  scontoFounder: number; // % dello sconto founding member (0 se non founder)
};

const nowISO = () => new Date().toISOString();
const T = () => tenantIdCorrente();

// ── Profilo / memoria operativa ───────────────────────────────────────────

export function getProfilo(): Profilo {
  return db().prepare("SELECT * FROM profili WHERE tenant_id = ?").get(T()) as Profilo;
}

const CAMPI_PROFILO = [
  "nome", "professione", "durata_visita_min", "gestione_cancellazioni",
  "canale_comunicazione", "problemi_tempo", "abitudini", "piva", "codice_fiscale",
  "indirizzo", "cap", "comune", "provincia", "regime_fiscale", "pec", "sdi",
  "caparra_importo", "link_pagamento",
  "fonte_dati", "fonte_connessione_id",
  "tipo_uso", "tipo_lavoro", "onboarding_completo",
] as const;

export function aggiornaProfilo(fields: Record<string, unknown>): Profilo {
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const k of CAMPI_PROFILO) {
    if (k in fields && fields[k] !== undefined && fields[k] !== null) {
      updates.push(`${k} = ?`);
      values.push(fields[k]);
    }
  }
  if (updates.length) {
    updates.push("updated_at = ?");
    values.push(nowISO());
    values.push(T());
    db().prepare(`UPDATE profili SET ${updates.join(", ")} WHERE tenant_id = ?`).run(...values);
  }
  return getProfilo();
}

// Fonde nuove voci nella memoria_operativa (JSON) del profilo, senza perdere le
// precedenti: stesso tema → aggiornato, tema nuovo → aggiunto.
function fondiMemoria(attuale: string | null, voci: VoceMemoria[]): string {
  let mappa: Record<string, string> = {};
  if (attuale) {
    try {
      mappa = JSON.parse(attuale);
    } catch {
      /* memoria corrotta: riparti pulito */
    }
  }
  for (const v of voci) {
    if (v?.tema && typeof v.dettaglio === "string") mappa[String(v.tema).trim()] = v.dettaglio;
  }
  return JSON.stringify(mappa);
}

export function aggiornaMemoriaProfilo(voci: VoceMemoria[]): Profilo {
  const p = getProfilo();
  const json = fondiMemoria(p.memoria_operativa, voci);
  db()
    .prepare("UPDATE profili SET memoria_operativa = ?, updated_at = ? WHERE tenant_id = ?")
    .run(json, nowISO(), T());
  return getProfilo();
}

// ── Azienda / team (onboarding Caso B) ───────────────────────────────────────

const ALFABETO_CODICE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // niente O/0/I/1 ambigui

function generaCodiceAziendale(): string {
  const d = db();
  for (let tentativi = 0; tentativi < 50; tentativi++) {
    let suffisso = "";
    for (let i = 0; i < 6; i++) {
      suffisso += ALFABETO_CODICE[Math.floor(Math.random() * ALFABETO_CODICE.length)];
    }
    const codice = `ORION-${suffisso}`;
    const esiste = d.prepare("SELECT 1 FROM aziende WHERE codice_aziendale = ?").get(codice);
    if (!esiste) return codice;
  }
  // Fallback praticamente impossibile: aggiungi entropia temporale.
  return `ORION-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export function getAzienda(tenantId?: number): Azienda | undefined {
  return db().prepare("SELECT * FROM aziende WHERE tenant_id = ?").get(tenantId ?? T()) as
    | Azienda
    | undefined;
}

export function trovaAziendaPerCodice(codice: string): Azienda | undefined {
  return db()
    .prepare("SELECT * FROM aziende WHERE codice_aziendale = ?")
    .get(String(codice).trim().toUpperCase()) as Azienda | undefined;
}

const CAMPI_AZIENDA = [
  "nome", "settore", "dimensioni", "sedi",
  "piva", "codice_fiscale", "indirizzo", "regime_fiscale", "pec", "sdi",
] as const;

// Crea (se non esiste) o aggiorna l'azienda del tenant corrente. Alla creazione
// genera un codice aziendale univoco. `memoria` viene fusa nella memoria_operativa.
export function configuraAzienda(
  fields: Record<string, unknown>,
  memoria: VoceMemoria[] = []
): Azienda {
  const now = nowISO();
  let azienda = getAzienda();
  if (!azienda) {
    const codice = generaCodiceAziendale();
    db()
      .prepare(
        "INSERT INTO aziende (tenant_id, codice_aziendale, memoria_operativa, created_at, updated_at) VALUES (?, ?, '{}', ?, ?)"
      )
      .run(T(), codice, now, now);
    azienda = getAzienda()!;
  }
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const k of CAMPI_AZIENDA) {
    if (k in fields && fields[k] !== undefined && fields[k] !== null) {
      updates.push(`${k} = ?`);
      values.push(fields[k]);
    }
  }
  if (memoria.length) {
    updates.push("memoria_operativa = ?");
    values.push(fondiMemoria(azienda.memoria_operativa, memoria));
  }
  updates.push("updated_at = ?");
  values.push(now);
  values.push(T());
  db().prepare(`UPDATE aziende SET ${updates.join(", ")} WHERE tenant_id = ?`).run(...values);
  return getAzienda()!;
}

// ════════════════════════════════════════════════════════════════════════════
// MEMORIA DI CONTESTO VIVENTE
// ════════════════════════════════════════════════════════════════════════════

export type Memoria = {
  id: number;
  tenant_id: number;
  categoria: string;
  soggetto: string | null;
  cliente_id: number | null;
  contenuto: string;
  motivo: string | null;
  confidenza: string; // 'basso' | 'medio' | 'alto'
  evidenze: number;
  stato: string; // 'attivo' | 'superato'
  created_at: string;
  updated_at: string;
  ultima_conferma: string | null;
};

export type Evento = {
  id: number;
  tenant_id: number;
  tipo: string;
  soggetto: string | null;
  cliente_id: number | null;
  riferimento: string | null;
  descrizione: string;
  created_at: string;
};

export type RigaDiario = { id: number; tenant_id: number; data: string; riassunto: string; created_at: string };
export type MessaggioSalvato = { id: number; ruolo: string; contenuto: string; created_at: string };

const CONF_LIVELLO: Record<string, number> = { basso: 0, medio: 1, alto: 2 };
const CONF_NOME = ["basso", "medio", "alto"];
function alzaConfidenza(attuale: string): string {
  return CONF_NOME[Math.min(2, (CONF_LIVELLO[attuale] ?? 1) + 1)];
}

// ── Livello 1: memoria viva ───────────────────────────────────────────────────

// Inserisce un'intuizione; se ne esiste già una uguale (stessa categoria + stesso
// soggetto + stesso contenuto) la RINFORZA invece di duplicarla: più volte ORION
// osserva una cosa, più ne è certo (evidenze+1, confidenza che sale).
export function impara(i: {
  categoria?: string;
  soggetto?: string | null;
  cliente_id?: number | null;
  contenuto: string;
  motivo?: string | null;
  confidenza?: string;
}): Memoria {
  const t = T();
  const now = nowISO();
  const categoria = i.categoria ?? "contesto";
  const soggetto = i.soggetto ?? null;
  const esistente = db()
    .prepare(
      `SELECT * FROM memoria WHERE tenant_id = ? AND stato = 'attivo' AND categoria = ?
       AND COALESCE(soggetto,'') = COALESCE(?,'') AND lower(contenuto) = lower(?) LIMIT 1`
    )
    .get(t, categoria, soggetto, i.contenuto) as Memoria | undefined;
  if (esistente) {
    db()
      .prepare(
        `UPDATE memoria SET evidenze = evidenze + 1, confidenza = ?, motivo = COALESCE(?, motivo),
         updated_at = ?, ultima_conferma = ? WHERE id = ?`
      )
      .run(alzaConfidenza(esistente.confidenza), i.motivo ?? null, now, now, esistente.id);
    return db().prepare("SELECT * FROM memoria WHERE id = ?").get(esistente.id) as Memoria;
  }
  const r = db()
    .prepare(
      `INSERT INTO memoria (tenant_id, categoria, soggetto, cliente_id, contenuto, motivo, confidenza, evidenze, stato, created_at, updated_at, ultima_conferma)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'attivo', ?, ?, ?)`
    )
    .run(t, categoria, soggetto, i.cliente_id ?? null, i.contenuto, i.motivo ?? null, i.confidenza ?? "medio", now, now, now);
  return db().prepare("SELECT * FROM memoria WHERE id = ?").get(Number(r.lastInsertRowid)) as Memoria;
}

// Corregge/evolve un'intuizione. superato=true → l'intuizione non vale più (evoluzione
// nel tempo); altrimenti aggiorna contenuto/motivo/confidenza.
export function aggiornaApprendimento(
  id: number,
  patch: { contenuto?: string; motivo?: string; confidenza?: string; superato?: boolean }
): Memoria | undefined {
  const t = T();
  const m = db().prepare("SELECT * FROM memoria WHERE id = ? AND tenant_id = ?").get(id, t) as Memoria | undefined;
  if (!m) return undefined;
  db()
    .prepare(
      `UPDATE memoria SET contenuto = COALESCE(?, contenuto), motivo = COALESCE(?, motivo),
       confidenza = COALESCE(?, confidenza), stato = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`
    )
    .run(
      patch.contenuto ?? null,
      patch.motivo ?? null,
      patch.confidenza ?? null,
      patch.superato ? "superato" : m.stato,
      nowISO(),
      id,
      t
    );
  return db().prepare("SELECT * FROM memoria WHERE id = ?").get(id) as Memoria;
}

// Richiama le intuizioni rilevanti. Ordina per confidenza e recency. Se passi un
// soggetto/cliente filtra su quello (più eventuali generali), altrimenti generali.
export function recallMemoria(opts: {
  soggetto?: string | null;
  cliente_id?: number | null;
  categorie?: string[];
  limite?: number;
} = {}): Memoria[] {
  const t = T();
  const limite = opts.limite ?? 12;
  const cond: string[] = ["tenant_id = ?", "stato = 'attivo'"];
  const args: unknown[] = [t];
  if (opts.cliente_id != null) {
    cond.push("(cliente_id = ? OR cliente_id IS NULL)");
    args.push(opts.cliente_id);
  } else if (opts.soggetto) {
    cond.push("(soggetto LIKE ? OR soggetto IS NULL)");
    args.push(`%${opts.soggetto}%`);
  }
  if (opts.categorie?.length) {
    cond.push(`categoria IN (${opts.categorie.map(() => "?").join(",")})`);
    args.push(...opts.categorie);
  }
  return db()
    .prepare(
      `SELECT * FROM memoria WHERE ${cond.join(" AND ")}
       ORDER BY CASE confidenza WHEN 'alto' THEN 0 WHEN 'medio' THEN 1 ELSE 2 END,
       evidenze DESC, updated_at DESC LIMIT ?`
    )
    .all(...args, limite) as Memoria[];
}

export function listMemoria(): Memoria[] {
  return db()
    .prepare(
      `SELECT * FROM memoria WHERE tenant_id = ? AND stato = 'attivo'
       ORDER BY CASE confidenza WHEN 'alto' THEN 0 WHEN 'medio' THEN 1 ELSE 2 END, evidenze DESC, updated_at DESC`
    )
    .all(T()) as Memoria[];
}

// ── Livello 2a: registro eventi ───────────────────────────────────────────────

export function logEvento(e: {
  tipo: string;
  descrizione: string;
  soggetto?: string | null;
  cliente_id?: number | null;
  riferimento?: string | null;
}) {
  try {
    db()
      .prepare(
        "INSERT INTO eventi (tenant_id, tipo, soggetto, cliente_id, riferimento, descrizione, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(T(), e.tipo, e.soggetto ?? null, e.cliente_id ?? null, e.riferimento ?? null, e.descrizione, nowISO());
  } catch {
    /* il log non deve mai far fallire l'azione principale */
  }
}

export function eventiDopo(iso: string, limite = 20): Evento[] {
  return db()
    .prepare("SELECT * FROM eventi WHERE tenant_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT ?")
    .all(T(), iso, limite) as Evento[];
}

export function eventiRecenti(limite = 20): Evento[] {
  return db()
    .prepare("SELECT * FROM eventi WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(T(), limite) as Evento[];
}

// Catena di eventi collegati dallo stesso riferimento (es. "ordine 245"):
// cliente → ordine → produzione → problema → decisione → nuova scadenza.
export function eventiPerRiferimento(riferimento: string, limite = 30): Evento[] {
  return db()
    .prepare("SELECT * FROM eventi WHERE tenant_id = ? AND riferimento = ? ORDER BY created_at ASC LIMIT ?")
    .all(T(), riferimento, limite) as Evento[];
}

// ── Livello 2b: diario ────────────────────────────────────────────────────────

export function scriviDiario(riassunto: string): RigaDiario {
  const now = nowISO();
  const r = db()
    .prepare("INSERT INTO diario (tenant_id, data, riassunto, created_at) VALUES (?, ?, ?, ?)")
    .run(T(), now.slice(0, 10), riassunto, now);
  return db().prepare("SELECT * FROM diario WHERE id = ?").get(Number(r.lastInsertRowid)) as RigaDiario;
}

export function ultimoDiario(): RigaDiario | undefined {
  return db()
    .prepare("SELECT * FROM diario WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(T()) as RigaDiario | undefined;
}

// ── Livello 2c: conversazione persistita ──────────────────────────────────────

export function salvaMessaggio(ruolo: "user" | "assistant", contenuto: string, utenteId?: number | null) {
  const testo = (contenuto ?? "").trim();
  if (!testo) return;
  db()
    .prepare("INSERT INTO messaggi (tenant_id, utente_id, ruolo, contenuto, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(T(), utenteId ?? null, ruolo, testo, nowISO());
}

export function messaggiRecenti(limite = 40): MessaggioSalvato[] {
  const righe = db()
    .prepare("SELECT id, ruolo, contenuto, created_at FROM messaggi WHERE tenant_id = ? ORDER BY id DESC LIMIT ?")
    .all(T(), limite) as MessaggioSalvato[];
  return righe.reverse(); // dal più vecchio al più recente
}

export function cercaNeiMessaggi(testo: string, limite = 8): MessaggioSalvato[] {
  return db()
    .prepare(
      "SELECT id, ruolo, contenuto, created_at FROM messaggi WHERE tenant_id = ? AND contenuto LIKE ? ORDER BY id DESC LIMIT ?"
    )
    .all(T(), `%${testo}%`, limite) as MessaggioSalvato[];
}

// ── Guardia consolidazione giornaliera ────────────────────────────────────────

export function ultimaConsolidazione(): string | null {
  const r = db().prepare("SELECT ultima_consolidazione FROM profili WHERE tenant_id = ?").get(T()) as
    | { ultima_consolidazione: string | null }
    | undefined;
  return r?.ultima_consolidazione ?? null;
}

export function segnaConsolidazione(data: string) {
  db().prepare("UPDATE profili SET ultima_consolidazione = ? WHERE tenant_id = ?").run(data, T());
}

// ════════════════════════════════════════════════════════════════════════════
// MODALITÀ AZIENDA: organigramma, compiti, consegne, briefing per ruolo, triage
// ════════════════════════════════════════════════════════════════════════════

export type MembroOrganico = {
  id: number;
  tenant_id: number;
  nome: string;
  ruolo: string | null;
  reparto: string | null;
  responsabilita: string | null;
  riporta_a: string | null;
  contatti: string | null;
  note: string | null;
  utente_id: number | null;
  attivo: number;
  created_at: string;
  updated_at: string;
};

export type Compito = {
  id: number;
  tenant_id: number;
  titolo: string;
  descrizione: string | null;
  assegnatario: string | null;
  assegnato_da: string | null;
  reparto: string | null;
  cliente_id: number | null;
  riferimento: string | null;
  stato: string; // aperto | in_corso | completato | annullato
  scadenza: string | null;
  frequenza_giorni: number | null;
  ultimo_aggiornamento: string | null;
  notificato: number;
  created_at: string;
  updated_at: string;
  in_ritardo?: boolean; // derivato
};

export type Consegna = {
  id: number;
  tenant_id: number;
  reparto: string | null;
  da_nome: string | null;
  completato: string | null;
  in_sospeso: string | null;
  problemi: string | null;
  suggerimenti: string | null;
  created_at: string;
};

// ── Organigramma ──────────────────────────────────────────────────────────────

export function listOrganico(): MembroOrganico[] {
  return db()
    .prepare("SELECT * FROM organico WHERE tenant_id = ? AND attivo = 1 ORDER BY reparto, nome COLLATE NOCASE")
    .all(T()) as MembroOrganico[];
}

export function trovaMembro(nome: string): MembroOrganico | undefined {
  const n = nome.trim();
  return db()
    .prepare("SELECT * FROM organico WHERE tenant_id = ? AND attivo = 1 AND nome LIKE ? ORDER BY length(nome) LIMIT 1")
    .get(T(), `%${n}%`) as MembroOrganico | undefined;
}

const CAMPI_ORGANICO = ["nome", "ruolo", "reparto", "responsabilita", "riporta_a", "contatti", "note", "utente_id"] as const;

// Crea o aggiorna un membro: se esiste già qualcuno con lo stesso nome lo aggiorna
// (così "Marco fa il responsabile produzione" arricchisce il profilo esistente).
export function aggiornaOrganico(m: Record<string, unknown> & { nome: string }): MembroOrganico {
  const now = nowISO();
  const esistente = m.id
    ? (db().prepare("SELECT * FROM organico WHERE id = ? AND tenant_id = ?").get(Number(m.id), T()) as MembroOrganico | undefined)
    : trovaMembro(String(m.nome));
  if (esistente) {
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const k of CAMPI_ORGANICO) {
      if (k in m && m[k] !== undefined && m[k] !== null) {
        updates.push(`${k} = ?`);
        values.push(m[k]);
      }
    }
    updates.push("updated_at = ?");
    values.push(now, esistente.id, T());
    db().prepare(`UPDATE organico SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`).run(...values);
    return db().prepare("SELECT * FROM organico WHERE id = ?").get(esistente.id) as MembroOrganico;
  }
  const r = db()
    .prepare(
      `INSERT INTO organico (tenant_id, nome, ruolo, reparto, responsabilita, riporta_a, contatti, note, utente_id, attivo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
      T(),
      String(m.nome),
      (m.ruolo as string) ?? null,
      (m.reparto as string) ?? null,
      (m.responsabilita as string) ?? null,
      (m.riporta_a as string) ?? null,
      (m.contatti as string) ?? null,
      (m.note as string) ?? null,
      (m.utente_id as number) ?? null,
      now,
      now
    );
  return db().prepare("SELECT * FROM organico WHERE id = ?").get(Number(r.lastInsertRowid)) as MembroOrganico;
}

// ── Compiti (attività assegnate) ──────────────────────────────────────────────

function arricchisciCompito(c: Compito): Compito {
  const oggiData = new Date().toISOString().slice(0, 10);
  c.in_ritardo = c.stato !== "completato" && c.stato !== "annullato" && !!c.scadenza && c.scadenza.slice(0, 10) < oggiData;
  return c;
}

export function creaCompito(c: {
  titolo: string;
  descrizione?: string | null;
  assegnatario?: string | null;
  assegnato_da?: string | null;
  reparto?: string | null;
  cliente_id?: number | null;
  riferimento?: string | null;
  scadenza?: string | null;
  frequenza_giorni?: number | null;
}): Compito {
  const now = nowISO();
  const r = db()
    .prepare(
      `INSERT INTO compiti (tenant_id, titolo, descrizione, assegnatario, assegnato_da, reparto, cliente_id, riferimento, stato, scadenza, frequenza_giorni, ultimo_aggiornamento, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aperto', ?, ?, ?, ?, ?)`
    )
    .run(
      T(),
      c.titolo,
      c.descrizione ?? null,
      c.assegnatario ?? null,
      c.assegnato_da ?? null,
      c.reparto ?? null,
      c.cliente_id ?? null,
      c.riferimento ?? null,
      c.scadenza ?? null,
      c.frequenza_giorni ?? null,
      now,
      now,
      now
    );
  return arricchisciCompito(db().prepare("SELECT * FROM compiti WHERE id = ?").get(Number(r.lastInsertRowid)) as Compito);
}

export function aggiornaCompito(
  id: number,
  patch: { stato?: string; descrizione?: string; scadenza?: string; assegnatario?: string; avanzamento?: string }
): Compito | undefined {
  const t = T();
  const c = db().prepare("SELECT * FROM compiti WHERE id = ? AND tenant_id = ?").get(id, t) as Compito | undefined;
  if (!c) return undefined;
  const now = nowISO();
  const descr = patch.avanzamento
    ? `${c.descrizione ? c.descrizione + "\n" : ""}[${now.slice(0, 10)}] ${patch.avanzamento}`
    : patch.descrizione ?? c.descrizione;
  db()
    .prepare(
      `UPDATE compiti SET stato = COALESCE(?, stato), descrizione = ?, scadenza = COALESCE(?, scadenza),
       assegnatario = COALESCE(?, assegnatario), ultimo_aggiornamento = ?, notificato = 0, updated_at = ? WHERE id = ? AND tenant_id = ?`
    )
    .run(patch.stato ?? null, descr, patch.scadenza ?? null, patch.assegnatario ?? null, now, now, id, t);
  return arricchisciCompito(db().prepare("SELECT * FROM compiti WHERE id = ?").get(id) as Compito);
}

export function listCompiti(opts: { assegnatario?: string; reparto?: string; stato?: string; soloAttivi?: boolean } = {}): Compito[] {
  const cond: string[] = ["tenant_id = ?"];
  const args: unknown[] = [T()];
  if (opts.assegnatario) {
    cond.push("assegnatario LIKE ?");
    args.push(`%${opts.assegnatario}%`);
  }
  if (opts.reparto) {
    cond.push("reparto LIKE ?");
    args.push(`%${opts.reparto}%`);
  }
  if (opts.stato) {
    cond.push("stato = ?");
    args.push(opts.stato);
  } else if (opts.soloAttivi) {
    cond.push("stato NOT IN ('completato','annullato')");
  }
  return (
    db()
      .prepare(`SELECT * FROM compiti WHERE ${cond.join(" AND ")} ORDER BY (scadenza IS NULL), scadenza, created_at DESC`)
      .all(...args) as Compito[]
  ).map(arricchisciCompito);
}

// Compiti che richiedono attenzione: in ritardo, oppure senza aggiornamento da
// più giorni della cadenza richiesta (frequenza_giorni).
export function compitiDaSeguire(): Compito[] {
  return listCompiti({ soloAttivi: true }).filter((c) => {
    if (c.in_ritardo) return true;
    if (c.frequenza_giorni && c.ultimo_aggiornamento) {
      const giorni = (Date.now() - new Date(c.ultimo_aggiornamento).getTime()) / 86400000;
      return giorni >= c.frequenza_giorni;
    }
    return false;
  });
}

// Compiti da NOTIFICARE (push): in ritardo e non ancora notificati. Il flag si
// azzera a ogni aggiornamento del compito → si rinotifica se torna in ritardo.
export function compitiDaNotificare(): Compito[] {
  return compitiDaSeguire().filter((c) => c.in_ritardo && c.notificato === 0);
}

export function segnaCompitiNotificati(ids: number[]) {
  if (!ids.length) return;
  const stmt = db().prepare("UPDATE compiti SET notificato = 1 WHERE id = ? AND tenant_id = ?");
  const t = T();
  for (const id of ids) stmt.run(id, t);
}

// ── Consegne (passaggio di turno) ─────────────────────────────────────────────

export function passaConsegne(c: {
  reparto?: string | null;
  da_nome?: string | null;
  completato?: string | null;
  in_sospeso?: string | null;
  problemi?: string | null;
  suggerimenti?: string | null;
}): Consegna {
  const r = db()
    .prepare(
      `INSERT INTO consegne (tenant_id, reparto, da_nome, completato, in_sospeso, problemi, suggerimenti, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(T(), c.reparto ?? null, c.da_nome ?? null, c.completato ?? null, c.in_sospeso ?? null, c.problemi ?? null, c.suggerimenti ?? null, nowISO());
  return db().prepare("SELECT * FROM consegne WHERE id = ?").get(Number(r.lastInsertRowid)) as Consegna;
}

// Ultima consegna (eventualmente filtrata per reparto) → letta dal briefing.
export function ultimaConsegna(reparto?: string | null): Consegna | undefined {
  if (reparto) {
    const r = db()
      .prepare("SELECT * FROM consegne WHERE tenant_id = ? AND reparto = ? ORDER BY created_at DESC LIMIT 1")
      .get(T(), reparto) as Consegna | undefined;
    if (r) return r;
  }
  return db().prepare("SELECT * FROM consegne WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1").get(T()) as
    | Consegna
    | undefined;
}

// ── Briefing per ruolo + triage delle priorità ────────────────────────────────

// Classifica il ruolo testuale in una delle quattro "lenti" del briefing.
export type ClasseRuolo = "titolare" | "responsabile" | "amministrativo" | "operatore";
export function classeRuolo(ruolo?: string | null): ClasseRuolo {
  const r = (ruolo ?? "").toLowerCase();
  if (/titolar|amministrator delegat|ceo|direttore|propriet|fondator|owner/.test(r)) return "titolare";
  if (/responsabil|capo|manager|coordinator|preposto|caporeparto/.test(r)) return "responsabile";
  if (/ammininistrat|segret|contabil|ufficio|backoffice|hr|risorse uman/.test(r)) return "amministrativo";
  return "operatore";
}

// ── AREE RISERVATE: permessi reali per ruolo (solo in azienda) ────────────────
// "Chi può vedere cosa" non è solo memoria del prompt: è APPLICATO negli
// strumenti (dispatch dei tool) e nelle route. Il titolare cambia gli accessi
// a voce (imposta_permessi); i default sono prudenti. Senza azienda (autonomo/
// personale) non esiste alcuna riserva.

export const AREE_PERMESSI = ["finanza", "pagamenti", "fatture", "esporta", "azienda_config"] as const;
export type AreaPermessi = (typeof AREE_PERMESSI)[number];

const PERMESSI_DEFAULT: Record<AreaPermessi, ClasseRuolo[]> = {
  finanza: ["titolare", "amministrativo"], // incassi, analisi economica, report valore
  pagamenti: ["titolare", "amministrativo"],
  fatture: ["titolare", "amministrativo"],
  esporta: ["titolare"], // export completo dei dati
  azienda_config: ["titolare"], // configurazione azienda e questi stessi permessi
};

function esAreaPermessi(v: unknown): v is AreaPermessi {
  return typeof v === "string" && (AREE_PERMESSI as readonly string[]).includes(v);
}

// Regole correnti del tenant: default + le modifiche del titolare (JSON su aziende).
export function permessiAzienda(): Record<AreaPermessi, ClasseRuolo[]> {
  const regole = { ...PERMESSI_DEFAULT };
  const az = getAzienda();
  if (!az?.permessi) return regole;
  try {
    const salvate = JSON.parse(az.permessi) as Record<string, unknown>;
    for (const [area, ruoli] of Object.entries(salvate)) {
      if (esAreaPermessi(area) && Array.isArray(ruoli)) {
        const puliti = ruoli.filter((r): r is ClasseRuolo =>
          ["titolare", "responsabile", "amministrativo", "operatore"].includes(String(r))
        );
        if (puliti.length) regole[area] = puliti;
      }
    }
  } catch {
    /* JSON corrotto → restano i default prudenti */
  }
  return regole;
}

// Cambia chi accede a un'area. Il titolare è SEMPRE incluso (mai chiudersi fuori).
export function salvaPermessiArea(area: AreaPermessi, ruoli: ClasseRuolo[]) {
  const regole = permessiAzienda();
  regole[area] = Array.from(new Set<ClasseRuolo>(["titolare", ...ruoli]));
  db().prepare("UPDATE aziende SET permessi = ?, updated_at = ? WHERE tenant_id = ?").run(JSON.stringify(regole), nowISO(), T());
  return regole;
}

// Il controllo usato da dispatch e route: l'utente corrente può toccare l'area?
// Senza azienda o senza utente (canali di sistema: cron, proattiva) → libero.
export function permessoArea(area: AreaPermessi, utenteId?: number | null): { ok: boolean; ammessi: ClasseRuolo[] } {
  const regole = permessiAzienda();
  const ammessi = regole[area];
  if (!getAzienda() || !utenteId) return { ok: true, ammessi };
  const u = db().prepare("SELECT ruolo FROM utenti WHERE id = ?").get(utenteId) as { ruolo: string | null } | undefined;
  return { ok: ammessi.includes(classeRuolo(u?.ruolo)), ammessi };
}

// ── STAFFETTA DEL TEAM: messaggi interni fra colleghi ─────────────────────────
// "Di' a Marco che…" → il messaggio aspetta il destinatario e ORION glielo
// consegna a voce appena apre ORION (più una push mirata subito).

export type MessaggioTeam = {
  id: number;
  da_utente_id: number | null;
  da_nome: string | null;
  per_nome: string | null;
  per_utente_id: number | null;
  per_reparto: string | null;
  testo: string;
  urgente: number;
  consegnato: number;
  created_at: string;
};

// Da un nome parlato ("Marco", "la Bianchi") all'account ORION del collega:
// prima l'organigramma (dove il collegamento persona→utente è esplicito), poi
// i nomi degli account del tenant. null = persona nota ma senza account (ok:
// il messaggio resta agganciato al nome e si risolve alla lettura).
export function utenteIdPerNome(nome: string): number | null {
  const q = `%${nome.trim().toLowerCase()}%`;
  const org = db()
    .prepare(
      "SELECT utente_id FROM organico WHERE tenant_id = ? AND attivo = 1 AND utente_id IS NOT NULL AND LOWER(nome) LIKE ? LIMIT 1"
    )
    .get(T(), q) as { utente_id: number } | undefined;
  if (org) return org.utente_id;
  const u = db()
    .prepare("SELECT id FROM utenti WHERE tenant_id = ? AND nome IS NOT NULL AND LOWER(nome) LIKE ? LIMIT 1")
    .get(T(), q) as { id: number } | undefined;
  return u?.id ?? null;
}

export function lasciaMessaggioTeam(m: {
  daUtenteId?: number | null;
  daNome?: string | null;
  perNome?: string | null;
  perReparto?: string | null;
  testo: string;
  urgente?: boolean;
}): MessaggioTeam {
  const perUtenteId = m.perNome ? utenteIdPerNome(m.perNome) : null;
  const r = db()
    .prepare(
      `INSERT INTO messaggi_team (tenant_id, da_utente_id, da_nome, per_nome, per_utente_id, per_reparto, testo, urgente, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      T(),
      m.daUtenteId ?? null,
      m.daNome ?? null,
      m.perNome ?? null,
      perUtenteId,
      m.perReparto ?? null,
      m.testo,
      m.urgente ? 1 : 0,
      nowISO()
    );
  return db().prepare("SELECT * FROM messaggi_team WHERE id = ?").get(Number(r.lastInsertRowid)) as MessaggioTeam;
}

// I messaggi che aspettano QUESTA persona: indirizzati al suo account, al suo
// reparto, o al suo nome (lasciati prima che avesse l'account o senza aggancio).
export function messaggiTeamPerUtente(utenteId: number): MessaggioTeam[] {
  const u = db().prepare("SELECT nome, reparto FROM utenti WHERE id = ?").get(utenteId) as
    | { nome: string | null; reparto: string | null }
    | undefined;
  const nome = (u?.nome ?? "").trim().toLowerCase();
  const reparto = (u?.reparto ?? "").trim().toLowerCase();
  return db()
    .prepare(
      `SELECT * FROM messaggi_team WHERE tenant_id = ? AND consegnato = 0 AND da_utente_id IS NOT ?
       AND (
         per_utente_id = ?
         OR (per_reparto IS NOT NULL AND ? != '' AND LOWER(per_reparto) = ?)
         OR (per_utente_id IS NULL AND per_nome IS NOT NULL AND ? != ''
             AND (INSTR(?, LOWER(per_nome)) > 0 OR INSTR(LOWER(per_nome), ?) > 0))
       )
       ORDER BY urgente DESC, created_at ASC`
    )
    .all(T(), utenteId, utenteId, reparto, reparto, nome, nome, nome) as MessaggioTeam[];
}

export function segnaMessaggiTeamConsegnati(ids: number[]) {
  if (!ids.length) return;
  const marca = db().prepare("UPDATE messaggi_team SET consegnato = 1, consegnato_at = ? WHERE tenant_id = ? AND id = ?");
  for (const id of ids) marca.run(nowISO(), T(), id);
}

// ── APPROVAZIONI: richiesta → sì/no → esito a chi ha chiesto ─────────────────
// Le regole operative ("un preventivo oltre 500€ va approvato") diventano un
// flusso vero fra persone, con ORION che fa da tramite in entrambe le direzioni.

export type Approvazione = {
  id: number;
  da_utente_id: number | null;
  da_nome: string | null;
  a_nome: string | null;
  a_utente_id: number | null;
  richiesta: string;
  riferimento: string | null;
  urgente: number;
  stato: "in_attesa" | "approvata" | "negata" | "annullata";
  nota_esito: string | null;
  deciso_da: string | null;
  esito_comunicato: number;
  created_at: string;
  deciso_at: string | null;
};

// Il titolare del tenant (per le richieste senza destinatario esplicito).
export function titolareDelTenant(): { id: number; nome: string | null } | null {
  const utenti = db().prepare("SELECT id, nome, ruolo FROM utenti WHERE tenant_id = ?").all(T()) as {
    id: number;
    nome: string | null;
    ruolo: string | null;
  }[];
  const tit = utenti.find((u) => classeRuolo(u.ruolo) === "titolare");
  return tit ? { id: tit.id, nome: tit.nome } : null;
}

export function chiediApprovazione(a: {
  daUtenteId?: number | null;
  daNome?: string | null;
  aNome?: string | null; // vuoto → il titolare
  richiesta: string;
  riferimento?: string | null;
  urgente?: boolean;
}): Approvazione {
  let aNome = a.aNome?.trim() || null;
  let aUtenteId = aNome ? utenteIdPerNome(aNome) : null;
  if (!aNome) {
    const tit = titolareDelTenant();
    aUtenteId = tit?.id ?? null;
    aNome = tit?.nome ?? "il titolare";
  }
  const r = db()
    .prepare(
      `INSERT INTO approvazioni (tenant_id, da_utente_id, da_nome, a_nome, a_utente_id, richiesta, riferimento, urgente, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(T(), a.daUtenteId ?? null, a.daNome ?? null, aNome, aUtenteId, a.richiesta, a.riferimento ?? null, a.urgente ? 1 : 0, nowISO());
  return db().prepare("SELECT * FROM approvazioni WHERE id = ?").get(Number(r.lastInsertRowid)) as Approvazione;
}

// Le richieste che aspettano LA MIA decisione: indirizzate a me, oppure senza
// destinatario risolto se sono un titolare (le raccolgo io).
export function approvazioniPerMe(utenteId: number): Approvazione[] {
  const u = db().prepare("SELECT ruolo FROM utenti WHERE id = ?").get(utenteId) as { ruolo: string | null } | undefined;
  const sonoTitolare = classeRuolo(u?.ruolo) === "titolare";
  return db()
    .prepare(
      `SELECT * FROM approvazioni WHERE tenant_id = ? AND stato = 'in_attesa' AND da_utente_id IS NOT ?
       AND (a_utente_id = ? OR (a_utente_id IS NULL AND ?))
       ORDER BY urgente DESC, created_at ASC`
    )
    .all(T(), utenteId, utenteId, sonoTitolare ? 1 : 0) as Approvazione[];
}

// Gli esiti delle MIE richieste non ancora comunicati (da consegnare a voce).
export function esitiApprovazioniDaComunicare(utenteId: number): Approvazione[] {
  return db()
    .prepare(
      `SELECT * FROM approvazioni WHERE tenant_id = ? AND da_utente_id = ?
       AND stato IN ('approvata','negata') AND esito_comunicato = 0 ORDER BY deciso_at ASC`
    )
    .all(T(), utenteId) as Approvazione[];
}

export function segnaEsitiComunicati(ids: number[]) {
  if (!ids.length) return;
  const marca = db().prepare("UPDATE approvazioni SET esito_comunicato = 1 WHERE tenant_id = ? AND id = ?");
  for (const id of ids) marca.run(T(), id);
}

// Decide una richiesta. Può farlo il destinatario o un titolare; ritorna null
// se la richiesta non esiste o chi decide non è autorizzato.
export function decidiApprovazione(
  id: number,
  d: { esito: "approvata" | "negata"; nota?: string | null; decisoDaId: number }
): Approvazione | null {
  const a = db().prepare("SELECT * FROM approvazioni WHERE tenant_id = ? AND id = ?").get(T(), id) as Approvazione | undefined;
  if (!a || a.stato !== "in_attesa") return null;
  const u = db().prepare("SELECT nome, ruolo FROM utenti WHERE id = ?").get(d.decisoDaId) as
    | { nome: string | null; ruolo: string | null }
    | undefined;
  const autorizzato = a.a_utente_id === d.decisoDaId || classeRuolo(u?.ruolo) === "titolare";
  if (!autorizzato) return null;
  db()
    .prepare("UPDATE approvazioni SET stato = ?, nota_esito = ?, deciso_da = ?, deciso_at = ? WHERE tenant_id = ? AND id = ?")
    .run(d.esito, d.nota ?? null, u?.nome ?? null, nowISO(), T(), id);
  return db().prepare("SELECT * FROM approvazioni WHERE id = ?").get(id) as Approvazione;
}

export function listApprovazioni(opts: { soloAttese?: boolean } = {}): Approvazione[] {
  return db()
    .prepare(
      `SELECT * FROM approvazioni WHERE tenant_id = ?${opts.soloAttese ? " AND stato = 'in_attesa'" : ""}
       ORDER BY created_at DESC LIMIT 50`
    )
    .all(T()) as Approvazione[];
}

// ── GIORNALE DI BORDO: cosa è successo oggi in azienda ───────────────────────
// Aggrega ciò che ORION già registra (eventi, compiti, consegne, approvazioni,
// appuntamenti) nella cronaca di UNA giornata. Niente importi: non è finanza.
export function giornaleDiBordo(giorno?: string) {
  const g = (giorno ?? new Date().toISOString()).slice(0, 10);
  const t = T();
  const eventi = db()
    .prepare("SELECT tipo, soggetto, descrizione, created_at FROM eventi WHERE tenant_id = ? AND substr(created_at,1,10) = ? ORDER BY created_at ASC LIMIT 200")
    .all(t, g) as { tipo: string; soggetto: string | null; descrizione: string; created_at: string }[];
  const compitiChiusi = db()
    .prepare("SELECT titolo, assegnatario FROM compiti WHERE tenant_id = ? AND stato = 'completato' AND substr(updated_at,1,10) = ? ORDER BY updated_at ASC")
    .all(t, g) as { titolo: string; assegnatario: string | null }[];
  const compitiNuovi = db()
    .prepare("SELECT titolo, assegnatario, scadenza FROM compiti WHERE tenant_id = ? AND substr(created_at,1,10) = ? ORDER BY created_at ASC")
    .all(t, g) as { titolo: string; assegnatario: string | null; scadenza: string | null }[];
  const consegne = db()
    .prepare("SELECT reparto, da_nome, completato, in_sospeso, problemi FROM consegne WHERE tenant_id = ? AND substr(created_at,1,10) = ? ORDER BY created_at ASC")
    .all(t, g) as { reparto: string | null; da_nome: string | null; completato: string | null; in_sospeso: string | null; problemi: string | null }[];
  const approvazioni = db()
    .prepare("SELECT richiesta, da_nome, stato, deciso_da FROM approvazioni WHERE tenant_id = ? AND ((deciso_at IS NOT NULL AND substr(deciso_at,1,10) = ?) OR substr(created_at,1,10) = ?) ORDER BY created_at ASC")
    .all(t, g, g) as { richiesta: string; da_nome: string | null; stato: string; deciso_da: string | null }[];
  const appuntamenti = listAppuntamenti(g, g);
  return { giorno: g, eventi, compitiChiusi, compitiNuovi, consegne, approvazioni, appuntamenti: appuntamenti.length };
}

// Briefing intelligente SCOPED sul ruolo/reparto di chi apre ORION in azienda.
export function briefingAzienda(ruolo?: string | null, reparto?: string | null) {
  const oggi = new Date().toISOString().slice(0, 10);
  const classe = classeRuolo(ruolo);
  const appuntamenti = listAppuntamenti(oggi, oggi);
  const daSeguire = compitiDaSeguire();
  const consegna = ultimaConsegna(reparto);

  let compitiRilevanti: Compito[];
  if (classe === "operatore" && reparto) compitiRilevanti = listCompiti({ reparto, soloAttivi: true });
  else if (classe === "responsabile" && reparto) compitiRilevanti = listCompiti({ reparto, soloAttivi: true });
  else compitiRilevanti = listCompiti({ soloAttivi: true });

  return {
    classe,
    ruolo: ruolo ?? null,
    reparto: reparto ?? null,
    data: oggi,
    appuntamenti,
    compiti: compitiRilevanti,
    compitiDaSeguire: daSeguire,
    consegna: consegna ?? null,
    procedure: recallMemoria({ categorie: ["procedura"], limite: 6 }),
    triage: triagePriorita(),
  };
}

// Triage: aggrega i pendenti in fasce di urgenza (urgente|importante|normale).
export function triagePriorita() {
  const t = T();
  const oggi = new Date().toISOString().slice(0, 10);
  const tra3 = new Date();
  tra3.setDate(tra3.getDate() + 3);
  const a3 = tra3.toISOString().slice(0, 10);

  const compitiRitardo = compitiDaSeguire().length;
  const scadenzeVicine = (
    db()
      .prepare("SELECT COUNT(*) n FROM compiti WHERE tenant_id = ? AND stato NOT IN ('completato','annullato') AND scadenza IS NOT NULL AND substr(scadenza,1,10) BETWEEN ? AND ?")
      .get(t, oggi, a3) as { n: number }
  ).n;
  const msgDaRispondere = (
    db()
      .prepare("SELECT COUNT(*) n FROM comunicazioni WHERE tenant_id = ? AND direzione = 'in' AND substr(created_at,1,10) = ?")
      .get(t, oggi) as { n: number }
  ).n;
  const pagamentiSospesi = (
    db().prepare("SELECT COUNT(*) n FROM pagamenti WHERE tenant_id = ? AND stato = 'da_incassare'").get(t) as { n: number }
  ).n;

  const urgente = compitiRitardo;
  const importante = scadenzeVicine + pagamentiSospesi;
  const normale = msgDaRispondere;
  return {
    urgente,
    importante,
    normale,
    totale: urgente + importante + normale,
    dettaglio: { compitiInRitardo: compitiRitardo, scadenzeVicine, messaggiDaRispondere: msgDaRispondere, pagamentiSospesi },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ECOSISTEMA COGNITIVO: registro dei sistemi esterni + modello unificato
// ════════════════════════════════════════════════════════════════════════════

export type Connessione = {
  id: number;
  tenant_id: number;
  tipo: string;
  nome: string;
  descrizione: string | null;
  regole: string | null;
  modalita: string; // 'descritto' | 'ingest'
  apertura: string | null; // nome app o URL, per aprirlo al mattino
  token: string | null;
  autorizzato: number;
  attivo: number;
  created_at: string;
  updated_at: string;
};

export type EntitaEsterna = {
  id: number;
  tenant_id: number;
  connessione_id: number | null;
  tipo: string;
  chiave_esterna: string | null;
  titolo: string | null;
  dati: string | null;
  cliente_id: number | null;
  organico_id: number | null;
  riferimento: string | null;
  aggiornato_at: string | null;
  created_at: string;
  sistema_nome?: string; // join, comodità per le viste
};

function generaTokenIngest(): string {
  const alfabeto = "abcdefghijklmnopqrstuvwxyz0123456789";
  let t = "";
  for (let i = 0; i < 32; i++) t += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return t;
}

export function listConnessioni(): Connessione[] {
  return db()
    .prepare("SELECT * FROM connessioni WHERE tenant_id = ? AND attivo = 1 ORDER BY tipo, nome COLLATE NOCASE")
    .all(T()) as Connessione[];
}

export function getConnessione(id: number): Connessione | undefined {
  return db().prepare("SELECT * FROM connessioni WHERE id = ? AND tenant_id = ?").get(id, T()) as Connessione | undefined;
}

export function trovaConnessionePerToken(token: string): Connessione | undefined {
  return db().prepare("SELECT * FROM connessioni WHERE token = ? AND attivo = 1").get(token) as Connessione | undefined;
}

const CAMPI_CONNESSIONE = ["tipo", "nome", "descrizione", "regole", "modalita", "apertura", "autorizzato"] as const;

// Il gestionale che è la FONTE del tenant (per la routine del mattino: ORION lo
// apre e lo guarda). Restituisce nome + come aprirlo, o null se ORION è la fonte.
export function gestionaleFonte(): { nome: string; apertura: string | null } | null {
  const p = getProfilo();
  if (!p || (p.fonte_dati ?? "orion") !== "gestionale" || !p.fonte_connessione_id) return null;
  const c = getConnessione(p.fonte_connessione_id);
  return c ? { nome: c.nome, apertura: c.apertura ?? null } : null;
}

// Registra (o aggiorna, se stesso nome) un sistema esterno. Se modalita='ingest'
// e non c'è ancora un token, ne genera uno (per il webhook).
export function registraConnessione(c: Record<string, unknown> & { nome: string }): Connessione {
  const now = nowISO();
  const esistente = c.id
    ? getConnessione(Number(c.id))
    : (db().prepare("SELECT * FROM connessioni WHERE tenant_id = ? AND attivo = 1 AND nome LIKE ?").get(T(), String(c.nome)) as Connessione | undefined);
  let id: number;
  if (esistente) {
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const k of CAMPI_CONNESSIONE) {
      if (k in c && c[k] !== undefined && c[k] !== null) {
        updates.push(`${k} = ?`);
        values.push(c[k]);
      }
    }
    updates.push("updated_at = ?");
    values.push(now, esistente.id, T());
    db().prepare(`UPDATE connessioni SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`).run(...values);
    id = esistente.id;
  } else {
    const r = db()
      .prepare(
        `INSERT INTO connessioni (tenant_id, tipo, nome, descrizione, regole, modalita, autorizzato, attivo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(T(), (c.tipo as string) ?? "altro", String(c.nome), (c.descrizione as string) ?? null, (c.regole as string) ?? null, (c.modalita as string) ?? "descritto", c.autorizzato === false ? 0 : 1, now, now);
    id = Number(r.lastInsertRowid);
  }
  // Garantisci un token se serve l'ingest.
  const conn = getConnessione(id)!;
  if (conn.modalita === "ingest" && !conn.token) {
    db().prepare("UPDATE connessioni SET token = ?, updated_at = ? WHERE id = ?").run(generaTokenIngest(), now, id);
  }
  return getConnessione(id)!;
}

// ── Modello unificato: entità esterne ─────────────────────────────────────────

export function listEntitaEsterne(limite = 30): EntitaEsterna[] {
  return db()
    .prepare(
      `SELECT e.*, c.nome AS sistema_nome FROM entita_esterne e
       LEFT JOIN connessioni c ON c.id = e.connessione_id
       WHERE e.tenant_id = ? ORDER BY COALESCE(e.aggiornato_at, e.created_at) DESC LIMIT ?`
    )
    .all(T(), limite) as EntitaEsterna[];
}

export function entitaPerCliente(clienteId: number): EntitaEsterna[] {
  return db()
    .prepare(
      `SELECT e.*, c.nome AS sistema_nome FROM entita_esterne e
       LEFT JOIN connessioni c ON c.id = e.connessione_id
       WHERE e.tenant_id = ? AND e.cliente_id = ? ORDER BY COALESCE(e.aggiornato_at, e.created_at) DESC`
    )
    .all(T(), clienteId) as EntitaEsterna[];
}

// Inserisce o aggiorna (dedup per connessione + chiave_esterna) un record esterno,
// AGGANCIANDOLO da solo al cliente giusto quando possibile (telefono → email →
// nome univoco: dal più affidabile al meno) e a una catena (riferimento).
// È il cuore dell'ecosistema: il gestionale spinge i record e ORION li ritrova
// già dentro la scheda del cliente, senza lavoro manuale.
export function upsertEntitaEsterna(e: {
  connessione_id: number;
  tipo?: string;
  chiave_esterna?: string | null;
  titolo?: string | null;
  dati?: unknown;
  cliente_nome?: string | null;
  cliente_telefono?: string | null;
  cliente_email?: string | null;
  cliente_id?: number | null;
  riferimento?: string | null;
}): EntitaEsterna {
  const now = nowISO();
  const datiStr = e.dati == null ? null : typeof e.dati === "string" ? e.dati : JSON.stringify(e.dati);
  // Collega al cliente: id esplicito → telefono → email → nome (1 solo risultato).
  let cliente_id = e.cliente_id ?? null;
  if (!cliente_id && e.cliente_telefono) {
    cliente_id = getClienteByTelefono(String(e.cliente_telefono))?.id ?? null;
  }
  if (!cliente_id && e.cliente_email) {
    cliente_id = getClienteByEmail(String(e.cliente_email))?.id ?? null;
  }
  if (!cliente_id && e.cliente_nome) {
    const found = cercaCliente(String(e.cliente_nome));
    if (found.length === 1) cliente_id = found[0].id;
  }
  const esistente =
    e.chiave_esterna != null
      ? (db()
          .prepare("SELECT * FROM entita_esterne WHERE tenant_id = ? AND connessione_id = ? AND chiave_esterna = ?")
          .get(T(), e.connessione_id, e.chiave_esterna) as EntitaEsterna | undefined)
      : undefined;
  if (esistente) {
    db()
      .prepare(
        `UPDATE entita_esterne SET tipo = COALESCE(?, tipo), titolo = COALESCE(?, titolo), dati = COALESCE(?, dati),
         cliente_id = COALESCE(?, cliente_id), riferimento = COALESCE(?, riferimento), aggiornato_at = ? WHERE id = ?`
      )
      .run(e.tipo ?? null, e.titolo ?? null, datiStr, cliente_id, e.riferimento ?? null, now, esistente.id);
    return db().prepare("SELECT * FROM entita_esterne WHERE id = ?").get(esistente.id) as EntitaEsterna;
  }
  const r = db()
    .prepare(
      `INSERT INTO entita_esterne (tenant_id, connessione_id, tipo, chiave_esterna, titolo, dati, cliente_id, riferimento, aggiornato_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(T(), e.connessione_id, e.tipo ?? "altro", e.chiave_esterna ?? null, e.titolo ?? null, datiStr, cliente_id, e.riferimento ?? null, now, now);
  return db().prepare("SELECT * FROM entita_esterne WHERE id = ?").get(Number(r.lastInsertRowid)) as EntitaEsterna;
}

// ── SPECCHIO VIVO DEL GESTIONALE: sync dei dati CORE (clienti + appuntamenti) ──
// A differenza di entita_esterne (arricchimento della scheda), qui il gestionale
// alimenta DIRETTAMENTE ciò che ORION mostra in agenda/briefing/clienti. Idempotente
// (dedup per connessione+chiave, ripush = aggiorna), con ADOZIONE di un record locale
// già esistente (telefono→email) così non si creano doppioni, e cancellazione SICURA
// (solo su record nati da quella connessione).

const CAMPI_CLIENTE_SYNC = ["nome", "telefono", "email", "note", "piva", "codice_fiscale", "indirizzo", "cap", "comune", "provincia"] as const;

export function upsertClienteEsterno(e: {
  connessione_id: number;
  chiave: string;
  nome?: string | null;
  telefono?: string | null;
  email?: string | null;
  note?: string | null;
  piva?: string | null;
  codice_fiscale?: string | null;
  indirizzo?: string | null;
  cap?: string | null;
  comune?: string | null;
  provincia?: string | null;
  cancellato?: boolean;
}): { azione: "creato" | "aggiornato" | "cancellato" | "ignorato"; cliente?: Cliente } {
  const t = T();
  const now = nowISO();
  let esistente = db()
    .prepare("SELECT * FROM clienti WHERE tenant_id = ? AND origine_connessione_id = ? AND origine_chiave = ?")
    .get(t, e.connessione_id, e.chiave) as Cliente | undefined;
  // Adozione: un cliente già in ORION (importato o creato a voce) con lo stesso
  // telefono/email diventa lo stesso record, non un doppione.
  if (!esistente && e.telefono) esistente = getClienteByTelefono(String(e.telefono));
  if (!esistente && e.email) esistente = getClienteByEmail(String(e.email));

  if (e.cancellato) {
    if (esistente && esistente.origine_connessione_id === e.connessione_id) {
      db().prepare("DELETE FROM clienti WHERE id = ? AND tenant_id = ?").run(esistente.id, t);
      return { azione: "cancellato" };
    }
    return { azione: "ignorato" };
  }

  if (esistente) {
    // Il gestionale è la fonte: sovrascrive i campi FORNITI (COALESCE mantiene i
    // vecchi per quelli non passati). Timbra sempre provenienza e freschezza.
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const k of CAMPI_CLIENTE_SYNC) {
      if (e[k] !== undefined && e[k] !== null) {
        sets.push(`${k} = ?`);
        vals.push(e[k]);
      }
    }
    sets.push("origine_connessione_id = ?", "origine_chiave = ?", "sincronizzato_at = ?");
    vals.push(e.connessione_id, e.chiave, now, esistente.id, t);
    db().prepare(`UPDATE clienti SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`).run(...vals);
    return { azione: "aggiornato", cliente: getCliente(esistente.id) };
  }

  const nuovo = creaCliente({
    nome: (e.nome ?? e.telefono ?? `Cliente ${e.chiave}`).slice(0, 120),
    telefono: e.telefono ?? undefined,
    email: e.email ?? undefined,
    note: e.note ?? undefined,
    piva: e.piva ?? undefined,
    codice_fiscale: e.codice_fiscale ?? undefined,
    indirizzo: e.indirizzo ?? undefined,
    cap: e.cap ?? undefined,
    comune: e.comune ?? undefined,
    provincia: e.provincia ?? undefined,
  });
  db()
    .prepare("UPDATE clienti SET origine_connessione_id = ?, origine_chiave = ?, sincronizzato_at = ? WHERE id = ?")
    .run(e.connessione_id, e.chiave, now, nuovo.id);
  return { azione: "creato", cliente: getCliente(nuovo.id) };
}

// Risolve il cliente di un appuntamento sincronizzato: chiave gestionale →
// telefono → email → nome univoco. Restituisce l'id o null.
function risolviClienteSync(e: {
  connessione_id: number;
  cliente_chiave?: string | null;
  cliente_telefono?: string | null;
  cliente_email?: string | null;
  cliente_nome?: string | null;
}): number | null {
  if (e.cliente_chiave) {
    const c = db()
      .prepare("SELECT id FROM clienti WHERE tenant_id = ? AND origine_connessione_id = ? AND origine_chiave = ?")
      .get(T(), e.connessione_id, e.cliente_chiave) as { id: number } | undefined;
    if (c) return c.id;
  }
  if (e.cliente_telefono) {
    const c = getClienteByTelefono(String(e.cliente_telefono));
    if (c) return c.id;
  }
  if (e.cliente_email) {
    const c = getClienteByEmail(String(e.cliente_email));
    if (c) return c.id;
  }
  if (e.cliente_nome) {
    const found = cercaCliente(String(e.cliente_nome));
    if (found.length === 1) return found[0].id;
  }
  return null;
}

export function upsertAppuntamentoEsterno(e: {
  connessione_id: number;
  chiave: string;
  cliente_chiave?: string | null;
  cliente_nome?: string | null;
  cliente_telefono?: string | null;
  cliente_email?: string | null;
  titolo?: string | null;
  inizio?: string | null;
  fine?: string | null;
  durata_min?: number | null;
  stato?: string | null;
  note?: string | null;
  cancellato?: boolean;
}): { azione: "creato" | "aggiornato" | "cancellato" | "ignorato"; appuntamento?: Appuntamento } {
  const t = T();
  const now = nowISO();
  const esistente = db()
    .prepare("SELECT * FROM appuntamenti WHERE tenant_id = ? AND origine_connessione_id = ? AND origine_chiave = ?")
    .get(t, e.connessione_id, e.chiave) as Appuntamento | undefined;

  if (e.cancellato) {
    if (esistente && esistente.origine_connessione_id === e.connessione_id) {
      db().prepare("DELETE FROM appuntamenti WHERE id = ? AND tenant_id = ?").run(esistente.id, t);
      return { azione: "cancellato" };
    }
    return { azione: "ignorato" };
  }

  const cliente_id = risolviClienteSync(e);
  // Calcola la fine: esplicita, oppure inizio + durata (default 60').
  const calcolaFine = (inizio: string): string => {
    if (e.fine) return e.fine;
    const d = new Date(inizio);
    d.setMinutes(d.getMinutes() + (e.durata_min && e.durata_min > 0 ? e.durata_min : 60));
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  if (esistente) {
    const inizio = e.inizio ?? esistente.inizio;
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (e.titolo != null) { sets.push("titolo = ?"); vals.push(e.titolo); }
    if (e.inizio != null) { sets.push("inizio = ?", "fine = ?"); vals.push(inizio, calcolaFine(inizio)); }
    else if (e.fine != null) { sets.push("fine = ?"); vals.push(e.fine); }
    if (e.stato != null) { sets.push("stato = ?"); vals.push(e.stato); }
    if (e.note != null) { sets.push("note = ?"); vals.push(e.note); }
    if (cliente_id != null) { sets.push("cliente_id = ?"); vals.push(cliente_id); }
    sets.push("origine_connessione_id = ?", "origine_chiave = ?", "sincronizzato_at = ?");
    vals.push(e.connessione_id, e.chiave, now, esistente.id, t);
    db().prepare(`UPDATE appuntamenti SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`).run(...vals);
    return { azione: "aggiornato", appuntamento: getAppuntamento(esistente.id) };
  }

  if (!e.inizio) return { azione: "ignorato" }; // un nuovo appuntamento senza data non ha senso
  const r = db()
    .prepare(
      `INSERT INTO appuntamenti (tenant_id, cliente_id, titolo, inizio, fine, stato, note, origine_connessione_id, origine_chiave, sincronizzato_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      t, cliente_id, (e.titolo ?? e.cliente_nome ?? "Appuntamento").slice(0, 160),
      e.inizio, calcolaFine(e.inizio), e.stato ?? "confermato", e.note ?? null,
      e.connessione_id, e.chiave, now, now
    );
  return { azione: "creato", appuntamento: getAppuntamento(Number(r.lastInsertRowid)) };
}

// Stato della fonte di verità del tenant, per la riga di freschezza dei pannelli.
// modo 'orion' = ORION è il gestionale; 'gestionale' = specchio vivo di 'sistema'.
export function statoFonte(): { modo: "orion" | "gestionale"; sistema: string | null; aggiornato_at: string | null } {
  const p = getProfilo();
  const connId = p?.fonte_connessione_id ?? null;
  if (!connId || (p?.fonte_dati ?? "orion") === "orion") {
    return { modo: "orion", sistema: null, aggiornato_at: null };
  }
  const conn = getConnessione(connId);
  return { modo: "gestionale", sistema: conn?.nome ?? null, aggiornato_at: ultimaSincronizzazione(connId) };
}

// Freschezza: quando ORION è stato allineato l'ultima volta a una connessione
// (o a qualunque, se non specificata). Alimenta la riga "aggiornato alle … da …".
export function ultimaSincronizzazione(connessione_id?: number): string | null {
  const t = T();
  const clausola = connessione_id ? "AND origine_connessione_id = ?" : "AND origine_connessione_id IS NOT NULL";
  const args = connessione_id ? [t, connessione_id, t, connessione_id] : [t, t];
  const row = db()
    .prepare(
      `SELECT MAX(x) AS ultimo FROM (
         SELECT MAX(sincronizzato_at) AS x FROM clienti WHERE tenant_id = ? ${clausola}
         UNION ALL
         SELECT MAX(sincronizzato_at) AS x FROM appuntamenti WHERE tenant_id = ? ${clausola}
       )`
    )
    .get(...args) as { ultimo: string | null } | undefined;
  return row?.ultimo ?? null;
}

// ── Clienti ─────────────────────────────────────────────────────────────────

export function listClienti(): Cliente[] {
  return db()
    .prepare("SELECT * FROM clienti WHERE tenant_id = ? ORDER BY nome COLLATE NOCASE")
    .all(T()) as Cliente[];
}

export function getCliente(id: number): Cliente | undefined {
  return db().prepare("SELECT * FROM clienti WHERE id = ? AND tenant_id = ?").get(id, T()) as
    | Cliente
    | undefined;
}

export function cercaCliente(q: string): Cliente[] {
  return db()
    .prepare(
      "SELECT * FROM clienti WHERE tenant_id = ? AND (nome LIKE ? OR telefono LIKE ?) ORDER BY nome COLLATE NOCASE LIMIT 10"
    )
    .all(T(), `%${q}%`, `%${q}%`) as Cliente[];
}

export function getClienteByTelefono(telefono: string): Cliente | undefined {
  const ultime = telefono.replace(/\D/g, "").slice(-9);
  if (!ultime) return undefined;
  const tutti = db()
    .prepare("SELECT * FROM clienti WHERE tenant_id = ? AND telefono IS NOT NULL")
    .all(T()) as Cliente[];
  return tutti.find((c) => (c.telefono ?? "").replace(/\D/g, "").endsWith(ultime));
}

export function getClienteByEmail(email: string): Cliente | undefined {
  const e = email.trim().toLowerCase();
  if (!e) return undefined;
  return db()
    .prepare("SELECT * FROM clienti WHERE tenant_id = ? AND LOWER(email) = ?")
    .get(T(), e) as Cliente | undefined;
}

export function creaCliente(c: Partial<Cliente> & { nome: string }): Cliente {
  const r = db()
    .prepare(
      `INSERT INTO clienti (tenant_id, nome, telefono, email, note, piva, codice_fiscale, indirizzo, cap, comune, provincia, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      T(), c.nome, c.telefono ?? null, c.email ?? null, c.note ?? null,
      c.piva ?? null, c.codice_fiscale ?? null, c.indirizzo ?? null,
      c.cap ?? null, c.comune ?? null, c.provincia ?? null, nowISO()
    );
  const cliente = getCliente(Number(r.lastInsertRowid))!;
  emettiEventoUscita("cliente_creato", ritrattoCliente(cliente));
  return cliente;
}

// Il ritratto del cliente per il canale d'uscita (chiave del gestionale inclusa).
function ritrattoCliente(c: Cliente) {
  return {
    orion_id: c.id,
    chiave_esterna: (c as unknown as { origine_chiave?: string | null }).origine_chiave ?? null,
    nome: c.nome,
    telefono: c.telefono ?? null,
    email: c.email ?? null,
  };
}

export function aggiornaCliente(id: number, c: Partial<Cliente>): Cliente | undefined {
  const campi = ["nome", "telefono", "email", "note", "piva", "codice_fiscale", "indirizzo", "cap", "comune", "provincia"] as const;
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const k of campi) {
    if (k in c && c[k] !== undefined) {
      updates.push(`${k} = ?`);
      values.push(c[k]);
    }
  }
  if (updates.length) {
    values.push(id, T());
    db().prepare(`UPDATE clienti SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`).run(...values);
    const cliente = getCliente(id);
    if (cliente) emettiEventoUscita("cliente_aggiornato", ritrattoCliente(cliente));
    return cliente;
  }
  return getCliente(id);
}

export function schedaCliente(id: number) {
  const cliente = getCliente(id);
  if (!cliente) return null;
  const t = T();
  const appuntamenti = db()
    .prepare("SELECT * FROM appuntamenti WHERE cliente_id = ? AND tenant_id = ? ORDER BY inizio DESC LIMIT 10")
    .all(id, t) as Appuntamento[];
  const pagamenti = db()
    .prepare("SELECT * FROM pagamenti WHERE cliente_id = ? AND tenant_id = ? ORDER BY data DESC LIMIT 10")
    .all(id, t) as Pagamento[];
  const comunicazioni = db()
    .prepare("SELECT * FROM comunicazioni WHERE cliente_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 10")
    .all(id, t) as Comunicazione[];
  const note = db()
    .prepare("SELECT * FROM note WHERE cliente_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 10")
    .all(id, t) as Nota[];
  const totaleIncassato = pagamenti
    .filter((p) => p.stato === "incassato")
    .reduce((s, p) => s + p.importo, 0);
  // Modello unificato: ciò che arriva dai sistemi esterni collegati a questo cliente.
  const entitaEsterne = entitaPerCliente(id);
  return { cliente, appuntamenti, pagamenti, comunicazioni, note, totaleIncassato, entitaEsterne };
}

// ── Agenda ────────────────────────────────────────────────────────────────

const APP_JOIN = `
  SELECT a.*, c.nome AS cliente_nome, c.telefono AS cliente_telefono
  FROM appuntamenti a LEFT JOIN clienti c ON c.id = a.cliente_id
`;

export function listAppuntamenti(dataDa: string, dataA: string): Appuntamento[] {
  return db()
    .prepare(
      `${APP_JOIN} WHERE a.tenant_id = ? AND substr(a.inizio,1,10) >= ? AND substr(a.inizio,1,10) <= ? AND a.stato != 'cancellato' ORDER BY a.inizio`
    )
    .all(T(), dataDa, dataA) as Appuntamento[];
}

export function getAppuntamento(id: number): Appuntamento | undefined {
  return db().prepare(`${APP_JOIN} WHERE a.id = ? AND a.tenant_id = ?`).get(id, T()) as
    | Appuntamento
    | undefined;
}

export function trovaConflitti(inizio: string, fine: string, escludiId?: number): Appuntamento[] {
  const t = T();
  return db()
    .prepare(
      `${APP_JOIN} WHERE a.tenant_id = ? AND a.stato != 'cancellato' AND a.inizio < ? AND a.fine > ? ${
        escludiId ? "AND a.id != ?" : ""
      }`
    )
    .all(...(escludiId ? [t, fine, inizio, escludiId] : [t, fine, inizio])) as Appuntamento[];
}

// ── CANALE D'USCITA: ORION scrive nel gestionale del cliente ─────────────────
// Le modifiche ad agenda/clienti vengono EMESSE (outbox, stessa transazione
// logica) e poi consegnate firmate al webhook del gestionale/Zapier (uscita.ts).
// Solo per il tenant che ha attivato il canale; l'INGRESSO (ingest) non
// ri-emette mai → nessun eco a rimbalzo.

export function connessioneUscita(): { id: number } | undefined {
  return db()
    .prepare("SELECT id FROM connessioni WHERE tenant_id = ? AND attivo = 1 AND webhook_uscita IS NOT NULL LIMIT 1")
    .get(T()) as { id: number } | undefined;
}

export function emettiEventoUscita(evento: string, payload: Record<string, unknown>) {
  const conn = connessioneUscita();
  if (!conn) return; // canale non attivo: zero costi, zero righe
  db()
    .prepare(
      `INSERT INTO eventi_uscita (tenant_id, connessione_id, evento, payload, prossimo_tentativo, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(T(), conn.id, evento, JSON.stringify(payload), nowISO(), nowISO());
}

// Attiva (o spegne, url=null) la scrittura verso un sistema collegato. Genera
// il segreto di firma HMAC che il ricevente userà per verificare l'autenticità.
export function attivaCanaleUscita(connessioneId: number, url: string | null): { segreto: string | null } {
  if (!url) {
    db()
      .prepare("UPDATE connessioni SET webhook_uscita = NULL, segreto_uscita = NULL, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .run(nowISO(), connessioneId, T());
    return { segreto: null };
  }
  const segreto = crypto.randomBytes(24).toString("hex");
  db()
    .prepare("UPDATE connessioni SET webhook_uscita = ?, segreto_uscita = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
    .run(url.trim(), cifra(segreto), nowISO(), connessioneId, T());
  return { segreto };
}

// Il ritratto dell'appuntamento che viaggia verso il gestionale: include la
// CHIAVE ESTERNA se il record è nato lì (così il sistema ritrova il suo).
function ritrattoAppuntamento(a: Appuntamento) {
  return {
    orion_id: a.id,
    chiave_esterna: (a as unknown as { origine_chiave?: string | null }).origine_chiave ?? null,
    titolo: a.titolo,
    inizio: a.inizio,
    fine: a.fine,
    stato: a.stato,
    cliente: a.cliente_nome ?? null,
    note: a.note ?? null,
  };
}

export function creaAppuntamento(a: {
  cliente_id?: number | null;
  titolo: string;
  inizio: string;
  fine: string;
  stato?: string;
  note?: string | null;
}): Appuntamento {
  const r = db()
    .prepare(
      `INSERT INTO appuntamenti (tenant_id, cliente_id, titolo, inizio, fine, stato, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(T(), a.cliente_id ?? null, a.titolo, a.inizio, a.fine, a.stato ?? "da_confermare", a.note ?? null, nowISO());
  const app = getAppuntamento(Number(r.lastInsertRowid))!;
  emettiEventoUscita("appuntamento_creato", ritrattoAppuntamento(app));
  return app;
}

export function spostaAppuntamento(id: number, inizio: string, fine: string): Appuntamento | undefined {
  // gcal_dirty: se l'appuntamento vive anche su Google Calendar, il cron lo riallinea.
  db()
    .prepare(
      "UPDATE appuntamenti SET inizio = ?, fine = ?, promemoria_inviato = 0, gcal_dirty = CASE WHEN gcal_id IS NULL THEN gcal_dirty ELSE 1 END WHERE id = ? AND tenant_id = ?"
    )
    .run(inizio, fine, id, T());
  const app = getAppuntamento(id);
  if (app) emettiEventoUscita("appuntamento_spostato", ritrattoAppuntamento(app));
  return app;
}

export function aggiornaStatoAppuntamento(id: number, stato: string): Appuntamento | undefined {
  db().prepare("UPDATE appuntamenti SET stato = ? WHERE id = ? AND tenant_id = ?").run(stato, id, T());
  const app = getAppuntamento(id);
  if (app) emettiEventoUscita("appuntamento_stato", ritrattoAppuntamento(app)); // conferme e disdette passano da qui
  return app;
}

export function eliminaAppuntamento(id: number): boolean {
  // Lapide per Google Calendar: se l'evento esiste anche là, il cron lo cancella.
  const app = getAppuntamento(id);
  if (app?.gcal_id) {
    db()
      .prepare("INSERT INTO gcal_tombstones (tenant_id, gcal_id, created_at) VALUES (?, ?, ?)")
      .run(T(), app.gcal_id, nowISO());
  }
  const fatto =
    db().prepare("UPDATE appuntamenti SET stato = 'cancellato' WHERE id = ? AND tenant_id = ?").run(id, T())
      .changes > 0;
  if (fatto && app) emettiEventoUscita("appuntamento_cancellato", ritrattoAppuntamento({ ...app, stato: "cancellato" }));
  return fatto;
}

// ── Anti no-show: promemoria automatici degli appuntamenti ──────────────────

// Appuntamenti nelle prossime `ore` ore, non cancellati, con promemoria non
// ancora inviato e cliente con numero di telefono → candidati al promemoria.
export function appuntamentiDaRicordare(ore = 24): Appuntamento[] {
  const da = new Date();
  const a = new Date(da.getTime() + ore * 3600_000);
  const iso = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return db()
    .prepare(
      `${APP_JOIN}
       WHERE a.tenant_id = ? AND a.stato NOT IN ('cancellato','annullato')
         AND a.promemoria_inviato = 0
         AND a.inizio > ? AND a.inizio <= ?
         AND c.telefono IS NOT NULL AND c.telefono != ''
       ORDER BY a.inizio`
    )
    .all(T(), iso(da), iso(a)) as Appuntamento[];
}

export function segnaPromemoriaAppuntamento(id: number) {
  db().prepare("UPDATE appuntamenti SET promemoria_inviato = 1 WHERE id = ? AND tenant_id = ?").run(id, T());
}

// Il prossimo appuntamento futuro di un cliente (per interpretare "SÌ confermo"
// / "devo disdire" che arrivano via WhatsApp).
export function prossimoAppuntamentoDiCliente(clienteId: number): Appuntamento | undefined {
  const adesso = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${adesso.getFullYear()}-${p(adesso.getMonth() + 1)}-${p(adesso.getDate())}T${p(adesso.getHours())}:${p(adesso.getMinutes())}`;
  return db()
    .prepare(
      `${APP_JOIN} WHERE a.tenant_id = ? AND a.cliente_id = ? AND a.stato NOT IN ('cancellato','annullato') AND a.inizio >= ? ORDER BY a.inizio LIMIT 1`
    )
    .get(T(), clienteId, iso) as Appuntamento | undefined;
}

// ── Note ──────────────────────────────────────────────────────────────────

export function creaNota(n: { cliente_id?: number | null; titolo?: string | null; contenuto: string }): Nota {
  const r = db()
    .prepare(`INSERT INTO note (tenant_id, cliente_id, titolo, contenuto, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(T(), n.cliente_id ?? null, n.titolo ?? null, n.contenuto, nowISO());
  return db().prepare("SELECT * FROM note WHERE id = ?").get(Number(r.lastInsertRowid)) as Nota;
}

export function listNote(): Nota[] {
  return db()
    .prepare(
      `SELECT n.*, c.nome AS cliente_nome FROM note n LEFT JOIN clienti c ON c.id = n.cliente_id WHERE n.tenant_id = ? ORDER BY n.created_at DESC LIMIT 30`
    )
    .all(T()) as Nota[];
}

// Tutte le note, senza limite (per l'export CSV: i dati escono SEMPRE interi).
export function listNoteTutte(): Nota[] {
  return db()
    .prepare(
      `SELECT n.*, c.nome AS cliente_nome FROM note n LEFT JOIN clienti c ON c.id = n.cliente_id WHERE n.tenant_id = ? ORDER BY n.created_at DESC`
    )
    .all(T()) as Nota[];
}

// ── Pagamenti / analisi economica ───────────────────────────────────────────

export function registraPagamento(p: {
  cliente_id?: number | null;
  importo: number;
  metodo: string;
  stato?: string;
  data?: string;
  descrizione?: string | null;
}): Pagamento {
  const data = p.data ?? new Date().toISOString().slice(0, 10);
  const r = db()
    .prepare(
      `INSERT INTO pagamenti (tenant_id, cliente_id, importo, metodo, stato, data, descrizione, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(T(), p.cliente_id ?? null, p.importo, p.metodo, p.stato ?? "incassato", data, p.descrizione ?? null, nowISO());
  return db()
    .prepare(
      `SELECT p.*, c.nome AS cliente_nome FROM pagamenti p LEFT JOIN clienti c ON c.id = p.cliente_id WHERE p.id = ?`
    )
    .get(Number(r.lastInsertRowid)) as Pagamento;
}

export function listPagamenti(dataDa: string, dataA: string): Pagamento[] {
  return db()
    .prepare(
      `SELECT p.*, c.nome AS cliente_nome FROM pagamenti p LEFT JOIN clienti c ON c.id = p.cliente_id
       WHERE p.tenant_id = ? AND p.data >= ? AND p.data <= ? ORDER BY p.data DESC`
    )
    .all(T(), dataDa, dataA) as Pagamento[];
}

export function analisiEconomica(dataDa: string, dataA: string) {
  const pagamenti = listPagamenti(dataDa, dataA);
  const incassato = pagamenti.filter((p) => p.stato === "incassato");
  const daIncassare = pagamenti.filter((p) => p.stato === "da_incassare");
  const totaleIncassato = incassato.reduce((s, p) => s + p.importo, 0);
  const totaleDaIncassare = daIncassare.reduce((s, p) => s + p.importo, 0);
  const perMetodo: Record<string, number> = {};
  for (const p of incassato) perMetodo[p.metodo] = (perMetodo[p.metodo] ?? 0) + p.importo;
  const perCliente: Record<string, number> = {};
  for (const p of incassato) {
    const k = p.cliente_nome ?? "Senza cliente";
    perCliente[k] = (perCliente[k] ?? 0) + p.importo;
  }
  const topClienti = Object.entries(perCliente).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, totale]) => ({ nome, totale }));
  const perGiorno: Record<string, number> = {};
  for (const p of incassato) perGiorno[p.data] = (perGiorno[p.data] ?? 0) + p.importo;
  const giornoTop = Object.entries(perGiorno).sort((a, b) => b[1] - a[1])[0];
  return {
    periodo: { da: dataDa, a: dataA },
    totaleIncassato,
    totaleDaIncassare,
    numeroPagamenti: incassato.length,
    perMetodo,
    topClienti,
    giornoPiuRedditizio: giornoTop ? { data: giornoTop[0], totale: giornoTop[1] } : null,
    daIncassare: daIncassare.map((p) => ({ cliente: p.cliente_nome ?? null, importo: p.importo, descrizione: p.descrizione, data: p.data })),
  };
}

// ── Comunicazioni (WhatsApp) ────────────────────────────────────────────────

export function logCommunication(c: {
  cliente_id?: number | null;
  direzione: "in" | "out";
  tipo?: string;
  contenuto?: string | null;
  allegato_nome?: string | null;
  allegato_url?: string | null;
  stato?: string;
}): Comunicazione {
  const r = db()
    .prepare(
      `INSERT INTO comunicazioni (tenant_id, cliente_id, direzione, canale, tipo, contenuto, allegato_nome, allegato_url, stato, created_at)
       VALUES (?, ?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?)`
    )
    .run(
      T(), c.cliente_id ?? null, c.direzione, c.tipo ?? "testo", c.contenuto ?? null,
      c.allegato_nome ?? null, c.allegato_url ?? null,
      c.stato ?? (c.direzione === "out" ? "inviato" : "ricevuto"), nowISO()
    );
  return db()
    .prepare(
      `SELECT cm.*, c.nome AS cliente_nome FROM comunicazioni cm LEFT JOIN clienti c ON c.id = cm.cliente_id WHERE cm.id = ?`
    )
    .get(Number(r.lastInsertRowid)) as Comunicazione;
}

export function listComunicazioni(clienteId?: number): Comunicazione[] {
  const base = `SELECT cm.*, c.nome AS cliente_nome FROM comunicazioni cm LEFT JOIN clienti c ON c.id = cm.cliente_id`;
  if (clienteId) {
    return db()
      .prepare(`${base} WHERE cm.tenant_id = ? AND cm.cliente_id = ? ORDER BY cm.created_at`)
      .all(T(), clienteId) as Comunicazione[];
  }
  return db().prepare(`${base} WHERE cm.tenant_id = ? ORDER BY cm.created_at DESC LIMIT 30`).all(T()) as Comunicazione[];
}

export function messaggiInArrivoDopo(iso: string): Comunicazione[] {
  return db()
    .prepare(
      `SELECT cm.*, c.nome AS cliente_nome FROM comunicazioni cm LEFT JOIN clienti c ON c.id = cm.cliente_id
       WHERE cm.tenant_id = ? AND cm.direzione = 'in' AND cm.created_at > ? ORDER BY cm.created_at`
    )
    .all(T(), iso) as Comunicazione[];
}

// ── Fatture (con fatturazione elettronica SDI) ──────────────────────────────

export type Fattura = {
  id: number;
  cliente_id: number | null;
  numero: string;
  importo: number;
  descrizione: string | null;
  stato: string;
  data: string;
  xml: string | null;
  stato_sdi: string | null; // 'da_trasmettere' | 'trasmessa' | 'consegnata' | 'scartata'
  sdi_id: string | null;
  bollo: number | null;
  created_at: string;
};

export function prossimoNumeroFattura(): string {
  const anno = new Date().getFullYear();
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM fatture WHERE tenant_id = ? AND substr(data,1,4) = ?")
    .get(T(), String(anno)) as { n: number };
  return `${row.n + 1}/${anno}`;
}

export function creaFattura(f: {
  cliente_id: number;
  importo: number;
  descrizione?: string | null;
  stato?: string;
  xml?: string | null;
  stato_sdi?: string | null;
  bollo?: number | null;
}): Fattura {
  const numero = prossimoNumeroFattura();
  const data = new Date().toISOString().slice(0, 10);
  const r = db()
    .prepare(
      `INSERT INTO fatture (tenant_id, cliente_id, numero, importo, descrizione, stato, data, xml, stato_sdi, bollo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      T(), f.cliente_id, numero, f.importo, f.descrizione ?? null, f.stato ?? "emessa", data,
      f.xml ?? null, f.stato_sdi ?? null, f.bollo ?? null, nowISO()
    );
  return db().prepare("SELECT * FROM fatture WHERE id = ?").get(Number(r.lastInsertRowid)) as Fattura;
}

export function getFattura(id: number): Fattura | undefined {
  return db().prepare("SELECT * FROM fatture WHERE id = ? AND tenant_id = ?").get(id, T()) as Fattura | undefined;
}

export function aggiornaFatturaSdi(id: number, campi: { stato_sdi?: string; sdi_id?: string | null; xml?: string | null }) {
  const updates: string[] = [];
  const values: unknown[] = [];
  if (campi.stato_sdi !== undefined) { updates.push("stato_sdi = ?"); values.push(campi.stato_sdi); }
  if (campi.sdi_id !== undefined) { updates.push("sdi_id = ?"); values.push(campi.sdi_id); }
  if (campi.xml !== undefined) { updates.push("xml = ?"); values.push(campi.xml); }
  if (!updates.length) return;
  values.push(id, T());
  db().prepare(`UPDATE fatture SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`).run(...values);
}

export function listFatture(limite = 20): Fattura[] {
  return db()
    .prepare(
      `SELECT f.*, c.nome AS cliente_nome FROM fatture f LEFT JOIN clienti c ON c.id = f.cliente_id
       WHERE f.tenant_id = ? ORDER BY f.created_at DESC LIMIT ?`
    )
    .all(T(), limite) as Fattura[];
}

// ── Promemoria ──────────────────────────────────────────────────────────────

export function creaPromemoria(p: { cliente_id?: number | null; testo: string; categoria?: string; scadenza?: string | null }): Promemoria {
  const r = db()
    .prepare(`INSERT INTO promemoria (tenant_id, cliente_id, testo, categoria, scadenza, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(T(), p.cliente_id ?? null, p.testo, p.categoria ?? "attivita", p.scadenza ?? null, nowISO());
  return db()
    .prepare(`SELECT pr.*, c.nome AS cliente_nome FROM promemoria pr LEFT JOIN clienti c ON c.id = pr.cliente_id WHERE pr.id = ?`)
    .get(Number(r.lastInsertRowid)) as Promemoria;
}

export function listPromemoria(includiCompletati = false): Promemoria[] {
  return db()
    .prepare(
      `SELECT pr.*, c.nome AS cliente_nome FROM promemoria pr LEFT JOIN clienti c ON c.id = pr.cliente_id
       WHERE pr.tenant_id = ? ${includiCompletati ? "" : "AND pr.completato = 0"} ORDER BY (pr.scadenza IS NULL), pr.scadenza, pr.created_at`
    )
    .all(T()) as Promemoria[];
}

export function completaPromemoria(id: number): boolean {
  return db().prepare("UPDATE promemoria SET completato = 1 WHERE id = ? AND tenant_id = ?").run(id, T()).changes > 0;
}

export function promemoriaDaNotificare(): Promemoria[] {
  const oggi = new Date().toISOString().slice(0, 10);
  return db()
    .prepare(
      `SELECT pr.*, c.nome AS cliente_nome FROM promemoria pr LEFT JOIN clienti c ON c.id = pr.cliente_id
       WHERE pr.tenant_id = ? AND pr.completato = 0 AND pr.notificato = 0 AND pr.scadenza IS NOT NULL AND pr.scadenza <= ?`
    )
    .all(T(), oggi) as Promemoria[];
}

export function segnaPromemoriaNotificati(ids: number[]) {
  if (!ids.length) return;
  const t = T();
  const stmt = db().prepare("UPDATE promemoria SET notificato = 1 WHERE id = ? AND tenant_id = ?");
  const tx = db().transaction((lista: number[]) => lista.forEach((id) => stmt.run(id, t)));
  tx(ids);
}

// ── Documenti ─────────────────────────────────────────────────────────────

export function creaDocumento(d: { cliente_id?: number | null; titolo: string; tipo?: string; testo?: string | null; immagine?: string | null }): Documento {
  const r = db()
    .prepare(`INSERT INTO documenti (tenant_id, cliente_id, titolo, tipo, testo, immagine, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(T(), d.cliente_id ?? null, d.titolo, d.tipo ?? "documento", d.testo ?? null, d.immagine ?? null, nowISO());
  return db()
    .prepare(`SELECT dc.*, c.nome AS cliente_nome FROM documenti dc LEFT JOIN clienti c ON c.id = dc.cliente_id WHERE dc.id = ?`)
    .get(Number(r.lastInsertRowid)) as Documento;
}

export function listDocumenti(): Documento[] {
  return db()
    .prepare(
      `SELECT dc.id, dc.cliente_id, dc.titolo, dc.tipo, dc.testo, dc.created_at, c.nome AS cliente_nome
       FROM documenti dc LEFT JOIN clienti c ON c.id = dc.cliente_id WHERE dc.tenant_id = ? ORDER BY dc.created_at DESC LIMIT 30`
    )
    .all(T()) as Documento[];
}

// Documento singolo COMPLETO (inclusa l'immagine) — per il visore foto.
export function getDocumento(id: number): Documento | undefined {
  return db()
    .prepare(
      `SELECT dc.*, c.nome AS cliente_nome FROM documenti dc LEFT JOIN clienti c ON c.id = dc.cliente_id
       WHERE dc.id = ? AND dc.tenant_id = ?`
    )
    .get(id, T()) as Documento | undefined;
}

// Cerca documenti per titolo o per nome del cliente collegato.
export function cercaDocumenti(q: string): Documento[] {
  return db()
    .prepare(
      `SELECT dc.id, dc.cliente_id, dc.titolo, dc.tipo, dc.created_at, c.nome AS cliente_nome
       FROM documenti dc LEFT JOIN clienti c ON c.id = dc.cliente_id
       WHERE dc.tenant_id = ? AND (dc.titolo LIKE ? OR c.nome LIKE ?) ORDER BY dc.created_at DESC LIMIT 10`
    )
    .all(T(), `%${q}%`, `%${q}%`) as Documento[];
}

// ── Eliminazioni (dentro ORION) ──────────────────────────────────────────────

export function eliminaDocumento(id: number): boolean {
  return db().prepare("DELETE FROM documenti WHERE id = ? AND tenant_id = ?").run(id, T()).changes > 0;
}

export function eliminaNota(id: number): boolean {
  return db().prepare("DELETE FROM note WHERE id = ? AND tenant_id = ?").run(id, T()).changes > 0;
}

export function eliminaCliente(id: number): boolean {
  return db().prepare("DELETE FROM clienti WHERE id = ? AND tenant_id = ?").run(id, T()).changes > 0;
}

// ── Lista d'attesa ──────────────────────────────────────────────────────────

export function aggiungiAttesa(v: { cliente_id?: number | null; nome: string; motivo?: string | null; priorita?: string }): VoceAttesa {
  const r = db()
    .prepare(`INSERT INTO lista_attesa (tenant_id, cliente_id, nome, motivo, priorita, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(T(), v.cliente_id ?? null, v.nome, v.motivo ?? null, v.priorita ?? "normale", nowISO());
  return db().prepare("SELECT * FROM lista_attesa WHERE id = ?").get(Number(r.lastInsertRowid)) as VoceAttesa;
}

export function listAttesa(): VoceAttesa[] {
  return db()
    .prepare("SELECT * FROM lista_attesa WHERE tenant_id = ? ORDER BY CASE priorita WHEN 'alta' THEN 0 ELSE 1 END, created_at")
    .all(T()) as VoceAttesa[];
}

export function rimuoviAttesa(id: number): boolean {
  return db().prepare("DELETE FROM lista_attesa WHERE id = ? AND tenant_id = ?").run(id, T()).changes > 0;
}

// ── Notifiche push ──────────────────────────────────────────────────────────

export function salvaSubscription(s: PushSub, utenteId?: number | null) {
  db()
    .prepare(
      `INSERT INTO push_subscriptions (tenant_id, utente_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET tenant_id = excluded.tenant_id, utente_id = excluded.utente_id, p256dh = excluded.p256dh, auth = excluded.auth`
    )
    .run(T(), utenteId ?? null, s.endpoint, s.p256dh, s.auth, nowISO());
}

// Tutte le iscrizioni del tenant, o SOLO quelle di una persona (push mirate).
export function listSubscriptions(utenteId?: number): PushSub[] {
  if (utenteId !== undefined)
    return db()
      .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE tenant_id = ? AND utente_id = ?")
      .all(T(), utenteId) as PushSub[];
  return db().prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE tenant_id = ?").all(T()) as PushSub[];
}

export function rimuoviSubscription(endpoint: string) {
  db().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

// ── Account WhatsApp del professionista (Embedded Signup, Fase 2) ────────────

export function getWhatsappAccount(): WhatsappAccount | undefined {
  return db().prepare("SELECT * FROM whatsapp_accounts WHERE tenant_id = ?").get(T()) as
    | WhatsappAccount
    | undefined;
}

// Variante esplicita (senza contesto tenant): la usa l'adapter whatsapp.ts per
// scegliere le credenziali del mittente, e il webhook per il routing.
export function getWhatsappAccountByTenant(tenantId: number): WhatsappAccount | undefined {
  return db().prepare("SELECT * FROM whatsapp_accounts WHERE tenant_id = ?").get(tenantId) as
    | WhatsappAccount
    | undefined;
}

export function salvaWhatsappAccount(a: {
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number?: string | null;
  verified_name?: string | null;
  token: string | null;
  stato?: string;
}): WhatsappAccount {
  const t = T();
  const now = nowISO();
  db()
    .prepare(
      `INSERT INTO whatsapp_accounts (tenant_id, waba_id, phone_number_id, display_phone_number, verified_name, token, stato, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET
         waba_id = excluded.waba_id,
         phone_number_id = excluded.phone_number_id,
         display_phone_number = excluded.display_phone_number,
         verified_name = excluded.verified_name,
         token = excluded.token,
         stato = excluded.stato,
         updated_at = excluded.updated_at`
    )
    .run(
      t, a.waba_id, a.phone_number_id, a.display_phone_number ?? null, a.verified_name ?? null,
      cifra(a.token), a.stato ?? "collegato", now, now
    );
  return getWhatsappAccount()!;
}

export function rimuoviWhatsappAccount(): boolean {
  return db().prepare("DELETE FROM whatsapp_accounts WHERE tenant_id = ?").run(T()).changes > 0;
}

// Routing del webhook: dal phone_number_id del numero che ha ricevuto il
// messaggio, trova il tenant proprietario. Lookup globale (non tenant-scoped).
export function tenantDaPhoneNumberId(phoneNumberId: string): number | null {
  const r = db()
    .prepare("SELECT tenant_id FROM whatsapp_accounts WHERE phone_number_id = ?")
    .get(phoneNumberId) as { tenant_id: number } | undefined;
  return r?.tenant_id ?? null;
}

// ── Abbonamento (Stripe, Fase 3) ─────────────────────────────────────────────

// Lette a ogni chiamata (non a import-time): così i test possono configurarle
// e riflettono eventuali cambi di env senza riavvio.
function stripeConfig(): boolean {
  return Boolean(
    (process.env.STRIPE_SECRET_KEY || "").trim() &&
      ((process.env.STRIPE_PRICE_PRO || "").trim() || (process.env.STRIPE_PRICE_AZIENDA || "").trim())
  );
}
// Email che ha sempre accesso senza pagare (il proprietario).
function adminEmail(): string {
  return (process.env.ORION_ADMIN_EMAIL || "").trim().toLowerCase();
}

export function getAbbonamento(): Abbonamento | undefined {
  return db().prepare("SELECT * FROM abbonamenti WHERE tenant_id = ?").get(T()) as
    | Abbonamento
    | undefined;
}

export function salvaAbbonamento(a: {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stato?: string;
  piano?: string | null;
  periodo_fine?: string | null;
}): Abbonamento {
  const t = T();
  const now = nowISO();
  const prec = getAbbonamento();
  db()
    .prepare(
      `INSERT INTO abbonamenti (tenant_id, stripe_customer_id, stripe_subscription_id, stato, piano, periodo_fine, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET
         stripe_customer_id = COALESCE(excluded.stripe_customer_id, abbonamenti.stripe_customer_id),
         stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, abbonamenti.stripe_subscription_id),
         stato = excluded.stato,
         piano = COALESCE(excluded.piano, abbonamenti.piano),
         periodo_fine = excluded.periodo_fine,
         updated_at = excluded.updated_at`
    )
    .run(
      t,
      a.stripe_customer_id ?? prec?.stripe_customer_id ?? null,
      a.stripe_subscription_id ?? prec?.stripe_subscription_id ?? null,
      a.stato ?? prec?.stato ?? "da_attivare",
      a.piano ?? prec?.piano ?? null,
      a.periodo_fine ?? null,
      now,
      now
    );
  return getAbbonamento()!;
}

// Lookup globale per il webhook (gira senza contesto tenant).
export function tenantDaStripeCustomer(customerId: string): number | null {
  const r = db()
    .prepare("SELECT tenant_id FROM abbonamenti WHERE stripe_customer_id = ?")
    .get(customerId) as { tenant_id: number } | undefined;
  return r?.tenant_id ?? null;
}

// Stato calcolato dell'abbonamento del tenant corrente (per paywall e UI).
// Modello: la prova di 7 giorni la gestisce STRIPE (carta richiesta). Senza un
// abbonamento in prova/attivo → nessun accesso (paywall). `email` opzionale per
// il bypass del proprietario (ORION_ADMIN_EMAIL).
export function statoAbbonamento(email?: string | null): StatoAbbonamento {
  const configurato = stripeConfig();
  // Founding member: l'email dell'account (o del titolare del tenant) è nella
  // lista beta → sconto a vita, mostrato in UI e applicato da solo al checkout.
  let emailAccount = (email || "").trim().toLowerCase();
  if (!emailAccount) {
    try {
      const r = db().prepare("SELECT email FROM utenti WHERE id = ?").get(T()) as { email?: string } | undefined;
      emailAccount = (r?.email || "").trim().toLowerCase();
    } catch {
      /* fuori dal contesto tenant: nessun founder */
    }
  }
  const founder = configurato && SCONTO_BETA > 0 && eBetaTester(emailAccount);
  const base = {
    configurato,
    piano: null as StatoAbbonamento["piano"],
    inProva: false,
    giorniProvaRimasti: 0,
    attivo: false,
    periodoFine: null as string | null,
    founder,
    scontoFounder: founder ? SCONTO_BETA : 0,
  };

  // Modalità demo (Stripe non configurato): tutto aperto, nessun paywall.
  if (!configurato) return { ...base, stato: "demo", attivo: true, accessoConsentito: true };

  // Proprietario: accesso pieno senza pagare.
  const admin = adminEmail();
  if (email && admin && email.trim().toLowerCase() === admin) {
    return { ...base, stato: "attivo", attivo: true, accessoConsentito: true };
  }

  const ab = getAbbonamento();
  const ora = Date.now();
  const periodoFine = ab?.periodo_fine ?? null;
  const periodoValido = periodoFine ? new Date(periodoFine).getTime() > ora : false;
  const piano = (ab?.piano === "azienda" || ab?.piano === "pro" ? ab.piano : null) as StatoAbbonamento["piano"];

  // In prova (trialing) o attivo o annullato-ma-ancora-nel-periodo → accesso.
  if ((ab?.stato === "prova" || ab?.stato === "attivo" || ab?.stato === "annullato") && periodoValido) {
    const inProva = ab.stato === "prova";
    const giorniRimasti = inProva && periodoFine ? Math.max(0, Math.ceil((new Date(periodoFine).getTime() - ora) / 86_400_000)) : 0;
    return {
      ...base,
      stato: ab.stato as StatoAbbonamento["stato"],
      piano,
      inProva,
      giorniProvaRimasti: giorniRimasti,
      attivo: ab.stato === "attivo",
      accessoConsentito: true,
      periodoFine,
    };
  }

  // Nessun abbonamento ancora avviato → deve iniziare la prova (con carta).
  // Abbonamento scaduto/non pagato → paywall.
  return {
    ...base,
    stato: ab ? "scaduto" : "da_attivare",
    piano,
    accessoConsentito: false,
    periodoFine,
  };
}

// ── Briefing + analisi proattiva ────────────────────────────────────────────

export function briefingOggi() {
  const t = T();
  const oggi = new Date().toISOString().slice(0, 10);
  const appuntamenti = listAppuntamenti(oggi, oggi);
  const daConfermare = appuntamenti.filter((a) => a.stato === "da_confermare");
  const msg = db()
    .prepare("SELECT COUNT(*) AS n FROM comunicazioni WHERE tenant_id = ? AND direzione = 'in' AND substr(created_at,1,10) = ?")
    .get(t, oggi) as { n: number };
  const pag = db()
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(importo),0) AS tot FROM pagamenti WHERE tenant_id = ? AND stato = 'da_incassare'")
    .get(t) as { n: number; tot: number };
  const limite = new Date();
  limite.setDate(limite.getDate() - 30);
  const inattivi = db()
    .prepare("SELECT COUNT(*) AS n FROM clienti WHERE tenant_id = ? AND ultima_visita IS NOT NULL AND ultima_visita < ?")
    .get(t, limite.toISOString().slice(0, 10)) as { n: number };
  const prom = db()
    .prepare("SELECT COUNT(*) AS n FROM promemoria WHERE tenant_id = ? AND completato = 0 AND (scadenza IS NULL OR scadenza <= ?)")
    .get(t, oggi) as { n: number };
  const attesa = db().prepare("SELECT COUNT(*) AS n FROM lista_attesa WHERE tenant_id = ?").get(t) as { n: number };
  return {
    data: oggi,
    appuntamenti,
    totaleAppuntamenti: appuntamenti.length,
    daConfermare: daConfermare.length,
    messaggiRicevutiOggi: msg.n,
    pagamentiInSospeso: pag.n,
    importoInSospeso: pag.tot,
    clientiInattivi: inattivi.n,
    promemoriaAttivi: prom.n,
    inAttesa: attesa.n,
    fonte: statoFonte(),
  };
}

export function analisiProattiva(): { segnalazioni: Segnalazione[] } {
  const t = T();
  const segnalazioni: Segnalazione[] = [];
  const oggi = new Date().toISOString().slice(0, 10);
  const tra7 = new Date();
  tra7.setDate(tra7.getDate() + 7);
  const a7 = tra7.toISOString().slice(0, 10);

  const nonConfermati = db()
    .prepare(
      `SELECT a.*, c.nome AS cliente_nome FROM appuntamenti a LEFT JOIN clienti c ON c.id = a.cliente_id
       WHERE a.tenant_id = ? AND a.stato = 'da_confermare' AND substr(a.inizio,1,10) >= ? AND substr(a.inizio,1,10) <= ?`
    )
    .all(t, oggi, a7) as Appuntamento[];
  if (nonConfermati.length) {
    segnalazioni.push({
      categoria: "non_confermati",
      titolo: `${nonConfermati.length} appuntament${nonConfermati.length === 1 ? "o" : "i"} da confermare`,
      dettaglio: nonConfermati.map((a) => `${a.cliente_nome ?? a.titolo} (${a.inizio.slice(0, 10)})`).join(", "),
      azione: "Inviare un promemoria di conferma via WhatsApp.",
    });
  }

  const dovuti = db()
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(importo),0) AS tot FROM pagamenti WHERE tenant_id = ? AND stato = 'da_incassare'")
    .get(t) as { n: number; tot: number };
  if (dovuti.n > 0) {
    segnalazioni.push({
      categoria: "pagamenti",
      titolo: `${dovuti.n} pagament${dovuti.n === 1 ? "o" : "i"} in sospeso`,
      dettaglio: `Totale da incassare: ${dovuti.tot.toFixed(2)} €`,
      azione: "Sollecitare i pagamenti mancanti.",
    });
  }

  const limite = new Date();
  limite.setDate(limite.getDate() - 45);
  const inattivi = db()
    .prepare("SELECT nome, ultima_visita FROM clienti WHERE tenant_id = ? AND ultima_visita IS NOT NULL AND ultima_visita < ? ORDER BY ultima_visita")
    .all(t, limite.toISOString().slice(0, 10)) as { nome: string; ultima_visita: string }[];
  if (inattivi.length) {
    segnalazioni.push({
      categoria: "inattivi",
      titolo: `${inattivi.length} client${inattivi.length === 1 ? "e" : "i"} inattiv${inattivi.length === 1 ? "o" : "i"}`,
      dettaglio: inattivi.slice(0, 5).map((c) => `${c.nome} (dal ${c.ultima_visita})`).join(", "),
      azione: "Proporre un controllo di richiamo.",
    });
  }

  const promScaduti = db()
    .prepare("SELECT testo FROM promemoria WHERE tenant_id = ? AND completato = 0 AND scadenza IS NOT NULL AND scadenza <= ?")
    .all(t, oggi) as { testo: string }[];
  if (promScaduti.length) {
    segnalazioni.push({
      categoria: "promemoria",
      titolo: `${promScaduti.length} promemoria in scadenza`,
      dettaglio: promScaduti.map((p) => p.testo).join(", "),
      azione: "Evadere o riprogrammare.",
    });
  }

  const appOggi = (
    db()
      .prepare(`SELECT inizio, fine FROM appuntamenti WHERE tenant_id = ? AND substr(inizio,1,10) = ? AND stato != 'cancellato' ORDER BY inizio`)
      .all(t, oggi) as { inizio: string; fine: string }[]
  ).sort((a, b) => a.inizio.localeCompare(b.inizio));
  let buchi = 0;
  let cursore = new Date(`${oggi}T09:00`);
  const fineGiornata = new Date(`${oggi}T19:00`);
  for (const a of appOggi) {
    const ai = new Date(a.inizio);
    if (ai.getTime() - cursore.getTime() >= 30 * 60000) buchi++;
    const af = new Date(a.fine);
    if (af > cursore) cursore = af;
  }
  if (fineGiornata.getTime() - cursore.getTime() >= 30 * 60000) buchi++;
  const attesa = listAttesa();
  if (buchi > 0 && attesa.length > 0) {
    segnalazioni.push({
      categoria: "buchi",
      titolo: `${buchi} spazio${buchi === 1 ? "" : " spazi"} liber${buchi === 1 ? "o" : "i"} oggi`,
      dettaglio: `In lista d'attesa: ${attesa.map((a) => a.nome).join(", ")}`,
      azione: "Riempire i buchi chiamando chi è in lista d'attesa.",
    });
  }

  // ── ANTICIPAZIONE: guarda a DOMANI e incrocia lo storico di ogni cliente.
  // Per ogni appuntamento di domani, se la memoria viva ha intuizioni su quel
  // cliente (es. "porta sempre documenti", procedure/eccezioni), le propone come
  // preparazione → prevenire invece di reagire.
  const domani = new Date();
  domani.setDate(domani.getDate() + 1);
  const isoDomani = domani.toISOString().slice(0, 10);
  const appDomani = db()
    .prepare(
      `SELECT a.id, a.titolo, a.cliente_id, c.nome AS cliente_nome FROM appuntamenti a
       LEFT JOIN clienti c ON c.id = a.cliente_id
       WHERE a.tenant_id = ? AND substr(a.inizio,1,10) = ? AND a.stato != 'cancellato' ORDER BY a.inizio`
    )
    .all(t, isoDomani) as { id: number; titolo: string; cliente_id: number | null; cliente_nome: string | null }[];
  const preparazioni: string[] = [];
  for (const a of appDomani) {
    if (a.cliente_id == null) continue;
    const intu = recallMemoria({
      cliente_id: a.cliente_id,
      categorie: ["procedura", "eccezione", "preferenza", "contesto", "abitudine"],
      limite: 2,
    }).filter((m) => m.cliente_id === a.cliente_id); // solo intuizioni SPECIFICHE del cliente
    if (intu.length) {
      const nome = a.cliente_nome ?? a.titolo;
      preparazioni.push(`${nome}: ${intu.map((m) => m.contenuto).join("; ")}`);
    }
  }
  if (preparazioni.length) {
    segnalazioni.push({
      categoria: "preparazione_domani",
      titolo: `Preparazione per domani (${preparazioni.length})`,
      dettaglio: preparazioni.slice(0, 5).join(" · "),
      azione: "Preparare in anticipo ciò che di solito serve a questi appuntamenti.",
    });
  }

  return { segnalazioni };
}

// ── Centralino AI (registro chiamate) ───────────────────────────────────────

export type Chiamata = {
  id: number;
  cliente_id: number | null;
  cliente_nome?: string | null;
  call_sid: string | null;
  da_numero: string | null;
  stato: string; // 'in_corso' | 'conclusa' | 'persa'
  esito: string | null;
  trascrizione: string | null; // JSON: [{chi:'caller'|'orion', testo}]
  appuntamento_id: number | null;
  created_at: string;
  updated_at: string;
};

export function apriChiamata(c: { call_sid: string; da_numero?: string | null; cliente_id?: number | null }): Chiamata {
  const r = db()
    .prepare(
      `INSERT INTO chiamate (tenant_id, cliente_id, call_sid, da_numero, stato, trascrizione, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'in_corso', '[]', ?, ?)`
    )
    .run(T(), c.cliente_id ?? null, c.call_sid, c.da_numero ?? null, nowISO(), nowISO());
  return db().prepare("SELECT * FROM chiamate WHERE id = ?").get(Number(r.lastInsertRowid)) as Chiamata;
}

export function getChiamataBySid(callSid: string): Chiamata | undefined {
  return db()
    .prepare(
      `SELECT ch.*, c.nome AS cliente_nome FROM chiamate ch LEFT JOIN clienti c ON c.id = ch.cliente_id
       WHERE ch.call_sid = ? AND ch.tenant_id = ?`
    )
    .get(callSid, T()) as Chiamata | undefined;
}

export function aggiornaChiamata(
  id: number,
  campi: { stato?: string; esito?: string | null; trascrizione?: string | null; appuntamento_id?: number | null; cliente_id?: number | null }
) {
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const k of ["stato", "esito", "trascrizione", "appuntamento_id", "cliente_id"] as const) {
    if (campi[k] !== undefined) {
      updates.push(`${k} = ?`);
      values.push(campi[k]);
    }
  }
  if (!updates.length) return;
  updates.push("updated_at = ?");
  values.push(nowISO(), id, T());
  db().prepare(`UPDATE chiamate SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`).run(...values);
}

export function listChiamate(limite = 15): Chiamata[] {
  return db()
    .prepare(
      `SELECT ch.*, c.nome AS cliente_nome FROM chiamate ch LEFT JOIN clienti c ON c.id = ch.cliente_id
       WHERE ch.tenant_id = ? ORDER BY ch.created_at DESC LIMIT ?`
    )
    .all(T(), limite) as Chiamata[];
}

// Numero dello studio collegato al centralino: risolve il tenant dal numero
// chiamato (come tenantDaPhoneNumberId per WhatsApp).
export function tenantDaNumeroCentralino(numero: string): number | null {
  const norm = numero.replace(/\D/g, "");
  if (!norm) return null;
  const row = db()
    .prepare("SELECT tenant_id FROM telefono_accounts WHERE replace(replace(numero,'+',''),' ','') = ? AND attivo = 1")
    .get(norm) as { tenant_id: number } | undefined;
  return row?.tenant_id ?? null;
}

export function salvaTelefonoAccount(a: { numero: string; messaggio_benvenuto?: string | null }) {
  db()
    .prepare(
      `INSERT INTO telefono_accounts (tenant_id, numero, messaggio_benvenuto, attivo, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET numero = excluded.numero,
         messaggio_benvenuto = excluded.messaggio_benvenuto, attivo = 1, updated_at = excluded.updated_at`
    )
    .run(T(), a.numero, a.messaggio_benvenuto ?? null, nowISO(), nowISO());
}

export function getTelefonoAccount(): { numero: string | null; messaggio_benvenuto: string | null } | undefined {
  return db().prepare("SELECT numero, messaggio_benvenuto FROM telefono_accounts WHERE tenant_id = ?").get(T()) as
    | { numero: string | null; messaggio_benvenuto: string | null }
    | undefined;
}

// ── Audit (tracciabilità delle azioni — fiducia / AI Act) ───────────────────

export function logAudit(a: {
  canale: "voce" | "telefono" | "whatsapp" | "email" | "cron" | "api";
  azione: string;
  dettaglio?: string | null;
  esito?: string;
  utente_id?: number | null;
}) {
  try {
    db()
      .prepare(
        `INSERT INTO audit (tenant_id, utente_id, canale, azione, dettaglio, esito, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(T(), a.utente_id ?? null, a.canale, a.azione, a.dettaglio ?? null, a.esito ?? "ok", nowISO());
  } catch {
    /* l'audit non deve mai bloccare l'azione */
  }
}

export type VoceAudit = {
  id: number;
  canale: string;
  azione: string;
  dettaglio: string | null;
  esito: string;
  created_at: string;
};

export function listAudit(limite = 50): VoceAudit[] {
  return db()
    .prepare("SELECT id, canale, azione, dettaglio, esito, created_at FROM audit WHERE tenant_id = ? ORDER BY id DESC LIMIT ?")
    .all(T(), limite) as VoceAudit[];
}

// ── Google Calendar (account e sync) ────────────────────────────────────────

export type CalendarAccount = {
  tenant_id: number;
  provider: string;
  email: string | null;
  refresh_token: string | null;
  calendar_id: string;
  sync_token: string | null;
  ultimo_sync: string | null;
  stato: string;
};

export function getCalendarAccount(): CalendarAccount | undefined {
  return db().prepare("SELECT * FROM calendar_accounts WHERE tenant_id = ?").get(T()) as
    | CalendarAccount
    | undefined;
}

export function salvaCalendarAccount(a: { email?: string | null; refresh_token: string; calendar_id?: string }) {
  db()
    .prepare(
      `INSERT INTO calendar_accounts (tenant_id, provider, email, refresh_token, calendar_id, stato, created_at, updated_at)
       VALUES (?, 'google', ?, ?, ?, 'collegato', ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET email = excluded.email, refresh_token = excluded.refresh_token,
         calendar_id = excluded.calendar_id, stato = 'collegato', sync_token = NULL, updated_at = excluded.updated_at`
    )
    .run(T(), a.email ?? null, cifra(a.refresh_token), a.calendar_id ?? "primary", nowISO(), nowISO());
}

export function salvaSyncToken(token: string | null) {
  db()
    .prepare("UPDATE calendar_accounts SET sync_token = ?, ultimo_sync = ?, updated_at = ? WHERE tenant_id = ?")
    .run(token, nowISO(), nowISO(), T());
}

export function rimuoviCalendarAccount(): boolean {
  return db().prepare("DELETE FROM calendar_accounts WHERE tenant_id = ?").run(T()).changes > 0;
}

// Appuntamenti da spingere su Google: nuovi (gcal_id NULL) o modificati (dirty).
export function appuntamentiDaSpingere(limite = 25): Appuntamento[] {
  const oggiISO = new Date().toISOString().slice(0, 10);
  return db()
    .prepare(
      `${APP_JOIN} WHERE a.tenant_id = ? AND a.stato != 'cancellato'
         AND substr(a.inizio,1,10) >= ?
         AND (a.gcal_id IS NULL OR a.gcal_dirty = 1)
       ORDER BY a.inizio LIMIT ?`
    )
    .all(T(), oggiISO, limite) as Appuntamento[];
}

export function setGcal(idAppuntamento: number, gcalId: string) {
  db()
    .prepare("UPDATE appuntamenti SET gcal_id = ?, gcal_dirty = 0 WHERE id = ? AND tenant_id = ?")
    .run(gcalId, idAppuntamento, T());
}

export function appuntamentoDaGcalId(gcalId: string): Appuntamento | undefined {
  return db().prepare(`${APP_JOIN} WHERE a.tenant_id = ? AND a.gcal_id = ?`).get(T(), gcalId) as
    | Appuntamento
    | undefined;
}

// Eventi Google in arrivo → appuntamenti ORION (upsert per gcal_id).
export function upsertAppuntamentoDaGcal(e: {
  gcal_id: string;
  titolo: string;
  inizio: string;
  fine: string;
  cancellato?: boolean;
}): "creato" | "aggiornato" | "cancellato" | "ignorato" {
  const esistente = appuntamentoDaGcalId(e.gcal_id);
  if (e.cancellato) {
    if (!esistente) return "ignorato";
    db()
      .prepare("UPDATE appuntamenti SET stato = 'cancellato', gcal_dirty = 0 WHERE id = ? AND tenant_id = ?")
      .run(esistente.id, T());
    return "cancellato";
  }
  if (esistente) {
    if (esistente.inizio === e.inizio && esistente.fine === e.fine && esistente.titolo === e.titolo) return "ignorato";
    db()
      .prepare("UPDATE appuntamenti SET titolo = ?, inizio = ?, fine = ?, gcal_dirty = 0 WHERE id = ? AND tenant_id = ?")
      .run(e.titolo, e.inizio, e.fine, esistente.id, T());
    return "aggiornato";
  }
  db()
    .prepare(
      `INSERT INTO appuntamenti (tenant_id, cliente_id, titolo, inizio, fine, stato, gcal_id, gcal_dirty, created_at)
       VALUES (?, NULL, ?, ?, ?, 'confermato', ?, 0, ?)`
    )
    .run(T(), e.titolo, e.inizio, e.fine, e.gcal_id, nowISO());
  return "creato";
}

export function listTombstones(limite = 25): { id: number; gcal_id: string }[] {
  return db()
    .prepare("SELECT id, gcal_id FROM gcal_tombstones WHERE tenant_id = ? LIMIT ?")
    .all(T(), limite) as { id: number; gcal_id: string }[];
}

export function rimuoviTombstone(id: number) {
  db().prepare("DELETE FROM gcal_tombstones WHERE id = ? AND tenant_id = ?").run(id, T());
}

// ── MOTORE RICAVI ────────────────────────────────────────────────────────────

// Riempi-buchi: offerte di slot alla lista d'attesa.
export type OffertaSlot = {
  id: number;
  attesa_id: number | null;
  cliente_id: number | null;
  cliente_nome?: string | null;
  telefono: string | null;
  inizio: string;
  fine: string;
  stato: string;
  scadenza: string;
};

export function creaOffertaSlot(o: {
  attesa_id?: number | null;
  cliente_id: number;
  telefono: string;
  inizio: string;
  fine: string;
  minutiScadenza?: number;
}): OffertaSlot {
  const scad = new Date(Date.now() + (o.minutiScadenza ?? 45) * 60000).toISOString();
  const r = db()
    .prepare(
      `INSERT INTO offerte_slot (tenant_id, attesa_id, cliente_id, telefono, inizio, fine, stato, scadenza, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'inviata', ?, ?, ?)`
    )
    .run(T(), o.attesa_id ?? null, o.cliente_id, o.telefono, o.inizio, o.fine, scad, nowISO(), nowISO());
  return db().prepare("SELECT * FROM offerte_slot WHERE id = ?").get(Number(r.lastInsertRowid)) as OffertaSlot;
}

export function offertaInviataPerCliente(clienteId: number): OffertaSlot | undefined {
  return db()
    .prepare(
      `SELECT o.*, c.nome AS cliente_nome FROM offerte_slot o LEFT JOIN clienti c ON c.id = o.cliente_id
       WHERE o.tenant_id = ? AND o.cliente_id = ? AND o.stato = 'inviata' ORDER BY o.id DESC LIMIT 1`
    )
    .get(T(), clienteId) as OffertaSlot | undefined;
}

export function aggiornaOfferta(id: number, stato: string) {
  db().prepare("UPDATE offerte_slot SET stato = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").run(stato, nowISO(), id, T());
}

export function offerteScadute(): OffertaSlot[] {
  return db()
    .prepare(
      `SELECT o.*, c.nome AS cliente_nome FROM offerte_slot o LEFT JOIN clienti c ON c.id = o.cliente_id
       WHERE o.tenant_id = ? AND o.stato = 'inviata' AND o.scadenza < ?`
    )
    .all(T(), nowISO()) as OffertaSlot[];
}

// Chi ha già ricevuto un'offerta per QUESTO slot (per non riproporla alla stessa persona).
export function clientiGiaOffertiPerSlot(inizio: string): number[] {
  return (
    db()
      .prepare("SELECT cliente_id FROM offerte_slot WHERE tenant_id = ? AND inizio = ? AND cliente_id IS NOT NULL")
      .all(T(), inizio) as { cliente_id: number }[]
  ).map((r) => r.cliente_id);
}

// Prossimo candidato dalla lista d'attesa (con telefono), priorità alta prima.
export function prossimoCandidatoAttesa(escludi: number[]): { attesa_id: number; cliente_id: number; nome: string; telefono: string } | undefined {
  const rows = db()
    .prepare(
      `SELECT la.id AS attesa_id, c.id AS cliente_id, c.nome, c.telefono
       FROM lista_attesa la JOIN clienti c ON c.id = la.cliente_id
       WHERE la.tenant_id = ? AND c.telefono IS NOT NULL AND c.telefono != ''
       ORDER BY CASE la.priorita WHEN 'alta' THEN 0 ELSE 1 END, la.created_at ASC`
    )
    .all(T()) as { attesa_id: number; cliente_id: number; nome: string; telefono: string }[];
  return rows.find((r) => !escludi.includes(r.cliente_id));
}

// Clienti "dormienti": nessuna visita da almeno N mesi, nessun appuntamento
// futuro, con telefono → candidati a un richiamo gentile.
export function clientiDormienti(mesiMin = 6, limite = 20): (Cliente & { mesi: number })[] {
  const soglia = new Date();
  soglia.setMonth(soglia.getMonth() - mesiMin);
  const sogliaISO = soglia.toISOString().slice(0, 10);
  const adesso = nowISO().slice(0, 16);
  const rows = db()
    .prepare(
      `SELECT c.* FROM clienti c
       WHERE c.tenant_id = ? AND c.telefono IS NOT NULL AND c.telefono != ''
         AND c.ultima_visita IS NOT NULL AND c.ultima_visita <= ?
         AND NOT EXISTS (
           SELECT 1 FROM appuntamenti a WHERE a.tenant_id = c.tenant_id AND a.cliente_id = c.id
             AND a.stato NOT IN ('cancellato','annullato') AND a.inizio >= ?
         )
       ORDER BY c.ultima_visita ASC LIMIT ?`
    )
    .all(T(), sogliaISO, adesso, limite) as Cliente[];
  return rows.map((c) => ({
    ...c,
    mesi: Math.floor((Date.now() - new Date(c.ultima_visita as string).getTime()) / (30.44 * 24 * 3600_000)),
  }));
}

// Report "quanto ti ho fatto guadagnare": conta le azioni di valore del periodo
// e le traduce in una stima in euro usando il prezzo medio REALE dei pagamenti.
export function statisticheValore(da: string, a: string) {
  const t = T();
  const cnt = (tipo: string) =>
    (db()
      .prepare("SELECT COUNT(*) AS n FROM eventi WHERE tenant_id = ? AND tipo = ? AND created_at >= ? AND created_at <= ?")
      .get(t, tipo, da, a) as { n: number }).n;
  const chiamate = (db()
    .prepare("SELECT COUNT(*) AS n FROM chiamate WHERE tenant_id = ? AND created_at >= ? AND created_at <= ?")
    .get(t, da, a) as { n: number }).n;
  const prezzoMedio =
    (db()
      .prepare("SELECT AVG(importo) AS m FROM pagamenti WHERE tenant_id = ? AND stato = 'incassato'")
      .get(t) as { m: number | null }).m ?? 0;
  const prenotazioniTelefono = cnt("appuntamento_da_telefono");
  const slotRiempiti = cnt("slot_riempito");
  const confermeAutomatiche = cnt("appuntamento_confermato");
  const promemoriaInviati = cnt("promemoria_appuntamento");
  const disdetteIntercettate = cnt("richiesta_disdetta");
  const richiamiInviati = cnt("richiamo_dormiente");
  const fattureEmesse = cnt("fattura_emessa");
  // Stima prudente: prenotazioni da telefono e buchi riempiti = ricavo pieno;
  // 1 no-show evitato ogni 4 conferme automatiche (stima conservativa).
  const noShowEvitatiStima = Math.floor(confermeAutomatiche / 4);
  const valoreStimato = Math.round((prenotazioniTelefono + slotRiempiti + noShowEvitatiStima) * prezzoMedio);
  return {
    periodo: { da, a },
    chiamateGestite: chiamate,
    prenotazioniTelefono,
    slotRiempiti,
    promemoriaInviati,
    confermeAutomatiche,
    noShowEvitatiStima,
    disdetteIntercettate,
    richiamiInviati,
    fattureEmesse,
    prezzoMedio: Math.round(prezzoMedio * 100) / 100,
    valoreStimato,
  };
}
