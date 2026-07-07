import { test } from "node:test";
import assert from "node:assert/strict";
import { estraiSuggerimenti, suggerimentiPerViste } from "../orion/suggerimenti";
import type { Vista } from "../orion/views";

test("estrae le pillole dalla riga e pulisce il testo parlato", () => {
  const testo = "Ecco la tua agenda di oggi.\n[suggerimenti: Sposta un appuntamento | Trova un buco domani]";
  const { testoPulito, suggerimenti } = estraiSuggerimenti(testo);
  assert.equal(testoPulito, "Ecco la tua agenda di oggi.");
  assert.ok(!testoPulito.includes("suggerimenti"));
  assert.deepEqual(suggerimenti, ["Sposta un appuntamento", "Trova un buco domani"]);
});

test("nessuna riga → testo invariato e nessuna pillola", () => {
  const { testoPulito, suggerimenti } = estraiSuggerimenti("Fatto, ho segnato Rossi alle 15.");
  assert.equal(testoPulito, "Fatto, ho segnato Rossi alle 15.");
  assert.deepEqual(suggerimenti, []);
});

test("scarta le voci vuote e limita a 3", () => {
  const { suggerimenti } = estraiSuggerimenti("Ok. [suggerimenti: Uno | | Due | Tre | Quattro]");
  assert.deepEqual(suggerimenti, ["Uno", "Due", "Tre"]);
});

test("è tollerante su spazi e maiuscole nel marcatore", () => {
  const { testoPulito, suggerimenti } = estraiSuggerimenti("Testo.\n[ Suggerimenti :  A |  B ]");
  assert.equal(testoPulito, "Testo.");
  assert.deepEqual(suggerimenti, ["A", "B"]);
});

test("fallback: default per l'ultima vista aperta (agenda)", () => {
  const viste: Vista[] = [{ tipo: "agenda", dati: { data: "2026-07-06", appuntamenti: [] } } as unknown as Vista];
  const s = suggerimentiPerViste(viste);
  assert.ok(s.length > 0 && s.length <= 3);
  assert.ok(s.includes("Sposta un appuntamento"));
});

test("fallback: whatsapp con bozza → Invia/Modifica/Annulla", () => {
  const viste: Vista[] = [
    { tipo: "whatsapp", dati: { cliente: "Rossi", messaggi: [], bozza: { contenuto: "ciao", cliente: "Rossi" } } } as Vista,
  ];
  assert.deepEqual(suggerimentiPerViste(viste), ["Invia", "Modifica il messaggio", "Annulla"]);
});

test("fallback: fattura non emessa → Emettila/Modifica/Annulla", () => {
  const viste: Vista[] = [
    {
      tipo: "fattura",
      dati: {
        numero: "1",
        emessa: false,
        cliente: { nome: "Rossi", piva: null, codice_fiscale: null, indirizzo: null },
        emittente: { nome: null, piva: null, indirizzo: null, regime_fiscale: null },
      },
    } as unknown as Vista,
  ];
  assert.deepEqual(suggerimentiPerViste(viste), ["Emettila", "Modifica l'importo", "Annulla"]);
});

test("fallback: nessuna vista → nessuna pillola", () => {
  assert.deepEqual(suggerimentiPerViste([]), []);
});

test("fallback: tipo di vista senza default → nessuna pillola", () => {
  const viste: Vista[] = [{ tipo: "riposo" } as unknown as Vista];
  assert.deepEqual(suggerimentiPerViste(viste), []);
});
