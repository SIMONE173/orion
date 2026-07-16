import { db } from "./db";

// ──────────────────────────────────────────────────────────────────────────
// I CONSUMI AI DI ORION — SOLO OSSERVAZIONE, NESSUN LIMITE (scelta del
// fondatore, 16/7/26: niente tetti per ora — se ne riparla coi dati in mano).
// Ogni turno registra token e costo stimato per account/mese: alimenta il
// pannello del proprietario (/admin) e nient'altro. L'esperienza dell'utente
// non viene MAI toccata da questo modulo.
// I costi sono stimati in MICRODOLLARI (interi) coi listini per token.
// ──────────────────────────────────────────────────────────────────────────

export type ConsumoTurno = {
  input: number;
  output: number;
  cacheScrittura: number;
  cacheLettura: number;
  chiamate: number;
};

// Listini in microdollari PER TOKEN (= dollari per milione di token).
// Riconoscimento per famiglia: regge anche ai cambi di versione del modello.
function prezziDi(modello: string): { in_: number; out: number; cacheR: number; cacheW: number } {
  const m = modello.toLowerCase();
  if (m.includes("haiku")) return { in_: 1, out: 5, cacheR: 0.1, cacheW: 1.25 };
  if (m.includes("sonnet")) return { in_: 3, out: 15, cacheR: 0.3, cacheW: 3.75 };
  // opus e sconosciuti: listino pieno (stima prudente, mai ottimista)
  return { in_: 15, out: 75, cacheR: 1.5, cacheW: 18.75 };
}

export function costoMicro(modello: string, c: ConsumoTurno): number {
  const p = prezziDi(modello);
  return Math.round(c.input * p.in_ + c.output * p.out + c.cacheLettura * p.cacheR + c.cacheScrittura * p.cacheW);
}

// Il mese contabile, nell'ora italiana ("2026-07").
export function meseCorrente(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(new Date());
}

// Registra il consumo di UN turno di conversazione (upsert incrementale).
export function registraConsumo(tenantId: number, modello: string, c: ConsumoTurno): void {
  const micro = costoMicro(modello, c);
  db()
    .prepare(
      `INSERT INTO consumo_ai (tenant_id, mese, modello, input, output, cache_lettura, cache_scrittura, chiamate, turni, costo_micro)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(tenant_id, mese, modello) DO UPDATE SET
         input = input + excluded.input,
         output = output + excluded.output,
         cache_lettura = cache_lettura + excluded.cache_lettura,
         cache_scrittura = cache_scrittura + excluded.cache_scrittura,
         chiamate = chiamate + excluded.chiamate,
         turni = turni + 1,
         costo_micro = costo_micro + excluded.costo_micro`
    )
    .run(tenantId, meseCorrente(), modello, c.input, c.output, c.cacheLettura, c.cacheScrittura, c.chiamate, micro);
}

export function spesaMeseMicro(tenantId: number): number {
  const r = db()
    .prepare("SELECT COALESCE(SUM(costo_micro),0) AS s FROM consumo_ai WHERE tenant_id = ? AND mese = ?")
    .get(tenantId, meseCorrente()) as { s: number };
  return r.s;
}

// ── Il riepilogo per il pannello del proprietario ───────────────────────────
export type RigaConsumi = {
  tenantId: number;
  email: string;
  nome: string | null;
  piano: string | null;
  statoAbbonamento: string | null;
  turni: number;
  chiamate: number;
  token: number;
  costoMicro: number;
  sessioniAttive: number;
};

export function riepilogoAdmin(): { mese: string; righe: RigaConsumi[]; totaleMicro: number; totaleTurni: number } {
  const mese = meseCorrente();
  // Tutti gli account che questo mese hanno consumato O hanno un abbonamento.
  const tenants = db()
    .prepare(
      `SELECT DISTINCT t FROM (
         SELECT tenant_id AS t FROM consumo_ai WHERE mese = ?
         UNION SELECT tenant_id AS t FROM abbonamenti
       )`
    )
    .all(mese) as { t: number }[];

  const righe: RigaConsumi[] = [];
  let totaleMicro = 0;
  let totaleTurni = 0;
  const adesso = new Date().toISOString();
  for (const { t } of tenants) {
    const owner = db().prepare("SELECT email, nome FROM utenti WHERE id = ?").get(t) as { email?: string; nome?: string | null } | undefined;
    const ab = db().prepare("SELECT piano, stato FROM abbonamenti WHERE tenant_id = ?").get(t) as { piano?: string | null; stato?: string | null } | undefined;
    const c = db()
      .prepare(
        `SELECT COALESCE(SUM(turni),0) AS turni, COALESCE(SUM(chiamate),0) AS chiamate, COALESCE(SUM(costo_micro),0) AS micro,
                COALESCE(SUM(input+output+cache_lettura+cache_scrittura),0) AS token
         FROM consumo_ai WHERE tenant_id = ? AND mese = ?`
      )
      .get(t, mese) as { turni: number; chiamate: number; micro: number; token: number };
    // Sessioni vive dell'account (titolare + team): il segnale anti-condivisione.
    const sess = db()
      .prepare(
        `SELECT COUNT(*) AS n FROM sessioni s JOIN utenti u ON u.id = s.utente_id
         WHERE (u.id = ? OR u.tenant_id = ?) AND s.expires_at > ?`
      )
      .get(t, t, adesso) as { n: number };
    righe.push({
      tenantId: t,
      email: owner?.email || `account #${t}`,
      nome: owner?.nome ?? null,
      piano: ab?.piano ?? null,
      statoAbbonamento: ab?.stato ?? null,
      turni: c.turni,
      chiamate: c.chiamate,
      token: c.token,
      costoMicro: c.micro,
      sessioniAttive: sess.n,
    });
    totaleMicro += c.micro;
    totaleTurni += c.turni;
  }
  righe.sort((a, b) => b.costoMicro - a.costoMicro);
  return { mese, righe, totaleMicro, totaleTurni };
}
