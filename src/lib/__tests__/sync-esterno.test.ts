import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { runWithTenant } from "../tenant";
import { db } from "../db";
import {
  upsertClienteEsterno,
  upsertAppuntamentoEsterno,
  ultimaSincronizzazione,
  statoFonte,
  listClienti,
  listAppuntamenti,
  creaCliente,
} from "../data";

// Specchio vivo del gestionale: sync dei dati core. Tenant di prova isolato,
// ripulito prima e dopo. connessione_id fittizio (le colonne origine_* non hanno
// vincolo FK): serve solo come chiave di provenienza.
const TN = 990101;
const CONN = 777;

function pulisci() {
  for (const t of ["clienti", "appuntamenti", "profili"]) {
    db().prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(TN);
  }
}
before(pulisci);
after(pulisci);

test("cliente: crea, ripush idempotente, provenienza timbrata", () => {
  runWithTenant(TN, () => {
    const a = upsertClienteEsterno({ connessione_id: CONN, chiave: "C1", nome: "Mario Rossi", telefono: "3331112223" });
    assert.equal(a.azione, "creato");
    assert.equal(a.cliente?.origine_connessione_id, CONN);
    assert.ok(a.cliente?.sincronizzato_at);

    // Ripush stessa chiave con nome aggiornato → aggiorna, NON duplica.
    const b = upsertClienteEsterno({ connessione_id: CONN, chiave: "C1", nome: "Mario Rossi Jr", telefono: "3331112223" });
    assert.equal(b.azione, "aggiornato");
    assert.equal(b.cliente?.id, a.cliente?.id);
    assert.equal(b.cliente?.nome, "Mario Rossi Jr");
    assert.equal(listClienti().length, 1);
  });
});

test("cliente: ADOZIONE di un record locale per telefono (niente doppioni)", () => {
  runWithTenant(TN, () => {
    pulisci();
    const locale = creaCliente({ nome: "Lucia Verdi", telefono: "3399998888" });
    assert.equal(locale.origine_connessione_id ?? null, null); // nato in ORION

    const r = upsertClienteEsterno({ connessione_id: CONN, chiave: "C9", nome: "Lucia Verdi", telefono: "3399998888", email: "lucia@x.it" });
    assert.equal(r.azione, "aggiornato"); // adottato, non creato
    assert.equal(r.cliente?.id, locale.id);
    assert.equal(r.cliente?.origine_chiave, "C9"); // ora è specchio del gestionale
    assert.equal(r.cliente?.email, "lucia@x.it");
    assert.equal(listClienti().length, 1);
  });
});

test("appuntamento: crea agganciando il cliente per telefono, poi aggiorna", () => {
  runWithTenant(TN, () => {
    pulisci();
    upsertClienteEsterno({ connessione_id: CONN, chiave: "C1", nome: "Mario Rossi", telefono: "3331112223" });

    const a = upsertAppuntamentoEsterno({
      connessione_id: CONN, chiave: "A1", cliente_telefono: "3331112223",
      titolo: "Seduta", inizio: "2026-07-10T09:00", durata_min: 45, stato: "confermato",
    });
    assert.equal(a.azione, "creato");
    assert.ok(a.appuntamento?.cliente_id);
    assert.equal(a.appuntamento?.fine, "2026-07-10T09:45"); // inizio + durata
    assert.equal(listAppuntamenti("2026-07-10", "2026-07-10").length, 1);

    // Ripush stessa chiave, nuovo orario → sposta, non duplica.
    const b = upsertAppuntamentoEsterno({ connessione_id: CONN, chiave: "A1", inizio: "2026-07-10T11:00" });
    assert.equal(b.azione, "aggiornato");
    assert.equal(b.appuntamento?.id, a.appuntamento?.id);
    assert.equal(b.appuntamento?.inizio, "2026-07-10T11:00");
    assert.equal(listAppuntamenti("2026-07-10", "2026-07-10").length, 1);
  });
});

test("cancellazione sicura: rimuove solo i record della stessa connessione", () => {
  runWithTenant(TN, () => {
    pulisci();
    upsertAppuntamentoEsterno({ connessione_id: CONN, chiave: "A1", inizio: "2026-07-10T09:00", titolo: "X" });
    const del = upsertAppuntamentoEsterno({ connessione_id: CONN, chiave: "A1", cancellato: true });
    assert.equal(del.azione, "cancellato");
    assert.equal(listAppuntamenti("2026-07-10", "2026-07-10").length, 0);

    // Cancellazione da un'ALTRA connessione non tocca nulla.
    upsertClienteEsterno({ connessione_id: CONN, chiave: "C1", nome: "Mario", telefono: "333" });
    const ko = upsertClienteEsterno({ connessione_id: 888, chiave: "C1", cancellato: true, telefono: "333" });
    assert.equal(ko.azione, "ignorato");
    assert.equal(listClienti().length, 1);
  });
});

test("freschezza e stato fonte", () => {
  runWithTenant(TN, () => {
    pulisci();
    assert.equal(ultimaSincronizzazione(CONN), null);
    upsertClienteEsterno({ connessione_id: CONN, chiave: "C1", nome: "Mario", telefono: "333" });
    assert.ok(ultimaSincronizzazione(CONN)); // timestamp presente dopo il sync

    // Default: ORION è la fonte (nessun profilo o fonte_dati diverso).
    assert.equal(statoFonte().modo, "orion");
    // Impostata a gestionale → specchio vivo.
    db()
      .prepare("INSERT INTO profili (tenant_id, onboarding_completo, updated_at, fonte_dati, fonte_connessione_id) VALUES (?, 1, ?, 'gestionale', ?)")
      .run(TN, new Date().toISOString(), CONN);
    assert.equal(statoFonte().modo, "gestionale");
  });
});
