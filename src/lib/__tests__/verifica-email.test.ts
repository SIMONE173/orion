import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import {
  creaUtente,
  creaCodiceVerifica,
  verificaCodice,
  setEmailVerificata,
  emailVerificata,
  eliminaCodiciScaduti,
  creaDispositivoFidato,
  dispositivoFidato,
} from "../auth";
import { emailValida } from "../validazione";

// SICUREZZA ACCOUNT: verifica email + 2FA a codice. I codici sono usa-e-getta,
// scadono, hanno un tetto di tentativi, e nel DB non c'è mai il codice in chiaro.

const EMAIL = "verifica-test@orionvision.it";

function pulisci() {
  const u = db().prepare("SELECT id FROM utenti WHERE email = ?").get(EMAIL) as { id: number } | undefined;
  if (u) db().prepare("DELETE FROM dispositivi_fidati WHERE utente_id = ?").run(u.id);
  db().prepare("DELETE FROM codici_verifica WHERE email = ?").run(EMAIL);
  db().prepare("DELETE FROM utenti WHERE email = ?").run(EMAIL);
}
after(() => pulisci());

test("validazione email: passano i veri, cadono i finti e gli usa-e-getta", () => {
  assert.equal(emailValida("mario.rossi@studio.it"), true);
  assert.equal(emailValida("a@b.co"), true);
  assert.equal(emailValida("senzachiocciola.it"), false);
  assert.equal(emailValida("doppio..punto@x.it"), false);
  assert.equal(emailValida("nome@dominio"), false); // manca il TLD
  assert.equal(emailValida("tizio@mailinator.com"), false); // usa-e-getta
  assert.equal(emailValida("spazio dentro@x.it"), false);
});

test("il nuovo account nasce NON verificato", () => {
  pulisci();
  const u = creaUtente(EMAIL, "password-forte-8");
  assert.equal(emailVerificata(u.id), false);
});

test("codice giusto verifica; è usa-e-getta e nel DB non è in chiaro", () => {
  const codice = creaCodiceVerifica(EMAIL, "signup");
  assert.match(codice, /^\d{6}$/);
  // Nel DB c'è solo l'impronta, non le 6 cifre.
  const riga = db().prepare("SELECT codice_hash FROM codici_verifica WHERE email = ? AND usato = 0").get(EMAIL) as { codice_hash: string };
  assert.notEqual(riga.codice_hash, codice);
  assert.equal(riga.codice_hash.length, 64);
  // Giusto → ok; e non si può riusare.
  assert.equal(verificaCodice(EMAIL, codice, "signup").ok, true);
  assert.equal(verificaCodice(EMAIL, codice, "signup").ok, false);
});

test("codice sbagliato: 5 tentativi poi si blocca", () => {
  creaCodiceVerifica(EMAIL, "login");
  for (let i = 0; i < 5; i++) assert.equal(verificaCodice(EMAIL, "000000", "login").ok, false);
  // Ora è bloccato anche se indovinassi (il codice vero non serve più: esaurito).
  const sesto = verificaCodice(EMAIL, "000000", "login");
  assert.equal(sesto.ok, false);
  assert.match(sesto.errore ?? "", /nuovo codice|tentativi/i);
});

test("un nuovo codice invalida il precedente", () => {
  const primo = creaCodiceVerifica(EMAIL, "signup");
  const secondo = creaCodiceVerifica(EMAIL, "signup");
  assert.notEqual(primo, secondo);
  assert.equal(verificaCodice(EMAIL, primo, "signup").ok, false); // il vecchio non vale più
  assert.equal(verificaCodice(EMAIL, secondo, "signup").ok, true);
});

test("codice scaduto: rifiutato e la scopa lo elimina", () => {
  creaCodiceVerifica(EMAIL, "login");
  db().prepare("UPDATE codici_verifica SET scadenza = '2020-01-01T00:00:00.000Z' WHERE email = ? AND usato = 0").run(EMAIL);
  const codiceVero = db().prepare("SELECT codice_hash FROM codici_verifica WHERE email = ? AND usato = 0").get(EMAIL);
  assert.ok(codiceVero);
  assert.equal(verificaCodice(EMAIL, "123456", "login").ok, false);
  assert.ok(eliminaCodiciScaduti() >= 1);
});

test("setEmailVerificata abilita l'account", () => {
  const u = db().prepare("SELECT id FROM utenti WHERE email = ?").get(EMAIL) as { id: number };
  assert.equal(emailVerificata(u.id), false);
  setEmailVerificata(EMAIL);
  assert.equal(emailVerificata(u.id), true);
});

test("dispositivo fidato: riconosciuto finché non scade", () => {
  const u = db().prepare("SELECT id FROM utenti WHERE email = ?").get(EMAIL) as { id: number };
  const token = creaDispositivoFidato(u.id);
  assert.equal(dispositivoFidato(u.id, token), true);
  assert.equal(dispositivoFidato(u.id, "token-inventato"), false);
  assert.equal(dispositivoFidato(999999, token), false); // altro utente
  db().prepare("UPDATE dispositivi_fidati SET scadenza = '2020-01-01T00:00:00.000Z' WHERE utente_id = ?").run(u.id);
  assert.equal(dispositivoFidato(u.id, token), false); // scaduto
});
