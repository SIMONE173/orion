import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { runWithTenant } from "../tenant";
import { salvaAbbonamento } from "../data";
import {
  costoMicro,
  registraConsumo,
  spesaMeseMicro,
  statoBudget,
  marcaAvviso,
  meseCorrente,
  riepilogoAdmin,
} from "../consumi";

// L'ECONOMIA DI ORION: costi stimati giusti, tetto morbido generoso, avvisi
// detti una volta sola, ed esenzioni per proprietario/tester/demo.

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
  db().prepare("DELETE FROM budget_avvisi WHERE tenant_id = ?").run(TN);
  db().prepare("DELETE FROM abbonamenti WHERE tenant_id = ?").run(TN);
  db().prepare("DELETE FROM utenti WHERE id = ?").run(TN);
}

before(() => {
  // Stripe "acceso" (senza chiavi vere): fa scattare i budget veri.
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.STRIPE_PRICE_PRO = "price_x";
  process.env.ORION_LANCIO = "2000-01-01T00:00:00+01:00"; // lucchetto aperto: niente esenzioni tester
  delete process.env.ORION_ADMIN_EMAIL;
  db()
    .prepare("INSERT OR IGNORE INTO utenti (id, email, password_hash, nome, created_at) VALUES (?, 'consumi-test@x.it', 'x', 'Test', ?)")
    .run(TN, new Date().toISOString());
});
beforeEach(() => {
  db().prepare("DELETE FROM consumo_ai WHERE tenant_id = ?").run(TN);
  db().prepare("DELETE FROM budget_avvisi WHERE tenant_id = ?").run(TN);
  db().prepare("DELETE FROM abbonamenti WHERE tenant_id = ?").run(TN);
  db()
    .prepare("INSERT OR IGNORE INTO utenti (id, email, password_hash, nome, created_at) VALUES (?, 'consumi-test@x.it', 'x', 'Test', ?)")
    .run(TN, new Date().toISOString());
});
after(() => {
  pulisci();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PRICE_PRO;
  delete process.env.ORION_LANCIO;
});

test("costoMicro: listino opus e haiku applicati per famiglia", () => {
  const c = turno();
  // opus: 1000×15 + 500×75 + 20000×1.5 = 15000+37500+30000 = 82500 µ$
  assert.equal(costoMicro("claude-opus-4-8", c), 82500);
  // haiku: 1000×1 + 500×5 + 20000×0.1 = 1000+2500+2000 = 5500 µ$
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

test("tetto morbido: sotto l'80% tutto normale, poi quasi, poi oltre", () => {
  runWithTenant(TN, () => salvaAbbonamento({ stato: "attivo", piano: "pro", periodo_fine: new Date(Date.now() + 86400000).toISOString() }));
  // budget pro default: $13 = 13.000.000 µ$
  const s0 = statoBudget(TN);
  assert.equal(s0.budgetMicro, 13_000_000);
  assert.equal(s0.quasi, false);

  // spingo il consumo a ~85%
  registraConsumo(TN, "claude-opus-4-8", turno({ input: 700_000, output: 0, cacheLettura: 0, cacheScrittura: 0 })); // 10.5M
  registraConsumo(TN, "claude-opus-4-8", turno({ input: 40_000, output: 0, cacheLettura: 0, cacheScrittura: 0 })); // +0.6M → 11.1M ≈ 85%
  const s1 = statoBudget(TN);
  assert.equal(s1.quasi, true);
  assert.equal(s1.oltre, false);

  // sfondo il 100%
  registraConsumo(TN, "claude-opus-4-8", turno({ input: 200_000, output: 0, cacheLettura: 0, cacheScrittura: 0 })); // +3M → oltre
  const s2 = statoBudget(TN);
  assert.equal(s2.oltre, true);
});

test("gli avvisi si dicono UNA volta sola per mese", () => {
  assert.equal(marcaAvviso(TN, "80"), true);
  assert.equal(marcaAvviso(TN, "80"), false);
  assert.equal(marcaAvviso(TN, "100"), true);
  assert.equal(marcaAvviso(TN, "100"), false);
});

test("piano azienda: budget più alto", () => {
  runWithTenant(TN, () => salvaAbbonamento({ stato: "attivo", piano: "azienda", periodo_fine: new Date(Date.now() + 86400000).toISOString() }));
  assert.equal(statoBudget(TN).budgetMicro, 45_000_000);
});

test("esenzioni: proprietario e modalità demo non hanno tetto", () => {
  // proprietario
  process.env.ORION_ADMIN_EMAIL = "consumi-test@x.it";
  assert.equal(statoBudget(TN).budgetMicro, null);
  delete process.env.ORION_ADMIN_EMAIL;
  // demo (stripe spento)
  const k = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  assert.equal(statoBudget(TN).budgetMicro, null);
  process.env.STRIPE_SECRET_KEY = k;
});

test("tester del collaudo: senza tetto finché il lucchetto è chiuso", () => {
  process.env.ORION_LANCIO = "2099-01-01T00:00:00+01:00"; // chiuso
  process.env.ORION_LANCIO_ECCEZIONI = "consumi-test@x.it";
  assert.equal(statoBudget(TN).budgetMicro, null);
  // al lancio l'esenzione sparisce
  process.env.ORION_LANCIO = "2000-01-01T00:00:00+01:00";
  assert.notEqual(statoBudget(TN).budgetMicro, null);
  delete process.env.ORION_LANCIO_ECCEZIONI;
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
