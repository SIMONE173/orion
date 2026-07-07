import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cifra, decifra, cifraturaAttiva } from "../crypto";

// La cifratura a riposo protegge password email e token WhatsApp nel DB.
// Qui si verifica il giro completo e i comportamenti di degrado documentati.

beforeEach(() => {
  process.env.ORION_ENC_KEY = "chiave-di-test-robusta-1234567890";
});

test("giro completo: cifra → prefisso enc:1: → decifra restituisce l'originale", () => {
  const segreto = "password-super-segreta-àèì";
  const c = cifra(segreto)!;
  assert.ok(c.startsWith("enc:1:"), "il valore cifrato ha il prefisso");
  assert.notEqual(c, segreto);
  assert.equal(decifra(c), segreto);
});

test("idempotente: cifrare un valore già cifrato non lo doppia", () => {
  const c1 = cifra("abc")!;
  const c2 = cifra(c1)!;
  assert.equal(c1, c2);
});

test("ogni cifratura usa un IV nuovo (stesso testo → output diverso)", () => {
  assert.notEqual(cifra("stesso testo"), cifra("stesso testo"));
});

test("valori legacy in chiaro passano invariati (retrocompatibilità)", () => {
  assert.equal(decifra("password-in-chiaro"), "password-in-chiaro");
});

test("valore cifrato MANOMESSO: non restituisce mai il segreto in chiaro", () => {
  const c = cifra("segreto")!;
  // Corrompe un byte del payload base64.
  const rotto = c.slice(0, -4) + (c.endsWith("AAAA") ? "BBBB" : "AAAA");
  const out = decifra(rotto);
  assert.notEqual(out, "segreto");
});

test("senza chiave: degrado dichiarato (scrive/legge in chiaro)", () => {
  delete process.env.ORION_ENC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  assert.equal(cifraturaAttiva(), false);
  assert.equal(cifra("x"), "x");
});

test("null e stringa vuota non esplodono", () => {
  assert.equal(cifra(null), null);
  assert.equal(cifra(""), "");
  assert.equal(decifra(null), null);
});
