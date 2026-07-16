import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { costoMicro, registraConsumo, spesaMeseMicro, meseCorrente, riepilogoAdmin } from "../consumi";

// I CONSUMI AI: solo osservazione (nessun limite per scelta del fondatore).
// Qui si verifica che i conti tornino al microdollaro e che il pannello
// del proprietario veda i numeri giusti.

const TN = 990808;
const turno = (over: Partial<Parameters<typeof costoMicro>[1]> = {}) => ({
  input: 1000,
  output: 500,
  cacheScrittura: 0,
  cacheLettura: 20000,
  chiamate: 2,
  ...over,
});

function pulisci() {
  db().prepare("DELETE FROM consumo_ai WHERE tenant_id = ?").run(TN);
  db().prepare("DELETE FROM utenti WHERE id = ?").run(TN);
}

before(() => {
  db()
    .prepare("INSERT OR IGNORE INTO utenti (id, email, password_hash, nome, created_at) VALUES (?, 'consumi-test@x.it', 'x', 'Test', ?)")
    .run(TN, new Date().toISOString());
});
beforeEach(() => {
  db().prepare("DELETE FROM consumo_ai WHERE tenant_id = ?").run(TN);
  db()
    .prepare("INSERT OR IGNORE INTO utenti (id, email, password_hash, nome, created_at) VALUES (?, 'consumi-test@x.it', 'x', 'Test', ?)")
    .run(TN, new Date().toISOString());
});
after(() => pulisci());

test("costoMicro: listino opus e haiku applicati per famiglia", () => {
  const c = turno();
  // opus: 1000×15 + 500×75 + 20000×1.5 = 82500 µ$
  assert.equal(costoMicro("claude-opus-4-8", c), 82500);
  // haiku: 1000×1 + 500×5 + 20000×0.1 = 5500 µ$
  assert.equal(costoMicro("claude-haiku-4-5-20251001", c), 5500);
  // sconosciuto → prudente come opus
  assert.equal(costoMicro("modello-misterioso", c), 82500);
});

test("registraConsumo accumula per mese e modello", () => {
  registraConsumo(TN, "claude-opus-4-8", turno());
  registraConsumo(TN, "claude-opus-4-8", turno());
  registraConsumo(TN, "claude-haiku-4-5-20251001", turno());
  assert.equal(spesaMeseMicro(TN), 82500 * 2 + 5500);
  const riga = db()
    .prepare("SELECT turni, chiamate FROM consumo_ai WHERE tenant_id = ? AND mese = ? AND modello = 'claude-opus-4-8'")
    .get(TN, meseCorrente()) as { turni: number; chiamate: number };
  assert.equal(riga.turni, 2);
  assert.equal(riga.chiamate, 4);
});

test("riepilogoAdmin: la classifica vede l'account e i suoi numeri", () => {
  registraConsumo(TN, "claude-opus-4-8", turno());
  const r = riepilogoAdmin();
  const mia = r.righe.find((x) => x.tenantId === TN);
  assert.ok(mia);
  assert.equal(mia!.email, "consumi-test@x.it");
  assert.equal(mia!.turni, 1);
  assert.ok(mia!.costoMicro > 0);
  assert.ok(r.totaleMicro >= mia!.costoMicro);
});
