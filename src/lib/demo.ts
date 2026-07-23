import crypto from "node:crypto";
import { db } from "./db";
import { creaUtente, creaSessione, type Utente } from "./auth";
import { spesaMeseMicro } from "./consumi";

// ── ORION DEMO ───────────────────────────────────────────────────────────────
// La Demo è ORION vero, in miniatura e guidato: si scarica come app desktop
// dedicata ("ORION Demo" per Mac e Windows), si entra con UN clic — niente
// email, carta o P.IVA — e ORION stesso fa da guida col tutorial.
// Tre paletti la rendono sostenibile:
//   1. tetto di spesa AI per ogni demo (il tutorial ci sta comodo, un mese
//      di ORION gratis no);
//   2. dati usa-e-getta: la pulizia notturna smonta le demo scadute;
//   3. SOLO desktop: dal browser l'ingresso demo mostra i download, perché
//      il pezzo forte (la Mano che scrive nel gestionale vero) vive lì.

// Dominio riservato degli account demo. Nessuna registrazione pubblica può
// usarlo (bloccato in signup): il suffisso stesso È la prova che è una demo.
export const DOMINIO_DEMO = "demo.orionvision.it";

// Tetto di spesa AI per OGNI demo, in micro-euro (≈ 2,50 €): il giro completo
// misurato dal vivo costa ~1,60 € col motore demo — c'è respiro per chi
// chiacchiera di più, poi la demo saluta con garbo.
export const TETTO_DEMO_MICRO = 2_500_000;

// Vita di un account demo: dopo questi giorni la pulizia lo smonta.
export const GIORNI_VITA_DEMO = 3;

export function emailDemo(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase().trim().endsWith(`@${DOMINIO_DEMO}`);
}

// Il tenant è una demo? (per i demo il tenant coincide con l'utente)
export function tenantDemo(tenantId: number): boolean {
  const r = db().prepare("SELECT email FROM utenti WHERE id = ?").get(tenantId) as
    | { email?: string }
    | undefined;
  return emailDemo(r?.email);
}

// Crea l'account demo con la sua sessione: un clic e parte la Chiamata 0.
// La password è casuale e non viene mai comunicata: si entra SOLO con la
// sessione creata qui — a demo finita l'account è semplicemente irraggiungibile.
export function creaAccountDemo(): { utente: Utente; token: string } {
  const email = `demo-${crypto.randomBytes(6).toString("hex")}@${DOMINIO_DEMO}`;
  const utente = creaUtente(email, crypto.randomBytes(18).toString("hex"));
  // Niente casella vera da confermare: la verifica email non ha senso qui.
  db().prepare("UPDATE utenti SET email_verificata = 1 WHERE id = ?").run(utente.id);
  return { utente, token: creaSessione(utente.id) };
}

// La demo ha esaurito il suo tetto di crediti?
export function demoEsaurita(tenantId: number): boolean {
  return spesaMeseMicro(tenantId) >= TETTO_DEMO_MICRO;
}

// Quanto le resta, da 1 (tutta) a 0 (finita) — per il client, se mai servisse.
export function demoResiduo(tenantId: number): number {
  const speso = spesaMeseMicro(tenantId);
  return Math.max(0, Math.min(1, 1 - speso / TETTO_DEMO_MICRO));
}

// ── PULIZIA ──────────────────────────────────────────────────────────────────

// Le tabelle vengono lette dallo schema (PRAGMA), così la pulizia resta
// completa anche quando in futuro si aggiungono tabelle nuove.
function colonneDi(tabella: string): string[] {
  const righe = db().prepare(`PRAGMA table_info("${tabella}")`).all() as { name: string }[];
  return righe.map((r) => r.name);
}

function tuttaLaLista(): { nome: string; colonne: string[] }[] {
  const tabelle = db()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  return tabelle.map((t) => ({ nome: t.name, colonne: colonneDi(t.name) }));
}

// Smonta le demo più vecchie di GIORNI_VITA_DEMO: tutti i dati del tenant,
// le sessioni e l'utente. Si tiene SOLO consumo_ai: è contabilità (quanto è
// costata ogni demo), non dati del finto studio.
export function pulisciDemoScadute(): number {
  const limite = new Date(Date.now() - GIORNI_VITA_DEMO * 86_400_000).toISOString();
  const scaduti = db()
    .prepare("SELECT id FROM utenti WHERE email LIKE ? AND created_at < ?")
    .all(`%@${DOMINIO_DEMO}`, limite) as { id: number }[];
  if (!scaduti.length) return 0;

  const tabelle = tuttaLaLista();
  const smonta = db().transaction((id: number) => {
    for (const t of tabelle) {
      if (t.nome === "utenti" || t.nome === "consumo_ai") continue;
      if (t.colonne.includes("tenant_id")) db().prepare(`DELETE FROM "${t.nome}" WHERE tenant_id = ?`).run(id);
      if (t.colonne.includes("utente_id")) db().prepare(`DELETE FROM "${t.nome}" WHERE utente_id = ?`).run(id);
    }
    db().prepare("DELETE FROM utenti WHERE id = ?").run(id);
  });
  for (const u of scaduti) smonta(u.id);
  return scaduti.length;
}
