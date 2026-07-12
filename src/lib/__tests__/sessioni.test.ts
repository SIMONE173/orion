import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { creaUtente, creaSessione, utenteDaSessione, eliminaSessione, eliminaSessioniScadute, hashPassword, verifyPassword } from "../auth";

// SESSIONI BLINDATE: nel DB vive solo l'impronta SHA-256 del token — un furto
// del database non regala sessioni valide. Qui il ciclo di vita completo.

function pulisci() {
  const u = db().prepare("SELECT id FROM utenti WHERE email = 'sessioni-test@x.it'").get() as { id: number } | undefined;
  if (u) {
    db().prepare("DELETE FROM sessioni WHERE utente_id = ?").run(u.id);
    db().prepare("DELETE FROM utenti WHERE id = ?").run(u.id);
  }
}

after(() => pulisci());

test("il token vero non tocca mai il database (solo l'impronta)", () => {
  pulisci();
  const u = creaUtente("sessioni-test@x.it", "password-super-8", "Test");
  const token = creaSessione(u.id);

  // Il token in chiaro NON esiste nella tabella…
  const inChiaro = db().prepare("SELECT 1 FROM sessioni WHERE token = ?").get(token);
  assert.equal(inChiaro, undefined);
  // …eppure il login con quel token funziona.
  assert.equal(utenteDaSessione(token)?.email, "sessioni-test@x.it");
  // Un token inventato non entra.
  assert.equal(utenteDaSessione("a".repeat(64)), null);

  // Logout: la sessione muore davvero lato server.
  eliminaSessione(token);
  assert.equal(utenteDaSessione(token), null);
});

test("le sessioni scadute vengono rifiutate e la pulizia le elimina", () => {
  const u = db().prepare("SELECT id FROM utenti WHERE email = 'sessioni-test@x.it'").get() as { id: number };
  const token = creaSessione(u.id);
  // Retrodato la scadenza: la sessione è vecchia.
  db().prepare("UPDATE sessioni SET expires_at = ? WHERE utente_id = ?").run("2020-01-01T00:00:00.000Z", u.id);
  assert.equal(utenteDaSessione(token), null); // rifiutata (e auto-eliminata)
  creaSessione(u.id);
  db().prepare("UPDATE sessioni SET expires_at = ? WHERE utente_id = ?").run("2020-01-01T00:00:00.000Z", u.id);
  assert.ok(eliminaSessioniScadute() >= 1); // la scopa del cron
});

test("password: scrypt con salt casuale, verifica timing-safe", () => {
  const h = hashPassword("la-mia-password");
  assert.notEqual(h, hashPassword("la-mia-password")); // salt diverso ogni volta
  assert.equal(verifyPassword("la-mia-password", h), true);
  assert.equal(verifyPassword("sbagliata", h), false);
});
