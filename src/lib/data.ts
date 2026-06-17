import { db } from "./db";
import { tenantIdCorrente } from "./tenant";

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

const nowISO = () => new Date().toISOString();
const T = () => tenantIdCorrente();

// ── Profilo / memoria operativa ───────────────────────────────────────────

export function getProfilo(): Profilo {
  return db().prepare("SELECT * FROM profili WHERE tenant_id = ?").get(T()) as Profilo;
}

const CAMPI_PROFILO = [
  "nome", "professione", "durata_visita_min", "gestione_cancellazioni",
  "canale_comunicazione", "problemi_tempo", "abitudini", "piva", "codice_fiscale",
  "indirizzo", "regime_fiscale", "pec", "sdi", "onboarding_completo",
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
      `INSERT INTO clienti (tenant_id, nome, telefono, email, note, piva, codice_fiscale, indirizzo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      T(), c.nome, c.telefono ?? null, c.email ?? null, c.note ?? null,
      c.piva ?? null, c.codice_fiscale ?? null, c.indirizzo ?? null, nowISO()
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
  return { cliente, appuntamenti, pagamenti, comunicazioni, note, totaleIncassato };
}

// ── Agenda ────────────────────────────────────────────────────────────────

const APP_JOIN = `
  SELECT a.*, c.nome AS cliente_nome
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
  db().prepare("UPDATE appuntamenti SET inizio = ?, fine = ? WHERE id = ? AND tenant_id = ?").run(inizio, fine, id, T());
  return getAppuntamento(id);
}

export function aggiornaStatoAppuntamento(id: number, stato: string): Appuntamento | undefined {
  db().prepare("UPDATE appuntamenti SET stato = ? WHERE id = ? AND tenant_id = ?").run(stato, id, T());
  return getAppuntamento(id);
}

export function eliminaAppuntamento(id: number): boolean {
  return (
    db().prepare("UPDATE appuntamenti SET stato = 'cancellato' WHERE id = ? AND tenant_id = ?").run(id, T())
      .changes > 0
  );
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

// ── Fatture ─────────────────────────────────────────────────────────────────

export function prossimoNumeroFattura(): string {
  const anno = new Date().getFullYear();
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM fatture WHERE tenant_id = ? AND substr(data,1,4) = ?")
    .get(T(), String(anno)) as { n: number };
  return `${row.n + 1}/${anno}`;
}

export function creaFattura(f: { cliente_id: number; importo: number; descrizione?: string | null; stato?: string }) {
  const numero = prossimoNumeroFattura();
  const data = new Date().toISOString().slice(0, 10);
  const r = db()
    .prepare(
      `INSERT INTO fatture (tenant_id, cliente_id, numero, importo, descrizione, stato, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(T(), f.cliente_id, numero, f.importo, f.descrizione ?? null, f.stato ?? "emessa", data, nowISO());
  return db().prepare("SELECT * FROM fatture WHERE id = ?").get(Number(r.lastInsertRowid));
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
      a.token, a.stato ?? "collegato", now, now
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

  return { segnalazioni };
}
