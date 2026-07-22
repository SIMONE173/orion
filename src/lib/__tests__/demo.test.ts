import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { runWithTenant } from "../tenant";
import { utenteDaSessione } from "../auth";
import { registraConsumo } from "../consumi";
import { statoAbbonamento } from "../data";
import {
  DOMINIO_DEMO,
  TETTO_DEMO_MICRO,
  GIORNI_VITA_DEMO,
  emailDemo,
  tenantDemo,
  creaAccountDemo,
  demoEsaurita,
  pulisciDemoScadute,
} from "../demo";

// ORION DEMO: l'assaggio scaricabile. Qui si collauda il suo triangolo di
// sicurezza — account usa-e-getta, tetto di spesa, pulizia completa.

const creati: number[] = [];

function eliminaUtenteDemo(id: number) {
  db().prepare("DELETE FROM sessioni WHERE utente_id = ?").run(id);
  db().prepare("DELETE FROM profili WHERE tenant_id = ?").run(id);
  db().prepare("DELETE FROM consumo_ai WHERE tenant_id = ?").run(id);
  db().prepare("DELETE FROM utenti WHERE id = ?").run(id);
}

before(() => {
  // Stripe "configurato" (serve anche il price): paywall VERO, lancio CHIUSO —
  // lo scenario più severo, in cui la demo deve comunque entrare.
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.STRIPE_PRICE_PRO = "price_pro_x";
  delete process.env.ORION_LANCIO;
  delete process.env.ORION_ADMIN_EMAIL;
});
after(() => {
  for (const id of creati) eliminaUtenteDemo(id);
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PRICE_PRO;
});

test("l'account demo nasce pronto: dominio riservato, email già verificata, sessione valida", () => {
  const { utente, token } = creaAccountDemo();
  creati.push(utente.id);
  assert.ok(utente.email.endsWith(`@${DOMINIO_DEMO}`));
  assert.equal(emailDemo(utente.email), true);
  assert.equal(tenantDemo(utente.tenant_id), true);
  // Sessione: si entra con UN clic, senza codici da confermare.
  const daSessione = utenteDaSessione(token);
  assert.equal(daSessione?.id, utente.id);
  const riga = db().prepare("SELECT email_verificata FROM utenti WHERE id = ?").get(utente.id) as {
    email_verificata: number;
  };
  assert.equal(riga.email_verificata, 1);
  // La Chiamata 0 deve partire: onboarding ancora da fare.
  assert.equal(utente.onboarding_completo, 0);
});

test("niente paywall per la demo: accesso pieno anche a lancio chiuso e Stripe attivo", () => {
  const { utente } = creaAccountDemo();
  creati.push(utente.id);
  runWithTenant(utente.tenant_id, () => {
    const s = statoAbbonamento(utente.email);
    assert.equal(s.accessoConsentito, true);
  });
  // Un estraneo qualsiasi resta fuori (lancio chiuso + nessun abbonamento).
  runWithTenant(utente.tenant_id, () => {
    assert.equal(statoAbbonamento("estraneo@x.it").accessoConsentito, false);
  });
});

test("il tetto di spesa scatta: sotto si lavora, sopra la demo è esaurita", () => {
  const { utente } = creaAccountDemo();
  creati.push(utente.id);
  assert.equal(demoEsaurita(utente.tenant_id), false);
  // Un tutorial normale (pochi centesimi) NON esaurisce nulla.
  registraConsumo(utente.tenant_id, "claude-haiku-4-5", { input: 50_000, output: 10_000, cacheScrittura: 0, cacheLettura: 0, chiamate: 5 });
  assert.equal(demoEsaurita(utente.tenant_id), false);
  // Oltre il tetto → esaurita (input in token: qui si supera d'un balzo).
  registraConsumo(utente.tenant_id, "claude-opus-4-8", { input: TETTO_DEMO_MICRO, output: 0, cacheScrittura: 0, cacheLettura: 0, chiamate: 1 });
  assert.equal(demoEsaurita(utente.tenant_id), true);
});

test("la pulizia smonta le demo scadute (dati e account) ma conserva la contabilità", () => {
  const { utente, token } = creaAccountDemo();
  // Dati del finto studio + consumi registrati.
  runWithTenant(utente.tenant_id, () => {
    db()
      .prepare("INSERT INTO clienti (tenant_id, nome, telefono, created_at) VALUES (?, 'Cliente Demo', '+390000000000', ?)")
      .run(utente.tenant_id, new Date().toISOString());
  });
  registraConsumo(utente.tenant_id, "claude-haiku-4-5", { input: 1000, output: 100, cacheScrittura: 0, cacheLettura: 0, chiamate: 1 });

  // Ancora giovane → la pulizia non la tocca.
  pulisciDemoScadute();
  assert.ok(db().prepare("SELECT id FROM utenti WHERE id = ?").get(utente.id));

  // La si invecchia oltre la vita massima → smontata per intero.
  const vecchia = new Date(Date.now() - (GIORNI_VITA_DEMO + 1) * 86_400_000).toISOString();
  db().prepare("UPDATE utenti SET created_at = ? WHERE id = ?").run(vecchia, utente.id);
  const smontate = pulisciDemoScadute();
  assert.ok(smontate >= 1);
  assert.equal(db().prepare("SELECT id FROM utenti WHERE id = ?").get(utente.id), undefined);
  assert.equal(db().prepare("SELECT id FROM clienti WHERE tenant_id = ?").get(utente.tenant_id), undefined);
  assert.equal(db().prepare("SELECT token FROM sessioni WHERE utente_id = ?").get(utente.id), undefined);
  assert.equal(utenteDaSessione(token), null);
  // La contabilità resta: quanto è costata ogni demo si deve poter sapere.
  assert.ok(db().prepare("SELECT tenant_id FROM consumo_ai WHERE tenant_id = ?").get(utente.tenant_id));
  db().prepare("DELETE FROM consumo_ai WHERE tenant_id = ?").run(utente.tenant_id);
});

test("un'email normale NON è demo; il dominio demo lo è in ogni forma", () => {
  assert.equal(emailDemo("mario.rossi@gmail.com"), false);
  assert.equal(emailDemo(`qualcuno@${DOMINIO_DEMO}`), true);
  assert.equal(emailDemo(`  DEMO-ABC@${DOMINIO_DEMO.toUpperCase()}  `), true);
  assert.equal(emailDemo(null), false);
  assert.equal(emailDemo(undefined), false);
});
