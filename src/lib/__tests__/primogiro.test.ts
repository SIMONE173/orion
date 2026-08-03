import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { runWithTenant } from "../tenant";
import { registraConnessione, creaCliente } from "../data";
import {
  statoPrimoGiro,
  tappaCorrente,
  avanza,
  segnaProvata,
  esciDalGiro,
  riepilogoPrimoGiro,
  promemoriaPrimoGiro,
  tappeValide,
  VUOLE_AVANTI,
  VUOLE_SALTARE,
  VUOLE_USCIRE,
} from "../orion/primogiro";

// IL PRIMO GIRO — il tutorial della versione COMPLETA.
// La regola che il vecchio motore della demo non aveva: una tappa è «fatta»
// solo quando il RISULTATO VERO esiste nel database, non quando il modello
// dice di averla fatta. La barra non può mentire.
//
// (profili.tenant_id è INTEGER PRIMARY KEY: il tenant di prova è un numero.)
const TEN = 990071;

function pulisci() {
  for (const t of ["connessioni", "clienti", "profili"]) {
    try {
      db().prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(TEN);
    } catch {
      /* tabella assente in questo ambiente */
    }
  }
}

before(pulisci);
after(pulisci);

test("il giro parte dalla scrivania, e sul web perde le tappe che vogliono il computer", async () => {
  await runWithTenant(TEN, async () => {
    assert.equal(tappaCorrente(true)?.id, "scrivania");
    assert.equal(tappeValide(true).length, 6);
    assert.equal(tappeValide(false).length, 4);
    assert.ok(!tappeValide(false).some((t) => t.id === "scrivania" || t.id === "mano"));
  });
});

test("una tappa non può mentire: avanza solo col risultato vero nel database", async () => {
  await runWithTenant(TEN, async () => {
    const prima = promemoriaPrimoGiro(true);
    assert.match(prima, /NON c'è ancora/);
    assert.match(prima, /non dire di averla fatta/i);
    assert.match(prima, /non c'è niente di finto/i);

    registraConnessione({ nome: "Studio Pro", tipo: "app", apertura: "Studio Pro" });
    assert.match(promemoriaPrimoGiro(true), /C'È GIÀ/);
  });
});

test("il binario racconta il vero: fatta, corrente, saltata", async () => {
  await runWithTenant(TEN, async () => {
    avanza(true); // scrivania → clienti
    assert.equal(tappaCorrente(true)?.id, "clienti");
    const r = riepilogoPrimoGiro(true);
    assert.equal(r.tappe[0].fatta, true);
    assert.equal(r.tappe[1].corrente, true);

    assert.match(promemoriaPrimoGiro(true), /NON c'è ancora/);
    creaCliente({ nome: "Anna Verdi", telefono: "3331112222" });
    assert.match(promemoriaPrimoGiro(true), /C'È GIÀ/);

    avanza(true); // clienti → referto
    assert.equal(tappaCorrente(true)?.id, "referto");
    avanza(true, { saltando: true }); // il referto si salta
    const r2 = riepilogoPrimoGiro(true);
    assert.equal(r2.tappe[2].saltata, true);
    assert.equal(r2.tappe[2].fatta, false, "una tappa saltata non è una tappa fatta");
    assert.equal(tappaCorrente(true)?.id, "segreteria");
  });
});

test("le tappe senza traccia nel database si spuntano solo dopo l'esito vero", async () => {
  await runWithTenant(TEN, async () => {
    avanza(true); // segreteria → mano
    assert.equal(tappaCorrente(true)?.id, "mano");
    assert.match(promemoriaPrimoGiro(true), /NON c'è ancora/);
    segnaProvata("mano");
    assert.match(promemoriaPrimoGiro(true), /C'È GIÀ/);
  });
});

test("finito il giro, il promemoria smette di arrivare", async () => {
  await runWithTenant(TEN, async () => {
    avanza(true); // mano → domattina
    const fine = avanza(true);
    assert.equal(fine.finito, true);
    assert.equal(fine.tappa, null);
    assert.equal(promemoriaPrimoGiro(true), "");
    assert.equal(riepilogoPrimoGiro(true).attivo, false);
  });
});

test("«basta, lo faccio dopo»: il giro si chiude e non si ripropone", async () => {
  await runWithTenant(TEN, async () => {
    db().prepare("UPDATE profili SET primo_giro = NULL WHERE tenant_id = ?").run(TEN);
    assert.equal(statoPrimoGiro().indice, 0, "azzerato, il giro riparte da capo");
    esciDalGiro();
    assert.equal(promemoriaPrimoGiro(true), "");
    assert.equal(statoPrimoGiro().uscito, true);
  });
});

test("le frasi come le dice una persona vera", () => {
  for (const f of ["avanti", "vai pure", "ok dai", "fatto", "continua", "passiamo alla prossima"])
    assert.ok(VUOLE_AVANTI.test(f), `«${f}» dovrebbe far avanzare`);
  for (const f of ["salta", "questo dopo", "per ora no", "non adesso"])
    assert.ok(VUOLE_SALTARE.test(f), `«${f}» dovrebbe far saltare`);
  for (const f of ["basta", "lo faccio dopo", "voglio lavorare", "lascia stare"])
    assert.ok(VUOLE_USCIRE.test(f), `«${f}» dovrebbe chiudere il giro`);
  // E il caso che romperebbe tutto: una risposta normale scambiata per comando.
  assert.ok(!VUOLE_AVANTI.test("mi chiamo Marco"));
  assert.ok(!VUOLE_USCIRE.test("mi chiamo Marco"));
});
