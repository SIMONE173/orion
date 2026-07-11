import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { runWithTenant } from "../tenant";
import { db } from "../db";
import {
  permessoArea,
  permessiAzienda,
  salvaPermessiArea,
  classeRuolo,
  lasciaMessaggioTeam,
  messaggiTeamPerUtente,
  segnaMessaggiTeamConsegnati,
  utenteIdPerNome,
} from "../data";

// AREE RISERVATE + STAFFETTA DEL TEAM: la protezione per ruolo è applicata nei
// dati (non solo nel prompt) e i messaggi fra colleghi trovano il destinatario.
// Tenant di prova isolato, ripulito prima e dopo.
const TN = 990202;
let TITOLARE = 0;
let OPERATORE = 0;

function pulisci() {
  for (const t of ["aziende", "organico", "messaggi_team"]) {
    db().prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(TN);
  }
  db().prepare("DELETE FROM utenti WHERE email LIKE 'permessi-test-%'").run();
}

before(() => {
  pulisci();
  const ora = new Date().toISOString();
  const u = (email: string, nome: string, ruolo: string) =>
    Number(
      db()
        .prepare("INSERT INTO utenti (email, password_hash, nome, created_at, tenant_id, ruolo) VALUES (?, 'x', ?, ?, ?, ?)")
        .run(email, nome, ora, TN, ruolo).lastInsertRowid
    );
  TITOLARE = u("permessi-test-tit@x.it", "Simone", "titolare");
  OPERATORE = u("permessi-test-op@x.it", "Marco Rossi", "tecnico di produzione");
  db()
    .prepare("INSERT INTO aziende (tenant_id, nome, created_at, updated_at) VALUES (?, 'Prova Srl', ?, ?)")
    .run(TN, ora, ora);
  db()
    .prepare("INSERT INTO organico (tenant_id, nome, ruolo, reparto, utente_id, attivo, created_at, updated_at) VALUES (?, 'Marco Rossi', 'tecnico', 'produzione', ?, 1, ?, ?)")
    .run(TN, OPERATORE, ora, ora);
});

after(() => pulisci());

test("classeRuolo: dal ruolo testuale alla lente giusta", () => {
  assert.equal(classeRuolo("titolare"), "titolare");
  assert.equal(classeRuolo("Caporeparto verniciatura"), "responsabile");
  assert.equal(classeRuolo("segretaria di studio"), "amministrativo");
  assert.equal(classeRuolo("tecnico"), "operatore");
  assert.equal(classeRuolo(null), "operatore");
});

test("aree riservate: l'operatore è fuori dalla finanza, il titolare no", () => {
  runWithTenant(TN, () => {
    assert.equal(permessoArea("finanza", TITOLARE).ok, true);
    assert.equal(permessoArea("finanza", OPERATORE).ok, false);
    assert.equal(permessoArea("esporta", OPERATORE).ok, false);
    // Canali di sistema (cron/proattiva, senza utente): liberi.
    assert.equal(permessoArea("finanza", null).ok, true);
  });
});

test("il titolare allarga un'area a voce e non può chiudersi fuori", () => {
  runWithTenant(TN, () => {
    salvaPermessiArea("finanza", ["operatore"]);
    assert.equal(permessoArea("finanza", OPERATORE).ok, true);
    // "solo io": lista vuota → resta comunque il titolare.
    const regole = salvaPermessiArea("finanza", []);
    assert.deepEqual(regole.finanza, ["titolare"]);
    assert.equal(permessoArea("finanza", OPERATORE).ok, false);
    assert.equal(permessoArea("finanza", TITOLARE).ok, true);
    // Le altre aree restano ai default.
    assert.deepEqual(permessiAzienda().fatture, ["titolare", "amministrativo"]);
  });
});

test("senza azienda non esiste alcuna riserva (autonomo/personale)", () => {
  runWithTenant(990203, () => {
    assert.equal(permessoArea("finanza", OPERATORE).ok, true);
  });
});

test("staffetta: 'di' a Marco che…' trova il collega e gli consegna il messaggio", () => {
  runWithTenant(TN, () => {
    // Il nome parlato si risolve sull'organigramma (anche parziale).
    assert.equal(utenteIdPerNome("marco"), OPERATORE);
    const msg = lasciaMessaggioTeam({ daUtenteId: TITOLARE, daNome: "Simone", perNome: "Marco", testo: "Il fornitore ha richiamato", urgente: true });
    assert.equal(msg.per_utente_id, OPERATORE);

    // Marco apre ORION: il messaggio lo aspetta; Simone invece non riceve nulla.
    const perMarco = messaggiTeamPerUtente(OPERATORE);
    assert.equal(perMarco.length, 1);
    assert.equal(perMarco[0].testo, "Il fornitore ha richiamato");
    assert.equal(messaggiTeamPerUtente(TITOLARE).length, 0);

    // Consegnato una volta sola.
    segnaMessaggiTeamConsegnati(perMarco.map((m) => m.id));
    assert.equal(messaggiTeamPerUtente(OPERATORE).length, 0);
  });
});

test("staffetta per reparto e per nome senza account (si risolve alla lettura)", () => {
  runWithTenant(TN, () => {
    lasciaMessaggioTeam({ daUtenteId: TITOLARE, daNome: "Simone", perReparto: "Produzione", testo: "Domani inventario" });
    const perMarco = messaggiTeamPerUtente(OPERATORE);
    assert.equal(perMarco.length, 0); // Marco (utenti.reparto vuoto) non è del reparto…
    db().prepare("UPDATE utenti SET reparto = 'produzione' WHERE id = ?").run(OPERATORE);
    assert.equal(messaggiTeamPerUtente(OPERATORE).length, 1); // …ora sì

    // Messaggio a un nome NON in organico: resta in attesa sul nome…
    const msg = lasciaMessaggioTeam({ daUtenteId: TITOLARE, perNome: "Giulia", testo: "Benvenuta!" });
    assert.equal(msg.per_utente_id, null);
    // …e Giulia lo trova quando entra col suo account.
    const ora = new Date().toISOString();
    const giulia = Number(
      db()
        .prepare("INSERT INTO utenti (email, password_hash, nome, created_at, tenant_id) VALUES ('permessi-test-giulia@x.it', 'x', 'Giulia Verdi', ?, ?)")
        .run(ora, TN).lastInsertRowid
    );
    const perGiulia = messaggiTeamPerUtente(giulia);
    assert.equal(perGiulia.length, 1);
    assert.equal(perGiulia[0].testo, "Benvenuta!");
  });
});
