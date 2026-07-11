import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { cifraBackup, decifraBackup, backupRemotoConfigurato } from "../backup-remoto";

// FORTEZZA SQLITE: il backup off-site è cifrato (AES-256-GCM) e compresso.
// Qui il giro completo: quello che carichi è rumore, quello che ripristini è
// IDENTICO al byte. Nessuna rete: si testa il formato, non R2.

const CHIAVE = crypto.createHash("sha256").update("chiave-di-prova").digest();

test("cifra → decifra restituisce il database identico al byte", () => {
  // Finto DB con la firma SQLite vera (come i backup reali).
  const db = Buffer.concat([
    Buffer.from("SQLite format 3\0", "latin1"),
    crypto.randomBytes(64 * 1024),
  ]);
  const cifrato = cifraBackup(db, CHIAVE);
  assert.equal(cifrato.subarray(0, 8).toString(), "ORIONBK1");
  // Il contenuto non deve trasparire (né firma né byte in chiaro).
  assert.equal(cifrato.includes(Buffer.from("SQLite format 3")), false);
  const ripristinato = decifraBackup(cifrato, CHIAVE);
  assert.ok(ripristinato.equals(db));
});

test("chiave sbagliata o file manomesso: il ripristino RIFIUTA (niente dati corrotti)", () => {
  const db = Buffer.from("SQLite format 3\0dati importantissimi", "latin1");
  const cifrato = cifraBackup(db, CHIAVE);
  const chiaveSbagliata = crypto.createHash("sha256").update("altra-chiave").digest();
  assert.throws(() => decifraBackup(cifrato, chiaveSbagliata));
  // Un byte cambiato nel corpo → l'auth tag GCM smaschera la manomissione.
  const manomesso = Buffer.from(cifrato);
  manomesso[manomesso.length - 1] ^= 0xff;
  assert.throws(() => decifraBackup(manomesso, CHIAVE));
  // E un file qualunque non viene nemmeno tentato.
  assert.throws(() => decifraBackup(Buffer.from("ciao mondo"), CHIAVE), /formato sconosciuto/);
});

test("la compressione lavora: un DB ripetitivo cifrato pesa molto meno dell'originale", () => {
  const db = Buffer.concat([Buffer.from("SQLite format 3\0", "latin1"), Buffer.alloc(512 * 1024, "a")]);
  const cifrato = cifraBackup(db, CHIAVE);
  assert.ok(cifrato.length < db.length / 10);
});

test("senza variabili R2 il backup remoto si dichiara non configurato (degrado pulito)", () => {
  const prima = { ...process.env };
  delete process.env.R2_ENDPOINT;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  assert.equal(backupRemotoConfigurato(), false);
  Object.assign(process.env, prima);
});
