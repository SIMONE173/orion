import { db } from "./db";

// ──────────────────────────────────────────────────────────────────────────
// Accesso ai dati. Tutte le operazioni di ORION passano da qui.
// Punto di integrazione futura (WhatsApp Business API reale): `inviaWhatsapp`.
// ──────────────────────────────────────────────────────────────────────────

export type Profilo = {
  id: number;
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
  regime_fiscale: string | null;
  pec: string | null;
  sdi: string | null;
  onboarding_completo: number;
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
  ultima_visita: string | null;
  created_at: string;
};

export type Appuntamento = {
  id: number;
  cliente_id: number | null;
  cliente_nome?: string | null;
  titolo: string;
  inizio: string;
  fine: string;
  stato: string;
  note: string | null;
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

export type Segnalazione = {
  categoria: string;
  titolo: string;
  dettaglio: string;
  azione: string;
};

const nowISO = () => new Date().toISOString();

// ── Profilo / memoria operativa ───────────────────────────────────────────

export function getProfilo(): Profilo {
  return db().prepare("SELECT * FROM profilo WHERE id = 1").get() as Profilo;
}

const CAMPI_PROFILO = [
  "nome",
  "professione",
  "durata_visita_min",
  "gestione_cancellazioni",
  "canale_comunicazione",
  "problemi_tempo",
  "abitudini",
  "piva",
  "codice_fiscale",
  "indirizzo",
  "regime_fiscale",
  "pec",
  "sdi",
  "onboarding_completo",
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
    db()
      .prepare(`UPDATE profilo SET ${updates.join(", ")} WHERE id = 1`)
      .run(...values);
  }
  return getProfilo();
}

// ── Clienti ─────────────────────────────────────────────────────────────────

export function listClienti(): Cliente[] {
  return db()
    .prepare("SELECT * FROM clienti ORDER BY nome COLLATE NOCASE")
    .all() as Cliente[];
}

export function getCliente(id: number): Cliente | undefined {
  return db().prepare("SELECT * FROM clienti WHERE id = ?").get(id) as
    | Cliente
    | undefined;
}

export function cercaCliente(q: string): Cliente[] {
  return db()
    .prepare(
      "SELECT * FROM clienti WHERE nome LIKE ? OR telefono LIKE ? ORDER BY nome COLLATE NOCASE LIMIT 10"
    )
    .all(`%${q}%`, `%${q}%`) as Cliente[];
}

export function creaCliente(c: Partial<Cliente> & { nome: string }): Cliente {
  const r = db()
    .prepare(
      `INSERT INTO clienti (nome, telefono, email, note, piva, codice_fiscale, indirizzo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      c.nome,
      c.telefono ?? null,
      c.email ?? null,
      c.note ?? null,
      c.piva ?? null,
      c.codice_fiscale ?? null,
      c.indirizzo ?? null,
      nowISO()
    );
  return getCliente(Number(r.lastInsertRowid))!;
}

export function aggiornaCliente(id: number, c: Partial<Cliente>): Cliente | undefined {
  const campi = ["nome", "telefono", "email", "note", "piva", "codice_fiscale", "indirizzo"] as const;
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const k of campi) {
    if (k in c && c[k] !== undefined) {
      updates.push(`${k} = ?`);
      values.push(c[k]);
    }
  }
  if (updates.length) {
    values.push(id);
    db().prepare(`UPDATE clienti SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }
  return getCliente(id);
}

export function schedaCliente(id: number) {
  const cliente = getCliente(id);
  if (!cliente) return null;
  const appuntamenti = db()
    .prepare("SELECT * FROM appuntamenti WHERE cliente_id = ? ORDER BY inizio DESC LIMIT 10")
    .all(id) as Appuntamento[];
  const pagamenti = db()
    .prepare("SELECT * FROM pagamenti WHERE cliente_id = ? ORDER BY data DESC LIMIT 10")
    .all(id) as Pagamento[];
  const comunicazioni = db()
    .prepare("SELECT * FROM comunicazioni WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 10")
    .all(id) as Comunicazione[];
  const note = db()
    .prepare("SELECT * FROM note WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 10")
    .all(id) as Nota[];
  const totaleIncassato = pagamenti
    .filter((p) => p.stato === "incassato")
    .reduce((s, p) => s + p.importo, 0);
  return { cliente, appuntamenti, pagamenti, comunicazioni, note, totaleIncassato };
}

// ── Agenda ────────────────────────────────────────────────────────────────

const APP_JOIN = `
  SELECT a.*, c.nome AS cliente_nome
  FROM appuntamenti a
  LEFT JOIN clienti c ON c.id = a.cliente_id
`;

export function listAppuntamenti(dataDa: string, dataA: string): Appuntamento[] {
  // dataDa/dataA: "YYYY-MM-DD". Confronto su prefisso ISO.
  return db()
    .prepare(
      `${APP_JOIN} WHERE substr(a.inizio,1,10) >= ? AND substr(a.inizio,1,10) <= ? AND a.stato != 'cancellato' ORDER BY a.inizio`
    )
    .all(dataDa, dataA) as Appuntamento[];
}

export function getAppuntamento(id: number): Appuntamento | undefined {
  return db().prepare(`${APP_JOIN} WHERE a.id = ?`).get(id) as Appuntamento | undefined;
}

export function trovaConflitti(inizio: string, fine: string, escludiId?: number): Appuntamento[] {
  // Sovrapposizione: inizio < fine_esistente AND fine > inizio_esistente
  return db()
    .prepare(
      `${APP_JOIN} WHERE a.stato != 'cancellato' AND a.inizio < ? AND a.fine > ? ${
        escludiId ? "AND a.id != ?" : ""
      }`
    )
    .all(...(escludiId ? [fine, inizio, escludiId] : [fine, inizio])) as Appuntamento[];
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
      `INSERT INTO appuntamenti (cliente_id, titolo, inizio, fine, stato, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      a.cliente_id ?? null,
      a.titolo,
      a.inizio,
      a.fine,
      a.stato ?? "da_confermare",
      a.note ?? null,
      nowISO()
    );
  return getAppuntamento(Number(r.lastInsertRowid))!;
}

export function spostaAppuntamento(id: number, inizio: string, fine: string): Appuntamento | undefined {
  db().prepare("UPDATE appuntamenti SET inizio = ?, fine = ? WHERE id = ?").run(inizio, fine, id);
  return getAppuntamento(id);
}

export function aggiornaStatoAppuntamento(id: number, stato: string): Appuntamento | undefined {
  db().prepare("UPDATE appuntamenti SET stato = ? WHERE id = ?").run(stato, id);
  return getAppuntamento(id);
}

export function eliminaAppuntamento(id: number): boolean {
  const r = db().prepare("UPDATE appuntamenti SET stato = 'cancellato' WHERE id = ?").run(id);
  return r.changes > 0;
}

// ── Note ──────────────────────────────────────────────────────────────────

export function creaNota(n: { cliente_id?: number | null; titolo?: string | null; contenuto: string }): Nota {
  const r = db()
    .prepare(`INSERT INTO note (cliente_id, titolo, contenuto, created_at) VALUES (?, ?, ?, ?)`)
    .run(n.cliente_id ?? null, n.titolo ?? null, n.contenuto, nowISO());
  return db().prepare("SELECT * FROM note WHERE id = ?").get(Number(r.lastInsertRowid)) as Nota;
}

export function listNote(): Nota[] {
  return db()
    .prepare(
      `SELECT n.*, c.nome AS cliente_nome FROM note n LEFT JOIN clienti c ON c.id = n.cliente_id ORDER BY n.created_at DESC LIMIT 30`
    )
    .all() as Nota[];
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
      `INSERT INTO pagamenti (cliente_id, importo, metodo, stato, data, descrizione, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      p.cliente_id ?? null,
      p.importo,
      p.metodo,
      p.stato ?? "incassato",
      data,
      p.descrizione ?? null,
      nowISO()
    );
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
       WHERE p.data >= ? AND p.data <= ? ORDER BY p.data DESC`
    )
    .all(dataDa, dataA) as Pagamento[];
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
  const topClienti = Object.entries(perCliente)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nome, totale]) => ({ nome, totale }));

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
    daIncassare: daIncassare.map((p) => ({
      cliente: p.cliente_nome ?? null,
      importo: p.importo,
      descrizione: p.descrizione,
      data: p.data,
    })),
  };
}

// ── Comunicazioni (WhatsApp simulato) ───────────────────────────────────────

/**
 * Punto di integrazione: oggi registra solo la comunicazione nel DB (simulato).
 * Per il WhatsApp reale, qui andrebbe la chiamata alla WhatsApp Business API.
 */
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
      `INSERT INTO comunicazioni (cliente_id, direzione, canale, tipo, contenuto, allegato_nome, allegato_url, stato, created_at)
       VALUES (?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?)`
    )
    .run(
      c.cliente_id ?? null,
      c.direzione,
      c.tipo ?? "testo",
      c.contenuto ?? null,
      c.allegato_nome ?? null,
      c.allegato_url ?? null,
      c.stato ?? (c.direzione === "out" ? "inviato" : "ricevuto"),
      nowISO()
    );
  return db()
    .prepare(
      `SELECT cm.*, c.nome AS cliente_nome FROM comunicazioni cm LEFT JOIN clienti c ON c.id = cm.cliente_id WHERE cm.id = ?`
    )
    .get(Number(r.lastInsertRowid)) as Comunicazione;
}

// Trova un cliente dal numero di telefono (per associare i messaggi WhatsApp in arrivo).
export function getClienteByTelefono(telefono: string): Cliente | undefined {
  const norm = telefono.replace(/\D/g, "");
  const ultime = norm.slice(-9); // confronto sulle ultime 9 cifre (ignora prefisso/spazi)
  if (!ultime) return undefined;
  const tutti = db().prepare("SELECT * FROM clienti WHERE telefono IS NOT NULL").all() as Cliente[];
  return tutti.find((c) => (c.telefono ?? "").replace(/\D/g, "").endsWith(ultime));
}

// Messaggi in arrivo ricevuti dopo un certo istante (per la notifica "ha risposto").
export function messaggiInArrivoDopo(iso: string): Comunicazione[] {
  return db()
    .prepare(
      `SELECT cm.*, c.nome AS cliente_nome FROM comunicazioni cm LEFT JOIN clienti c ON c.id = cm.cliente_id
       WHERE cm.direzione = 'in' AND cm.created_at > ? ORDER BY cm.created_at`
    )
    .all(iso) as Comunicazione[];
}

export function listComunicazioni(clienteId?: number): Comunicazione[] {
  const base = `SELECT cm.*, c.nome AS cliente_nome FROM comunicazioni cm LEFT JOIN clienti c ON c.id = cm.cliente_id`;
  if (clienteId) {
    return db()
      .prepare(`${base} WHERE cm.cliente_id = ? ORDER BY cm.created_at`)
      .all(clienteId) as Comunicazione[];
  }
  return db().prepare(`${base} ORDER BY cm.created_at DESC LIMIT 30`).all() as Comunicazione[];
}

// ── Fatture ─────────────────────────────────────────────────────────────────

export function prossimoNumeroFattura(): string {
  const anno = new Date().getFullYear();
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM fatture WHERE substr(data,1,4) = ?")
    .get(String(anno)) as { n: number };
  return `${row.n + 1}/${anno}`;
}

export function creaFattura(f: {
  cliente_id: number;
  importo: number;
  descrizione?: string | null;
  stato?: string;
}) {
  const numero = prossimoNumeroFattura();
  const data = new Date().toISOString().slice(0, 10);
  const r = db()
    .prepare(
      `INSERT INTO fatture (cliente_id, numero, importo, descrizione, stato, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(f.cliente_id, numero, f.importo, f.descrizione ?? null, f.stato ?? "emessa", data, nowISO());
  return db().prepare("SELECT * FROM fatture WHERE id = ?").get(Number(r.lastInsertRowid));
}

// ── Briefing mattutino ──────────────────────────────────────────────────────

export function briefingOggi() {
  const oggi = new Date().toISOString().slice(0, 10);
  const appuntamenti = listAppuntamenti(oggi, oggi);
  const daConfermare = appuntamenti.filter((a) => a.stato === "da_confermare");
  const comunicazioniNonViste = db()
    .prepare(
      "SELECT COUNT(*) AS n FROM comunicazioni WHERE direzione = 'in' AND substr(created_at,1,10) = ?"
    )
    .get(oggi) as { n: number };
  const pagamentiInSospeso = db()
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(importo),0) AS tot FROM pagamenti WHERE stato = 'da_incassare'")
    .get() as { n: number; tot: number };

  // Clienti inattivi: ultima visita oltre 30 giorni fa
  const limite = new Date();
  limite.setDate(limite.getDate() - 30);
  const clientiInattivi = db()
    .prepare(
      "SELECT COUNT(*) AS n FROM clienti WHERE ultima_visita IS NOT NULL AND ultima_visita < ?"
    )
    .get(limite.toISOString().slice(0, 10)) as { n: number };

  const promemoria = db()
    .prepare(
      "SELECT COUNT(*) AS n FROM promemoria WHERE completato = 0 AND (scadenza IS NULL OR scadenza <= ?)"
    )
    .get(oggi) as { n: number };

  const inAttesa = db().prepare("SELECT COUNT(*) AS n FROM lista_attesa").get() as { n: number };

  return {
    data: oggi,
    appuntamenti,
    totaleAppuntamenti: appuntamenti.length,
    daConfermare: daConfermare.length,
    messaggiRicevutiOggi: comunicazioniNonViste.n,
    pagamentiInSospeso: pagamentiInSospeso.n,
    importoInSospeso: pagamentiInSospeso.tot,
    clientiInattivi: clientiInattivi.n,
    promemoriaAttivi: promemoria.n,
    inAttesa: inAttesa.n,
  };
}

// ── Promemoria ──────────────────────────────────────────────────────────────

export function creaPromemoria(p: {
  cliente_id?: number | null;
  testo: string;
  categoria?: string;
  scadenza?: string | null;
}): Promemoria {
  const r = db()
    .prepare(
      `INSERT INTO promemoria (cliente_id, testo, categoria, scadenza, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(p.cliente_id ?? null, p.testo, p.categoria ?? "attivita", p.scadenza ?? null, nowISO());
  return db()
    .prepare(
      `SELECT pr.*, c.nome AS cliente_nome FROM promemoria pr LEFT JOIN clienti c ON c.id = pr.cliente_id WHERE pr.id = ?`
    )
    .get(Number(r.lastInsertRowid)) as Promemoria;
}

export function listPromemoria(includiCompletati = false): Promemoria[] {
  const where = includiCompletati ? "" : "WHERE pr.completato = 0";
  return db()
    .prepare(
      `SELECT pr.*, c.nome AS cliente_nome FROM promemoria pr LEFT JOIN clienti c ON c.id = pr.cliente_id
       ${where} ORDER BY (pr.scadenza IS NULL), pr.scadenza, pr.created_at`
    )
    .all() as Promemoria[];
}

export function completaPromemoria(id: number): boolean {
  const r = db().prepare("UPDATE promemoria SET completato = 1 WHERE id = ?").run(id);
  return r.changes > 0;
}

// ── Documenti ─────────────────────────────────────────────────────────────

export function creaDocumento(d: {
  cliente_id?: number | null;
  titolo: string;
  tipo?: string;
  testo?: string | null;
  immagine?: string | null;
}): Documento {
  const r = db()
    .prepare(
      `INSERT INTO documenti (cliente_id, titolo, tipo, testo, immagine, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(d.cliente_id ?? null, d.titolo, d.tipo ?? "documento", d.testo ?? null, d.immagine ?? null, nowISO());
  return db()
    .prepare(
      `SELECT dc.*, c.nome AS cliente_nome FROM documenti dc LEFT JOIN clienti c ON c.id = dc.cliente_id WHERE dc.id = ?`
    )
    .get(Number(r.lastInsertRowid)) as Documento;
}

export function listDocumenti(): Documento[] {
  return db()
    .prepare(
      `SELECT dc.id, dc.cliente_id, dc.titolo, dc.tipo, dc.testo, dc.created_at, c.nome AS cliente_nome
       FROM documenti dc LEFT JOIN clienti c ON c.id = dc.cliente_id ORDER BY dc.created_at DESC LIMIT 30`
    )
    .all() as Documento[];
}

// ── Lista d'attesa ──────────────────────────────────────────────────────────

export function aggiungiAttesa(v: {
  cliente_id?: number | null;
  nome: string;
  motivo?: string | null;
  priorita?: string;
}): VoceAttesa {
  const r = db()
    .prepare(
      `INSERT INTO lista_attesa (cliente_id, nome, motivo, priorita, created_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run(v.cliente_id ?? null, v.nome, v.motivo ?? null, v.priorita ?? "normale", nowISO());
  return db().prepare("SELECT * FROM lista_attesa WHERE id = ?").get(Number(r.lastInsertRowid)) as VoceAttesa;
}

export function listAttesa(): VoceAttesa[] {
  return db()
    .prepare(
      "SELECT * FROM lista_attesa ORDER BY CASE priorita WHEN 'alta' THEN 0 ELSE 1 END, created_at"
    )
    .all() as VoceAttesa[];
}

export function rimuoviAttesa(id: number): boolean {
  return db().prepare("DELETE FROM lista_attesa WHERE id = ?").run(id).changes > 0;
}

// ── Analisi proattiva ─────────────────────────────────────────────────────

export function analisiProattiva(): { segnalazioni: Segnalazione[] } {
  const segnalazioni: Segnalazione[] = [];
  const oggi = new Date().toISOString().slice(0, 10);
  const tra7 = new Date();
  tra7.setDate(tra7.getDate() + 7);
  const a7 = tra7.toISOString().slice(0, 10);

  // Appuntamenti non confermati nei prossimi 7 giorni
  const nonConfermati = db()
    .prepare(
      `SELECT a.*, c.nome AS cliente_nome FROM appuntamenti a LEFT JOIN clienti c ON c.id = a.cliente_id
       WHERE a.stato = 'da_confermare' AND substr(a.inizio,1,10) >= ? AND substr(a.inizio,1,10) <= ?`
    )
    .all(oggi, a7) as Appuntamento[];
  if (nonConfermati.length) {
    segnalazioni.push({
      categoria: "non_confermati",
      titolo: `${nonConfermati.length} appuntament${nonConfermati.length === 1 ? "o" : "i"} da confermare`,
      dettaglio: nonConfermati
        .map((a) => `${a.cliente_nome ?? a.titolo} (${a.inizio.slice(0, 10)})`)
        .join(", "),
      azione: "Inviare un promemoria di conferma via WhatsApp.",
    });
  }

  // Pagamenti da incassare
  const dovuti = db()
    .prepare(
      "SELECT COUNT(*) AS n, COALESCE(SUM(importo),0) AS tot FROM pagamenti WHERE stato = 'da_incassare'"
    )
    .get() as { n: number; tot: number };
  if (dovuti.n > 0) {
    segnalazioni.push({
      categoria: "pagamenti",
      titolo: `${dovuti.n} pagament${dovuti.n === 1 ? "o" : "i"} in sospeso`,
      dettaglio: `Totale da incassare: ${dovuti.tot.toFixed(2)} €`,
      azione: "Sollecitare i pagamenti mancanti.",
    });
  }

  // Clienti inattivi (oltre 45 giorni)
  const limite = new Date();
  limite.setDate(limite.getDate() - 45);
  const inattivi = db()
    .prepare(
      "SELECT nome, ultima_visita FROM clienti WHERE ultima_visita IS NOT NULL AND ultima_visita < ? ORDER BY ultima_visita"
    )
    .all(limite.toISOString().slice(0, 10)) as { nome: string; ultima_visita: string }[];
  if (inattivi.length) {
    segnalazioni.push({
      categoria: "inattivi",
      titolo: `${inattivi.length} client${inattivi.length === 1 ? "e" : "i"} inattiv${inattivi.length === 1 ? "o" : "i"}`,
      dettaglio: inattivi
        .slice(0, 5)
        .map((c) => `${c.nome} (dal ${c.ultima_visita})`)
        .join(", "),
      azione: "Proporre un controllo di richiamo.",
    });
  }

  // Promemoria scaduti o per oggi
  const promScaduti = db()
    .prepare(
      "SELECT testo, scadenza FROM promemoria WHERE completato = 0 AND scadenza IS NOT NULL AND scadenza <= ?"
    )
    .all(oggi) as { testo: string; scadenza: string }[];
  if (promScaduti.length) {
    segnalazioni.push({
      categoria: "promemoria",
      titolo: `${promScaduti.length} promemoria in scadenza`,
      dettaglio: promScaduti.map((p) => p.testo).join(", "),
      azione: "Evadere o riprogrammare.",
    });
  }

  // Buchi in agenda oggi + lista d'attesa
  const appOggi = (
    db()
      .prepare(
        `SELECT * FROM appuntamenti WHERE substr(inizio,1,10) = ? AND stato != 'cancellato' ORDER BY inizio`
      )
      .all(oggi) as Appuntamento[]
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

  return { segnalazioni };
}
