import { db } from "./db";

// ── BETA TESTER (iscrizioni dalla vetrina, pre-lancio) ───────────────────────
// Posti limitati: crea urgenza e tiene sotto controllo supporto e costi AI.
// Numero e sconto founding-member sono configurabili (env), con default sensati.

export const POSTI_BETA = Number(process.env.ORION_BETA_POSTI || 50);
export const SCONTO_BETA = Number(process.env.ORION_BETA_SCONTO || 30); // % a vita

export function contaBeta(): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM beta_tester").get() as { n: number }).n;
}

// L'email è nella lista beta? → founding member: sconto a vita, agganciato
// in automatico all'account (checkout e abbonamento). Confronto per email.
export function eBetaTester(email: string | null | undefined): boolean {
  const e = (email || "").toLowerCase().trim();
  if (!e) return false;
  return Boolean(db().prepare("SELECT 1 FROM beta_tester WHERE email = ?").get(e));
}

export function statoBeta(): { posti: number; iscritti: number; rimasti: number; aperto: boolean; sconto: number } {
  const iscritti = contaBeta();
  const rimasti = Math.max(0, POSTI_BETA - iscritti);
  return { posti: POSTI_BETA, iscritti, rimasti, aperto: rimasti > 0, sconto: SCONTO_BETA };
}

// Ritorna: 'ok' (iscritto), 'gia' (email già in lista), 'pieno' (posti esauriti).
export function iscriviBeta(d: { email: string; nome?: string | null; professione?: string | null }): "ok" | "gia" | "pieno" {
  const email = d.email.toLowerCase().trim();
  const esiste = db().prepare("SELECT 1 FROM beta_tester WHERE email = ?").get(email);
  if (esiste) return "gia";
  if (contaBeta() >= POSTI_BETA) return "pieno";
  db()
    .prepare("INSERT INTO beta_tester (email, nome, professione, created_at) VALUES (?, ?, ?, ?)")
    .run(email, d.nome?.trim() || null, d.professione?.trim() || null, new Date().toISOString());
  return "ok";
}
