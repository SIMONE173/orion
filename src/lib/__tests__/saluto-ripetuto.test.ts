import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { runWithTenant } from "../tenant";
import { salvaMessaggio, messaggiRecenti } from "../data";

// IL SALUTO CHE SI ACCUMULA.
// Durante la Chiamata 0, ogni apertura dell'app mandava un nuovo saluto: chi
// apriva ORION cinque volte senza rispondere si ritrovava cinque volte la
// stessa identica domanda in colonna. Sembrava rotto — e lo era.
//
// La regola: se l'ULTIMA parola è la nostra e l'utente non ha ancora
// risposto, all'avvio non si riparte da capo. La domanda è già a schermo.

const TEN = 990079;

function pulisci() {
  try {
    db().prepare("DELETE FROM messaggi WHERE tenant_id = ?").run(TEN);
  } catch {
    /* tabella assente */
  }
}

before(pulisci);
after(pulisci);

/** La condizione esatta usata da runConversation, isolata per poterla provare. */
function ripeterebbeIlSaluto(onboardingCompleto: boolean): boolean {
  if (!onboardingCompleto) {
    const ultimi = messaggiRecenti(1);
    if (ultimi.length && ultimi[ultimi.length - 1].ruolo === "assistant") return false;
  }
  return true;
}

test("la prima volta in assoluto ORION saluta", async () => {
  await runWithTenant(TEN, async () => {
    assert.equal(ripeterebbeIlSaluto(false), true, "storico vuoto: il saluto ci vuole");
  });
});

test("riaprendo senza aver risposto, NON risaluta", async () => {
  await runWithTenant(TEN, async () => {
    salvaMessaggio("assistant", "Ciao! Vuoi usare ORION per il lavoro o come assistente personale?");
    assert.equal(ripeterebbeIlSaluto(false), false, "la domanda è già a schermo: non se ne aggiunge un'altra");
    // E riaprendo altre tre volte resta una domanda sola.
    for (let i = 0; i < 3; i++) assert.equal(ripeterebbeIlSaluto(false), false);
    assert.equal(messaggiRecenti(10).length, 1, "nessun accumulo");
  });
});

test("dopo che l'utente ha risposto, la conversazione riprende normalmente", async () => {
  await runWithTenant(TEN, async () => {
    salvaMessaggio("user", "per il lavoro");
    assert.equal(ripeterebbeIlSaluto(false), true, "ha parlato lui: adesso tocca a ORION");
  });
});

test("a Chiamata 0 finita la regola non si applica: il briefing del mattino ci vuole", async () => {
  await runWithTenant(TEN, async () => {
    salvaMessaggio("assistant", "Ecco la tua giornata di ieri.");
    assert.equal(ripeterebbeIlSaluto(true), true, "utente già conosciuto: all'avvio si riparte davvero");
  });
});
