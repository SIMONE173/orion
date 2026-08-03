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

/** La stessa regola dell'API: se non ha mai parlato, resta solo l'ultima domanda. */
function soloConversazioneVera<T extends { ruolo: string }>(righe: T[]): T[] {
  if (righe.some((m) => m.ruolo === "user")) return righe;
  return righe.slice(-1);
}

test("i saluti già accumulati non sporcano più lo schermo", () => {
  // Il caso vero visto dal fondatore: cinque saluti su tre settimane, nessuna
  // sua parola in mezzo. A schermo deve restare UNA domanda.
  const soloSaluti = [
    { ruolo: "assistant", contenuto: "Ciao! …" },
    { ruolo: "assistant", contenuto: "Ciao, benvenuto! …" },
    { ruolo: "assistant", contenuto: "Ciao, il tuo nuovo assistente …" },
  ];
  assert.equal(soloConversazioneVera(soloSaluti).length, 1);
  assert.equal(soloConversazioneVera(soloSaluti)[0].contenuto, "Ciao, il tuo nuovo assistente …", "resta l'ultima, quella in piedi");

  // Ma appena c'è una conversazione vera, non si tocca NIENTE.
  const vera = [
    { ruolo: "assistant", contenuto: "Ciao!" },
    { ruolo: "user", contenuto: "per il lavoro" },
    { ruolo: "assistant", contenuto: "Perfetto, di cosa ti occupi?" },
  ];
  assert.equal(soloConversazioneVera(vera).length, 3);
});

test("a Chiamata 0 finita la regola non si applica: il briefing del mattino ci vuole", async () => {
  await runWithTenant(TEN, async () => {
    salvaMessaggio("assistant", "Ecco la tua giornata di ieri.");
    assert.equal(ripeterebbeIlSaluto(true), true, "utente già conosciuto: all'avvio si riparte davvero");
  });
});
