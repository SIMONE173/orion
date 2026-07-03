import { db } from "./db";
import { tenantIdCorrente } from "./tenant";
import { cifra } from "./crypto";

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
  // Onboarding dinamico:
  tipo_uso: string | null; // 'personale' | 'lavoro'
  tipo_lavoro: string | null; // 'autonomo' | 'azienda'
  memoria_operativa: string | null; // JSON flessibile: { tema: dettaglio, ... }
  ultima_consolidazione: string | null; // data (YYYY-MM-DD) ultima distillazione AI
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
  periodo_fine: string | null;
  created_at: string;
  updated_at: string;
};

export type StatoAbbonamento = {
  configurato: boolean;
  stato: "demo" | "prova" | "attivo" | "scaduto" | "annullato";
  inProva: boolean;
  giorniProvaRimasti: number;
  attivo: boolean;
  accessoConsentito: boolean;
  periodoFine: string | null;
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
function classeRuolo(ruolo?: string | null): "titolare" | "responsabile" | "amministrativo" | "operatore" {
  const r = (ruolo ?? "").toLowerCase();
  if (/titolar|amministrator delegat|ceo|direttore|propriet|fondator|owner/.test(r)) return "titolare";
  if (/responsabil|capo|manager|coordinator|preposto|caporeparto/.test(r)) return "responsabile";
  if (/ammininistrat|segret|contabil|ufficio|backoffice|hr|risorse uman/.test(r)) return "amministrativo";
  return "operatore";
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

const CAMPI_CONNESSIONE = ["tipo", "nome", "descrizione", "regole", "modalita", "autorizzato"] as const;

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
// collegandolo al cliente (per nome) e a una catena (riferimento) quando possibile.
export function upsertEntitaEsterna(e: {
  connessione_id: number;
  tipo?: string;
  chiave_esterna?: string | null;
  titolo?: string | null;
  dati?: unknown;
  cliente_nome?: string | null;
  cliente_id?: number | null;
  riferimento?: string | null;
}): EntitaEsterna {
  const now = nowISO();
  const datiStr = e.dati == null ? null : typeof e.dati === "string" ? e.dati : JSON.stringify(e.dati);
  // Collega al cliente: id esplicito, oppure match per nome (1 solo risultato).
  let cliente_id = e.cliente_id ?? null;
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
  return getCliente(Number(r.lastInsertRowid))!;
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
  return getAppuntamento(Number(r.lastInsertRowid))!;
}

export function spostaAppuntamento(id: number, inizio: string, fine: string): Appuntamento | undefined {
  // gcal_dirty: se l'appuntamento vive anche su Google Calendar, il cron lo riallinea.
  db()
    .prepare(
      "UPDATE appuntamenti SET inizio = ?, fine = ?, promemoria_inviato = 0, gcal_dirty = CASE WHEN gcal_id IS NULL THEN gcal_dirty ELSE 1 END WHERE id = ? AND tenant_id = ?"
    )
    .run(inizio, fine, id, T());
  return getAppuntamento(id);
}

export function aggiornaStatoAppuntamento(id: number, stato: string): Appuntamento | undefined {
  db().prepare("UPDATE appuntamenti SET stato = ? WHERE id = ? AND tenant_id = ?").run(stato, id, T());
  return getAppuntamento(id);
}

export function eliminaAppuntamento(id: number): boolean {
  // Lapide per Google Calendar: se l'evento esiste anche là, il cron lo cancella.
  const app = getAppuntamento(id);
  if (app?.gcal_id) {
    db()
      .prepare("INSERT INTO gcal_tombstones (tenant_id, gcal_id, created_at) VALUES (?, ?, ?)")
      .run(T(), app.gcal_id, nowISO());
  }
  return (
    db().prepare("UPDATE appuntamenti SET stato = 'cancellato' WHERE id = ? AND tenant_id = ?").run(id, T())
      .changes > 0
  );
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

export function salvaSubscription(s: PushSub) {
  db()
    .prepare(
      `INSERT INTO push_subscriptions (tenant_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET tenant_id = excluded.tenant_id, p256dh = excluded.p256dh, auth = excluded.auth`
    )
    .run(T(), s.endpoint, s.p256dh, s.auth, nowISO());
}

export function listSubscriptions(): PushSub[] {
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

const STRIPE_CONFIG = Boolean(
  (process.env.STRIPE_SECRET_KEY || "").trim() && (process.env.STRIPE_PRICE_ID || "").trim()
);
const GIORNI_PROVA = 14;

export function getAbbonamento(): Abbonamento | undefined {
  return db().prepare("SELECT * FROM abbonamenti WHERE tenant_id = ?").get(T()) as
    | Abbonamento
    | undefined;
}

export function salvaAbbonamento(a: {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stato?: string;
  periodo_fine?: string | null;
}): Abbonamento {
  const t = T();
  const now = nowISO();
  const prec = getAbbonamento();
  db()
    .prepare(
      `INSERT INTO abbonamenti (tenant_id, stripe_customer_id, stripe_subscription_id, stato, periodo_fine, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET
         stripe_customer_id = COALESCE(excluded.stripe_customer_id, abbonamenti.stripe_customer_id),
         stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, abbonamenti.stripe_subscription_id),
         stato = excluded.stato,
         periodo_fine = excluded.periodo_fine,
         updated_at = excluded.updated_at`
    )
    .run(
      t,
      a.stripe_customer_id ?? prec?.stripe_customer_id ?? null,
      a.stripe_subscription_id ?? prec?.stripe_subscription_id ?? null,
      a.stato ?? prec?.stato ?? "prova",
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
export function statoAbbonamento(): StatoAbbonamento {
  if (!STRIPE_CONFIG) {
    return {
      configurato: false,
      stato: "demo",
      inProva: false,
      giorniProvaRimasti: 0,
      attivo: false,
      accessoConsentito: true,
      periodoFine: null,
    };
  }
  const t = T();
  const ab = getAbbonamento();
  const ora = Date.now();

  // Abbonamento attivo (o annullato ma ancora nel periodo pagato).
  const periodoFine = ab?.periodo_fine ?? null;
  const periodoValido = periodoFine ? new Date(periodoFine).getTime() > ora : false;
  if ((ab?.stato === "attivo" || ab?.stato === "annullato") && periodoValido) {
    return {
      configurato: true,
      stato: ab.stato as StatoAbbonamento["stato"],
      inProva: false,
      giorniProvaRimasti: 0,
      attivo: ab.stato === "attivo",
      accessoConsentito: true,
      periodoFine,
    };
  }

  // Altrimenti: prova gratuita calcolata dalla data di creazione dell'account.
  const u = db().prepare("SELECT created_at FROM utenti WHERE id = ?").get(t) as
    | { created_at: string }
    | undefined;
  const inizio = u ? new Date(u.created_at).getTime() : ora;
  const fineProva = inizio + GIORNI_PROVA * 24 * 60 * 60 * 1000;
  const giorniRimasti = Math.max(0, Math.ceil((fineProva - ora) / (24 * 60 * 60 * 1000)));
  const inProva = giorniRimasti > 0;
  return {
    configurato: true,
    stato: inProva ? "prova" : "scaduto",
    inProva,
    giorniProvaRimasti: giorniRimasti,
    attivo: false,
    accessoConsentito: inProva,
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
