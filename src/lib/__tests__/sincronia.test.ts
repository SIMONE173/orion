import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { runWithTenant } from "../tenant";
import { registraConnessione, attivaPonteManuale, attivaCanaleUscita } from "../data";
import { pianoSincronia, spuntaRighe, obiettivoPerLaMano, daQuanto } from "../sincronia";

// LA SINCRONIA AL RISVEGLIO: il piano dev'essere ARITMETICA, non fantasia.
// Il caso che vale tutto: una cosa nata e morta mentre il PC era spento non
// deve produrre NIENTE nel gestionale — là dentro non è mai esistita.

const TEN = 990073;
let connManuale = 0;

function coda(connId: number, evento: string, payload: Record<string, unknown>) {
  const ora = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO eventi_uscita (tenant_id, connessione_id, evento, payload, prossimo_tentativo, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(TEN, connId, evento, JSON.stringify(payload), ora, ora);
}

function pulisci() {
  for (const t of ["eventi_uscita", "connessioni"]) {
    try {
      db().prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(TEN);
    } catch {
      /* tabella assente */
    }
  }
}

before(() => {
  pulisci();
  runWithTenant(TEN, async () => {
    const c = registraConnessione({ nome: "Studio Pro", tipo: "app", apertura: "Studio Pro" });
    attivaPonteManuale(c.id);
    connManuale = c.id;

    // Nato e morto: preso alle 2 di notte, disdetto alle 3.
    coda(c.id, "appuntamento_creato", { orion_id: 101, cliente_nome: "Luca Bianchi", inizio: "2026-07-29T09:00" });
    coda(c.id, "appuntamento_cancellato", { orion_id: 101, cliente_nome: "Luca Bianchi", inizio: "2026-07-29T09:00", stato: "cancellato" });
    // Creato e poi spostato due volte: una riga sola, con l'ora finale.
    coda(c.id, "appuntamento_creato", { orion_id: 102, cliente_nome: "Anna Verdi", inizio: "2026-07-29T10:00" });
    coda(c.id, "appuntamento_spostato", { orion_id: 102, cliente_nome: "Anna Verdi", inizio: "2026-07-29T15:00" });
    coda(c.id, "appuntamento_spostato", { orion_id: 102, cliente_nome: "Anna Verdi", inizio: "2026-07-29T17:30" });
    // Una disdetta pura, un incasso e una fattura.
    coda(c.id, "appuntamento_cancellato", { orion_id: 103, cliente_nome: "Paolo Neri", inizio: "2026-07-30T11:00", stato: "cancellato" });
    coda(c.id, "pagamento_registrato", { orion_id: 55, cliente_nome: "Anna Verdi", importo: 180, metodo: "bonifico", data: "2026-07-28" });
    coda(c.id, "fattura_emessa", { orion_id: 9, numero: "41/2026", cliente_id: 2, importo: 300, data: "2026-07-28" });
  });
});
after(pulisci);

test("sette eventi grezzi diventano cinque righe pulite", async () => {
  await runWithTenant(TEN, async () => {
    const p = pianoSincronia();
    assert.equal(p.voci.length, 5);
    assert.equal(p.daFare, 4, "le cose nate e morte non sono cose da fare");
  });
});

test("nato e morto mentre eri via → non si tocca il computer", async () => {
  await runWithTenant(TEN, async () => {
    const p = pianoSincronia();
    const nulla = p.voci.find((v) => v.azione === "niente");
    assert.ok(nulla, "dev'esserci la voce «niente»");
    assert.match(nulla.riga, /Luca Bianchi/);
    assert.equal(p.daSpuntareSubito.length, 2, "le sue righe si spengono senza aprire nulla");
  });
});

test("creato e spostato due volte → UNA riga, con l'orario finale", async () => {
  await runWithTenant(TEN, async () => {
    const p = pianoSincronia();
    const anna = p.voci.find((v) => /Anna Verdi/.test(v.riga) && v.azione === "crea");
    assert.ok(anna);
    assert.match(String(anna.dettagli.inizio), /17:30/, "si scrive una volta sola, quella giusta");
    assert.match(anna.riga, /sono quelli buoni/);
  });
});

test("incassi e fatture entrano nel piano (i due buchi chiusi)", async () => {
  await runWithTenant(TEN, async () => {
    const p = pianoSincronia();
    assert.ok(p.voci.some((v) => v.categoria === "pagamento"));
    assert.ok(p.voci.some((v) => v.categoria === "fattura"));
    const ordine = p.voci.map((v) => v.azione);
    assert.ok(ordine.indexOf("crea") < ordine.indexOf("disdici"), "prima si crea, poi si disdice");
  });
});

test("l'obiettivo per la Mano è chiuso e non contiene ciò che non va fatto", async () => {
  await runWithTenant(TEN, async () => {
    const ob = obiettivoPerLaMano(pianoSincronia(), "Studio Pro");
    assert.match(ob, /Studio Pro/);
    assert.equal((ob.match(/\n\d+\. /g) ?? []).length, 4, "una riga per cosa da fare");
    assert.match(ob, /Non inventare nulla/);
    assert.ok(!/Luca Bianchi/.test(ob), "le cose nate e morte non arrivano alla Mano");
  });
});

test("i gestionali con canale automatico NON entrano nel piano a mano", async () => {
  await runWithTenant(TEN, async () => {
    // Si consegnano da soli (uscita.ts): farli riscrivere anche alla Mano
    // vorrebbe dire inserire tutto DUE VOLTE nel gestionale.
    const auto = registraConnessione({ nome: "Gestionale Cloud", tipo: "sito", apertura: "https://cloud.example" });
    attivaCanaleUscita(auto.id, "https://cloud.example/webhook");
    coda(auto.id, "appuntamento_creato", { orion_id: 900, cliente_nome: "Chi Va Da Solo", inizio: "2026-07-31T09:00" });

    const p = pianoSincronia();
    assert.ok(!p.voci.some((v) => /Chi Va Da Solo/.test(v.riga)));
    assert.equal(spuntaRighe([999999]), 0, "la spunta non tocca righe che non le appartengono");
  });
});

test("dopo la spunta, le nate-e-morte spariscono e le altre restano", async () => {
  await runWithTenant(TEN, async () => {
    const p = pianoSincronia();
    spuntaRighe(p.daSpuntareSubito);
    const dopo = pianoSincronia();
    assert.ok(!dopo.voci.some((v) => v.azione === "niente"));
    assert.equal(dopo.daFare, 4);
    assert.equal(connManuale > 0, true);
  });
});

test("«da quanto sei stato via» parla italiano", () => {
  assert.match(daQuanto(new Date(Date.now() - 3 * 3600e3).toISOString()), /minut|or[ae]|giorni/);
});
