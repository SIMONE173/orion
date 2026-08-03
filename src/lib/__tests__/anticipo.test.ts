import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { runWithTenant } from "../tenant";
import { creaCliente, registraConnessione, registraPagamento } from "../data";
import { anticipa, dimenticaVocabolario } from "../orion/anticipo";

// L'ANTICIPAZIONE deve indovinare quando serve e — soprattutto — STARE FERMA
// quando non serve: un assistente invadente è peggio di uno pigro.

const TEN = 990072;

function pulisci() {
  for (const t of ["clienti", "connessioni", "appuntamenti", "pagamenti"]) {
    try {
      db().prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(TEN);
    } catch {
      /* tabella assente */
    }
  }
  dimenticaVocabolario();
}

before(() => {
  pulisci();
  runWithTenant(TEN, async () => {
    creaCliente({ nome: "Mario Rossi", telefono: "3331112222" });
    const giulia = creaCliente({ nome: "Giulia Marchetti", telefono: "3334445555" });
    registraPagamento({ cliente_id: giulia.id, importo: 180, metodo: "bonifico", stato: "da_incassare" });
    registraConnessione({ nome: "Studio Pro", tipo: "app", apertura: "Studio Pro" });
    dimenticaVocabolario();
  });
});
after(pulisci);

test("nome + intento → apre la scheda, coi dati già in mano", async () => {
  await runWithTenant(TEN, async () => {
    const a = await anticipa("senti, per Marchetti devo fare la fattura di ieri", { desktop: true });
    assert.ok(a, "doveva anticipare");
    assert.ok(a.viste.some((v) => v.tipo === "cliente"));
    assert.match(a.nota, /180 . ancora da incassare/i, "i dati arrivano senza un secondo giro di strumenti");
    assert.match(a.nota, /MEZZA FRASE/i, "ORION deve nominarlo e andare avanti, non descrivere il pannello");
  });
});

test("si parla della giornata → apre l'agenda", async () => {
  await runWithTenant(TEN, async () => {
    const a = await anticipa("com'è messa la giornata di domani?", {});
    assert.ok(a?.viste.some((v) => v.tipo === "agenda"));
  });
});

test("un ORDINE esplicito non è un'anticipazione: ci pensa lo strumento", async () => {
  await runWithTenant(TEN, async () => {
    assert.equal(await anticipa("apri il gestionale Studio Pro un attimo", { desktop: true }), null);
  });
});

test("il gestionale nominato si apre, e se ne parla al PRESENTE", async () => {
  await runWithTenant(TEN, async () => {
    const a = await anticipa("devo controllare una cosa sul gestionale Studio Pro", { desktop: true });
    assert.ok(a?.azioni.some((x) => x.tipo === "apri_app"));
    assert.match(a!.nota, /PRESENTE/i, "al presente: è vero nell'istante in cui lo dice");
  });
});

test("i falsi allarmi: la trappola dei cognomi che sono parole comuni", async () => {
  await runWithTenant(TEN, async () => {
    const f = await anticipa("guarda che i conti non tornano per niente", {});
    assert.ok(!f || f.viste.length === 0, "«i conti non tornano» non apre il signor Conti");
    assert.equal(await anticipa("ciao come stai?", {}), null, "la chiacchiera non apre niente");
  });
});

test("sta ferma quando deve: Mano al lavoro, demo, utente sconosciuto, «non aprirmi niente»", async () => {
  await runWithTenant(TEN, async () => {
    const frase = "per Marchetti devo fare la fattura";
    assert.equal(await anticipa(frase, { desktop: true, schermo: { manoInCorso: true } }), null);
    assert.equal(await anticipa(frase, { inDemo: true }), null);
    assert.equal(await anticipa(frase, { onboardingCompleto: false }), null);
    assert.equal(await anticipa("non aprirmi niente da solo per favore", {}), null);
  });
});

test("non riapre ciò che è già a schermo, ma lo dice a ORION", async () => {
  await runWithTenant(TEN, async () => {
    const a = await anticipa("e per Rossi come siamo messi con i pagamenti?", { schermo: { pannelli: ["cliente"] } });
    assert.ok(!a || a.viste.length === 0, "la scheda è già davanti: non si riapre");
    assert.ok(!a || /già davanti|NON riaprirlo/i.test(a.nota));
  });
});

test("due persone con lo stesso cognome: non indovina, fa chiedere", async () => {
  await runWithTenant(TEN, async () => {
    creaCliente({ nome: "Anna Rossi", telefono: "3339998888" });
    dimenticaVocabolario();
    const a = await anticipa("devo fare la fattura per Rossi", {});
    assert.ok(a, "deve rispondere qualcosa");
    assert.equal(a.viste.length, 0, "aprire il Rossi sbagliato è peggio che non aprire niente");
    assert.match(a.nota, /quale/i);
  });
});
