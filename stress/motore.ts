// ──────────────────────────────────────────────────────────────────────────
// STRESS TEST — IL PILOTA. Impersona utenti veri contro un server ORION
// locale (npm run dev): crea account di prova, tiene i cookie di sessione,
// conversa con il cervello come farebbe la UI, verifica il DATABASE dopo
// ogni turno e tiene la CONTABILITÀ ESATTA dei crediti spesi (dal campo
// `consumo` che il cervello ora restituisce). Si ferma da solo al budget.
//
//   npx tsx stress/run.ts [--budget 8] [--lotto fondamenta|azienda|...]
// ──────────────────────────────────────────────────────────────────────────
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const BASE = process.env.STRESS_BASE || "http://localhost:3000";

// Prezzi per M token (stima classe Opus; sovrascrivibili da env se cambiano).
const PREZZI = {
  input: Number(process.env.PREZZO_INPUT || 5),
  output: Number(process.env.PREZZO_OUTPUT || 25),
  cacheScrittura: Number(process.env.PREZZO_CACHE_W || 6.25),
  cacheLettura: Number(process.env.PREZZO_CACHE_R || 0.5),
};

export type Consumo = { input: number; output: number; cacheScrittura: number; cacheLettura: number; chiamate: number };
export type Risposta = {
  testo: string;
  viste: { tipo: string; [k: string]: unknown }[];
  azioni?: { tipo: string; [k: string]: unknown }[];
  suggerimenti?: string[];
  errore?: string;
  consumo?: Consumo;
};

// ── Contabilità ──────────────────────────────────────────────────────────────
export const spesa = { euro: 0, turni: 0, chiamate: 0, budgetEuro: 8 };
export function registraConsumo(c?: Consumo) {
  if (!c) return;
  spesa.turni++;
  spesa.chiamate += c.chiamate;
  const usd =
    (c.input * PREZZI.input + c.output * PREZZI.output + c.cacheScrittura * PREZZI.cacheScrittura + c.cacheLettura * PREZZI.cacheLettura) /
    1_000_000;
  spesa.euro += usd * 0.92; // cambio prudente USD→EUR
}
export function budgetSuperato(): boolean {
  return spesa.euro >= spesa.budgetEuro;
}

// ── Utenti simulati (cookie di sessione per ciascuno) ───────────────────────
export type Pilota = {
  email: string;
  cookie: string;
  storia: { role: "user" | "assistant"; content: string }[];
};

export async function creaAccount(email: string, nome: string): Promise<Pilota> {
  const r = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Stress-Test-2026!", nome }),
  });
  let setCookie = r.headers.get("set-cookie") ?? "";
  if (!r.ok) {
    // Account già esistente da un giro precedente → login.
    const l = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "Stress-Test-2026!" }),
    });
    if (!l.ok) throw new Error(`signup/login falliti per ${email}: ${r.status}/${l.status}`);
    setCookie = l.headers.get("set-cookie") ?? "";
  }
  const m = /orion_sess=([^;]+)/.exec(setCookie);
  if (!m) throw new Error(`nessun cookie di sessione per ${email}`);
  return { email, cookie: `orion_sess=${m[1]}`, storia: [] };
}

// Un turno di conversazione: manda la storia + la frase, registra la risposta.
export async function dice(
  p: Pilota,
  frase: string,
  opz: { avvio?: boolean; desktop?: boolean; allegato?: { dataUrl: string } } = {}
): Promise<Risposta> {
  if (!opz.avvio) p.storia.push({ role: "user", content: frase });
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: p.cookie },
    body: JSON.stringify({
      messages: p.storia,
      avvio: opz.avvio === true,
      desktop: opz.desktop === true,
      ...(opz.allegato ? { allegato: opz.allegato } : {}),
    }),
  });
  const dati = (await r.json()) as Risposta;
  registraConsumo(dati.consumo);
  if (dati.testo) p.storia.push({ role: "assistant", content: dati.testo });
  return dati;
}

// "Riapre ORION" il giorno dopo / a metà giornata: come la UI, manda la storia
// accumulata con avvio=true (il server aggiunge la direttiva del saluto/briefing).
export async function riapre(p: Pilota): Promise<Risposta> {
  return dice(p, "", { avvio: true });
}

// Conversazione NUOVA sullo stesso account (es. il pilota "desktop": ambiente
// coerente dal primo turno, senza il contesto misto della chat precedente).
export function nuovaConversazione(p: Pilota) {
  p.storia = [];
}

// ── Lente sul database (verità, non parole) ──────────────────────────────────
let _db: Database.Database | null = null;
export function dbLocale(): Database.Database {
  if (!_db) {
    const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    _db = new Database(path.join(dir, "orion.db"), { readonly: true, fileMustExist: true });
  }
  return _db;
}
export function tenantDi(email: string): number {
  const u = dbLocale().prepare("SELECT id, tenant_id FROM utenti WHERE email = ?").get(email) as
    | { id: number; tenant_id: number | null }
    | undefined;
  if (!u) throw new Error(`utente ${email} non trovato nel DB`);
  return u.tenant_id ?? u.id;
}
export function conta(tabella: string, tenantId: number, dove = "", parametri: unknown[] = []): number {
  const r = dbLocale()
    .prepare(`SELECT COUNT(*) n FROM ${tabella} WHERE tenant_id = ? ${dove ? `AND ${dove}` : ""}`)
    .get(tenantId, ...parametri) as { n: number };
  return r.n;
}
export function riga<T = Record<string, unknown>>(sql: string, ...parametri: unknown[]): T | undefined {
  return dbLocale().prepare(sql).get(...parametri) as T | undefined;
}

// ── Verifiche (ergonomia degli scenari) ──────────────────────────────────────
export type Esito = { scenario: string; passo: string; ok: boolean; dettaglio?: string };
export const esiti: Esito[] = [];

export function verifica(scenario: string, passo: string, condizione: boolean, dettaglio?: string) {
  esiti.push({ scenario, passo, ok: condizione, ...(condizione ? {} : { dettaglio }) });
  const segno = condizione ? "  ✓" : "  ✗";
  console.log(`${segno} ${passo}${condizione ? "" : `  ← ${dettaglio ?? "fallito"}`}`);
}
export function haVista(r: Risposta, tipo: string): boolean {
  return (r.viste ?? []).some((v) => v.tipo === tipo);
}
export function haAzione(r: Risposta, tipo: string): boolean {
  return (r.azioni ?? []).some((a) => a.tipo === tipo);
}
export function rispostaSana(r: Risposta): boolean {
  return !r.errore && typeof r.testo === "string" && r.testo.length > 0;
}

// ── Trascrizioni (per rileggere cosa ha detto ORION) ─────────────────────────
const CARTELLA_RAPPORTI = path.join(process.cwd(), "stress", "rapporti");
let fileTrascrizione = "";
export function apriTrascrizione(nome: string) {
  fs.mkdirSync(CARTELLA_RAPPORTI, { recursive: true });
  fileTrascrizione = path.join(CARTELLA_RAPPORTI, `${new Date().toISOString().slice(0, 10)}-${nome}.md`);
  fs.writeFileSync(fileTrascrizione, `# Stress test — ${nome}\n\n`);
}
export function annota(testo: string) {
  if (fileTrascrizione) fs.appendFileSync(fileTrascrizione, testo + "\n");
}
export function trascriviTurno(chi: string, frase: string, r: Risposta) {
  annota(`**${chi}:** ${frase}\n`);
  annota(`**ORION:** ${r.testo}\n`);
  if (r.viste?.length) annota(`_viste: ${r.viste.map((v) => v.tipo).join(", ")}_`);
  if (r.azioni?.length) annota(`_azioni: ${r.azioni.map((a) => a.tipo).join(", ")}_`);
  if (r.errore) annota(`⚠️ errore: ${r.errore}`);
  annota("");
}

// Riassunto finale a console + file.
export function rapportoFinale(): { passati: number; falliti: number } {
  const passati = esiti.filter((e) => e.ok).length;
  const falliti = esiti.filter((e) => !e.ok);
  console.log("\n══════════════════════════════════════════");
  console.log(`ESITO: ${passati}/${esiti.length} verifiche passate — spesa ~€${spesa.euro.toFixed(2)} (${spesa.chiamate} chiamate)`);
  for (const f of falliti) console.log(`  ✗ [${f.scenario}] ${f.passo} — ${f.dettaglio ?? ""}`);
  annota(`\n---\n**Esito: ${passati}/${esiti.length}** — spesa ~€${spesa.euro.toFixed(2)}`);
  return { passati, falliti: falliti.length };
}
