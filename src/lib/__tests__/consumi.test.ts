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

// ── SEGRETERIA CLIENTI: la configurazione del risponditore ──────────────────
import { runWithTenant } from "../tenant";
import { getRisponditore, setRisponditore, appuntamentiFuturiDiCliente } from "../data";

test("risponditore: nasce spento, si imposta e si rilegge", () => {
  runWithTenant(TN, () => {
    db().prepare("DELETE FROM profili WHERE tenant_id = ?").run(TN);
    assert.equal(getRisponditore(), "spenta");
    setRisponditore("assistita");
    assert.equal(getRisponditore(), "assistita");
    setRisponditore("autopilota");
    assert.equal(getRisponditore(), "autopilota");
    setRisponditore("spenta");
    assert.equal(getRisponditore(), "spenta");
    db().prepare("DELETE FROM profili WHERE tenant_id = ?").run(TN);
  });
});

test("appuntamentiFuturiDiCliente: solo futuri e non disdetti", () => {
  runWithTenant(TN, () => {
    const ora = new Date().toISOString();
    const r = db().prepare("INSERT INTO clienti (tenant_id, nome, created_at) VALUES (?, 'Cliente Futuro', ?)").run(TN, ora);
    const cid = Number(r.lastInsertRowid);
    const fra1h = new Date(Date.now() + 3600_000).toISOString();
    const fra2h = new Date(Date.now() + 7200_000).toISOString();
    const ieri = new Date(Date.now() - 86400_000).toISOString();
    db().prepare("INSERT INTO appuntamenti (tenant_id, cliente_id, titolo, inizio, fine, stato, created_at) VALUES (?, ?, 'ok', ?, ?, 'confermato', ?)").run(TN, cid, fra1h, fra2h, ora);
    db().prepare("INSERT INTO appuntamenti (tenant_id, cliente_id, titolo, inizio, fine, stato, created_at) VALUES (?, ?, 'disdetto', ?, ?, 'disdetto', ?)").run(TN, cid, fra1h, fra2h, ora);
    db().prepare("INSERT INTO appuntamenti (tenant_id, cliente_id, titolo, inizio, fine, stato, created_at) VALUES (?, ?, 'passato', ?, ?, 'confermato', ?)").run(TN, cid, ieri, ieri, ora);
    const futuri = appuntamentiFuturiDiCliente(cid);
    assert.equal(futuri.length, 1);
    assert.equal(futuri[0].titolo, "ok");
    db().prepare("DELETE FROM appuntamenti WHERE cliente_id = ?").run(cid);
    db().prepare("DELETE FROM clienti WHERE id = ?").run(cid);
  });
});

test("disdetta: lapide per Google Calendar (evento remoto da cancellare, record conservato)", () => {
  runWithTenant(TN, () => {
    const ora = new Date().toISOString();
    const fra1h = new Date(Date.now() + 3600_000).toISOString();
    const fra2h = new Date(Date.now() + 7200_000).toISOString();
    const r = db()
      .prepare("INSERT INTO appuntamenti (tenant_id, titolo, inizio, fine, stato, gcal_id, created_at) VALUES (?, 'con gcal', ?, ?, 'confermato', 'evento-google-123', ?)")
      .run(TN, fra1h, fra2h, ora);
    const id = Number(r.lastInsertRowid);

    const { aggiornaStatoAppuntamento } = require("../data");
    const dopo = aggiornaStatoAppuntamento(id, "disdetto");

    assert.equal(dopo?.stato, "disdetto"); // il record resta, in archivio
    assert.equal(dopo?.gcal_id, null); // sganciato dall'evento remoto
    const lapide = db().prepare("SELECT gcal_id FROM gcal_tombstones WHERE tenant_id = ? AND gcal_id = 'evento-google-123'").get(TN);
    assert.ok(lapide, "la lapide deve esserci: al prossimo giro la sync cancella l'evento su Google");

    db().prepare("DELETE FROM appuntamenti WHERE id = ?").run(id);
    db().prepare("DELETE FROM gcal_tombstones WHERE tenant_id = ?").run(TN);
  });
});
