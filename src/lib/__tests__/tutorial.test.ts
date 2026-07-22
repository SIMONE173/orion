import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { runWithTenant } from "../tenant";
import { creaAccountDemo, pulisciDemoScadute, GIORNI_VITA_DEMO } from "../demo";
import {
  statoTutorial,
  avviaTutorial,
  avanzaTutorial,
  riepilogoTutorial,
  tappaCorrente,
  salvaFeedbackTutorial,
  bloccoTutorialSystem,
  tappeDi,
} from "../orion/tutorial";

// IL TUTORIAL DELLA DEMO: il binario deve partire dal profilo giusto, seminare
// uno studio credibile, avanzare tappa per tappa e sopravvivere al reload.

let tenantId = 0;

before(() => {
  const { utente } = creaAccountDemo();
  tenantId = utente.tenant_id;
});
after(() => {
  // La pulizia vera fa da spazzino anche per il test (e la si ri-collauda qui).
  const vecchia = new Date(Date.now() - (GIORNI_VITA_DEMO + 1) * 86_400_000).toISOString();
  db().prepare("UPDATE utenti SET created_at = ? WHERE id = ?").run(vecchia, tenantId);
  pulisciDemoScadute();
  db().prepare("DELETE FROM consumo_ai WHERE tenant_id = ?").run(tenantId);
  assert.equal(db().prepare("SELECT id FROM clienti WHERE tenant_id = ?").get(tenantId), undefined);
  assert.equal(db().prepare("SELECT id FROM appuntamenti WHERE tenant_id = ?").get(tenantId), undefined);
});

test("prima della Chiamata 0: percorso nullo e blocco demo da colloquio", () => {
  runWithTenant(tenantId, () => {
    const s = statoTutorial();
    assert.equal(s.percorso, null);
    assert.equal(s.finito, false);
    const blocco = bloccoTutorialSystem(false);
    assert.match(blocco, /CHIAMATA 0/);
    assert.match(blocco, /REGOLE DEL TUTOR/);
  });
});

test("avvio: professione salvata → percorso professionista, studio di prova seminato", () => {
  runWithTenant(tenantId, () => {
    db().prepare("UPDATE profili SET professione = 'Dentista', tipo_lavoro = 'autonomo' WHERE tenant_id = ?").run(tenantId);
    const s = avviaTutorial();
    assert.equal(s.percorso, "professionista");
    // Lo studio di prova: clienti, appuntamenti col nome della prestazione,
    // documenti pronti, lista d'attesa carica.
    const clienti = db().prepare("SELECT nome FROM clienti WHERE tenant_id = ?").all(tenantId) as { nome: string }[];
    assert.ok(clienti.some((c) => c.nome === "Giulia Marchetti"));
    assert.ok(clienti.length >= 5);
    const app = db().prepare("SELECT titolo FROM appuntamenti WHERE tenant_id = ?").all(tenantId) as { titolo: string }[];
    assert.ok(app.length >= 5);
    assert.ok(app.some((a) => a.titolo.includes("Visita di controllo"))); // dentista, non "appuntamento"
    assert.ok(db().prepare("SELECT id FROM documenti WHERE tenant_id = ?").get(tenantId));
    assert.ok(db().prepare("SELECT id FROM lista_attesa WHERE tenant_id = ?").get(tenantId));
    // Idempotente: un secondo avvio NON risemina.
    avviaTutorial();
    const dopo = db().prepare("SELECT COUNT(*) AS n FROM clienti WHERE tenant_id = ?").get(tenantId) as { n: number };
    assert.equal(dopo.n, clienti.length);
  });
});

test("il binario avanza tappa per tappa fino al traguardo, e lo stato persiste", () => {
  runWithTenant(tenantId, () => {
    const totale = tappeDi("professionista").length;
    assert.equal(tappaCorrente(statoTutorial())?.id, "benvenuto");
    const s2 = avanzaTutorial();
    assert.equal(tappaCorrente(s2)?.id, "whatsapp");
    // Il system prompt porta la guida della SOLA tappa corrente.
    const blocco = bloccoTutorialSystem(true);
    assert.match(blocco, /Il cliente ti scrive/);
    assert.doesNotMatch(blocco, /SCOPO: il pezzo da fantascienza/);
    // Il riepilogo per il binario: fatte/corrente coerenti.
    const r = riepilogoTutorial();
    assert.equal(r.totale, totale);
    assert.equal(r.tappe.filter((t) => t.fatta).length, 1);
    assert.equal(r.tappe.find((t) => t.corrente)?.id, "whatsapp");
    // Avanti fino in fondo: finito, e il blocco diventa quello post-giro.
    for (let i = 0; i < totale; i++) avanzaTutorial();
    const fine = statoTutorial();
    assert.equal(fine.finito, true);
    assert.match(bloccoTutorialSystem(true), /GIRO COMPLETATO/);
    // Il feedback si registra.
    const conVoto = salvaFeedbackTutorial({ piaciuto: true, utile: true });
    assert.deepEqual(conVoto.feedback, { piaciuto: true, utile: true });
  });
});

test("tenant azienda → percorso azienda con le tappe di squadra", () => {
  const { utente } = creaAccountDemo();
  runWithTenant(utente.tenant_id, () => {
    const ora = new Date().toISOString();
    db()
      .prepare("INSERT INTO aziende (tenant_id, nome, created_at, updated_at) VALUES (?, 'Officina Demo', ?, ?)")
      .run(utente.tenant_id, ora, ora);
    const s = avviaTutorial();
    assert.equal(s.percorso, "azienda");
    const ids = riepilogoTutorial(s).tappe.map((t) => t.id);
    for (const attesa of ["codice", "squadra", "approvazioni", "giornale"]) assert.ok(ids.includes(attesa));
    // La squadra di prova è nata (Marco è il co-protagonista).
    const organico = db().prepare("SELECT nome FROM organico WHERE tenant_id = ?").all(utente.tenant_id) as { nome: string }[];
    assert.ok(organico.some((m) => m.nome.includes("Marco")));
  });
  const vecchia = new Date(Date.now() - (GIORNI_VITA_DEMO + 1) * 86_400_000).toISOString();
  db().prepare("UPDATE utenti SET created_at = ? WHERE id = ?").run(vecchia, utente.id);
  pulisciDemoScadute();
  db().prepare("DELETE FROM consumo_ai WHERE tenant_id = ?").run(utente.tenant_id);
});
