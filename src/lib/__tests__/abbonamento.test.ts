import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { runWithTenant } from "../tenant";
import { db } from "../db";
import { statoAbbonamento, salvaAbbonamento } from "../data";

// ABBONAMENTI: la macchina a stati del paywall. La prova (7gg) la gestisce
// Stripe (carta richiesta): senza abbonamento in prova/attivo → niente accesso.

const TN = 990707;
const fra = (giorni: number) => new Date(Date.now() + giorni * 86_400_000).toISOString();

function pulisci() {
  db().prepare("DELETE FROM abbonamenti WHERE tenant_id = ?").run(TN);
}

before(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.STRIPE_PRICE_PRO = "price_pro_x";
  delete process.env.ORION_ADMIN_EMAIL;
});
beforeEach(() => pulisci());
after(() => {
  pulisci();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PRICE_PRO;
});

test("Stripe spento = modalità demo, accesso libero", () => {
  const key = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  runWithTenant(TN, () => {
    const s = statoAbbonamento();
    assert.equal(s.stato, "demo");
    assert.equal(s.accessoConsentito, true);
  });
  process.env.STRIPE_SECRET_KEY = key;
});

test("nuovo utente senza abbonamento → da_attivare, NIENTE accesso (deve mettere la carta)", () => {
  runWithTenant(TN, () => {
    const s = statoAbbonamento();
    assert.equal(s.stato, "da_attivare");
    assert.equal(s.accessoConsentito, false);
  });
});

test("in prova (trialing) → accesso, con giorni rimasti e piano", () => {
  runWithTenant(TN, () => {
    salvaAbbonamento({ stripe_customer_id: "cus_1", stato: "prova", piano: "pro", periodo_fine: fra(7) });
    const s = statoAbbonamento();
    assert.equal(s.stato, "prova");
    assert.equal(s.accessoConsentito, true);
    assert.equal(s.inProva, true);
    assert.equal(s.piano, "pro");
    assert.ok(s.giorniProvaRimasti >= 6 && s.giorniProvaRimasti <= 7);
  });
});

test("attivo (pagante) → accesso; azienda porta il piano giusto", () => {
  runWithTenant(TN, () => {
    salvaAbbonamento({ stripe_customer_id: "cus_2", stato: "attivo", piano: "azienda", periodo_fine: fra(30) });
    const s = statoAbbonamento();
    assert.equal(s.stato, "attivo");
    assert.equal(s.attivo, true);
    assert.equal(s.accessoConsentito, true);
    assert.equal(s.piano, "azienda");
  });
});

test("annullato ma ancora nel periodo pagato → accesso fino a scadenza", () => {
  runWithTenant(TN, () => {
    salvaAbbonamento({ stato: "annullato", piano: "pro", periodo_fine: fra(3) });
    assert.equal(statoAbbonamento().accessoConsentito, true);
  });
});

test("periodo scaduto → niente accesso (scaduto)", () => {
  runWithTenant(TN, () => {
    salvaAbbonamento({ stato: "attivo", piano: "pro", periodo_fine: fra(-1) });
    const s = statoAbbonamento();
    assert.equal(s.stato, "scaduto");
    assert.equal(s.accessoConsentito, false);
  });
});

test("proprietario (ORION_ADMIN_EMAIL) → accesso pieno senza pagare", () => {
  process.env.ORION_ADMIN_EMAIL = "capo@orionvision.it";
  runWithTenant(TN, () => {
    assert.equal(statoAbbonamento("capo@orionvision.it").accessoConsentito, true);
    assert.equal(statoAbbonamento("Capo@OrionVision.IT").accessoConsentito, true); // case-insensitive
    assert.equal(statoAbbonamento("altro@x.it").accessoConsentito, false);
  });
  delete process.env.ORION_ADMIN_EMAIL;
});

// ── FOUNDING MEMBER: chi è nella lista beta ha lo sconto a vita sull'account ──

test("email nella lista beta → founder con sconto a vita (case-insensitive)", () => {
  const EMAIL = "founder-test@orionvision.it";
  db().prepare("DELETE FROM beta_tester WHERE email = ?").run(EMAIL);
  db()
    .prepare("INSERT INTO beta_tester (email, nome, professione, created_at) VALUES (?, NULL, NULL, ?)")
    .run(EMAIL, new Date().toISOString());
  runWithTenant(TN, () => {
    const s = statoAbbonamento(EMAIL);
    assert.equal(s.founder, true);
    assert.ok(s.scontoFounder > 0); // la % viene da ORION_BETA_SCONTO (default 30)
    // Maiuscole/minuscole non contano: è la stessa persona.
    assert.equal(statoAbbonamento("Founder-Test@OrionVision.IT").founder, true);
  });
  db().prepare("DELETE FROM beta_tester WHERE email = ?").run(EMAIL);
});

test("email NON in lista beta → nessuno sconto founder", () => {
  runWithTenant(TN, () => {
    const s = statoAbbonamento("estraneo@x.it");
    assert.equal(s.founder, false);
    assert.equal(s.scontoFounder, 0);
  });
});

test("il founder resta founder in ogni stato dell'abbonamento (prova e attivo)", () => {
  const EMAIL = "founder-stati@orionvision.it";
  db().prepare("DELETE FROM beta_tester WHERE email = ?").run(EMAIL);
  db()
    .prepare("INSERT INTO beta_tester (email, nome, professione, created_at) VALUES (?, NULL, NULL, ?)")
    .run(EMAIL, new Date().toISOString());
  runWithTenant(TN, () => {
    salvaAbbonamento({ stripe_customer_id: "cus_f", stato: "prova", piano: "pro", periodo_fine: fra(7) });
    assert.equal(statoAbbonamento(EMAIL).founder, true);
    salvaAbbonamento({ stato: "attivo", piano: "pro", periodo_fine: fra(30) });
    assert.equal(statoAbbonamento(EMAIL).founder, true);
  });
  db().prepare("DELETE FROM beta_tester WHERE email = ?").run(EMAIL);
});
