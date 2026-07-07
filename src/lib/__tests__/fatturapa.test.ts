import { test } from "node:test";
import assert from "node:assert/strict";
import { generaFatturaPA, destinoFattura, spezzaIndirizzo, type DatiFattura, type ParteFattura } from "../fatturapa";

// ──────────────────────────────────────────────────────────────────────────
// Test del modulo FatturaPA: è il codice che tocca SOLDI e ADEMPIMENTI, quindi
// ogni regola fiscale qui dentro ha il suo test. `npm test` deve passare prima
// di ogni deploy (vedi anche .github/workflows/ci.yml).
// ──────────────────────────────────────────────────────────────────────────

const emittenteForfettario: ParteFattura = {
  denominazione: "Giulia Neri",
  piva: "01234567890",
  codice_fiscale: "NREGLI80A41F205X",
  indirizzo: "Via Roma 1",
  cap: "20100",
  comune: "Milano",
  provincia: "MI",
  regime_fiscale: "forfettario",
};

const clienteCompleto: ParteFattura = {
  denominazione: "Marco Rossi",
  piva: null,
  codice_fiscale: "RSSMRC80A01H501U",
  indirizzo: "Via Verdi 2",
  cap: "00100",
  comune: "Roma",
  provincia: "RM",
};

function dati(extra: Partial<DatiFattura> = {}): DatiFattura {
  return {
    numero: "12/2026",
    data: "2026-07-05",
    importo: 100,
    descrizione: "Prestazione professionale",
    emittente: emittenteForfettario,
    cliente: clienteCompleto,
    ...extra,
  };
}

test("forfettario sopra 77,47€: bollo 2€, RF19, Natura N2.2, niente IVA", () => {
  const r = generaFatturaPA(dati());
  assert.equal(r.ok, true);
  assert.equal(r.bollo, 2);
  assert.equal(r.iva, 0);
  assert.equal(r.totale, 100);
  assert.ok(r.xml!.includes("<RegimeFiscale>RF19</RegimeFiscale>"));
  assert.ok(r.xml!.includes("<Natura>N2.2</Natura>"));
  assert.ok(r.xml!.includes("<BolloVirtuale>SI</BolloVirtuale>"));
  assert.ok(r.xml!.includes("<ImportoBollo>2.00</ImportoBollo>"));
  assert.ok(r.xml!.includes("L. 190/2014"), "riferimento normativo del forfettario");
});

test("forfettario sotto 77,47€: NIENTE bollo", () => {
  const r = generaFatturaPA(dati({ importo: 70 }));
  assert.equal(r.ok, true);
  assert.equal(r.bollo, null);
  assert.ok(!r.xml!.includes("DatiBollo"));
});

test("ordinario: IVA 22% → totale 122, aliquota nell'XML", () => {
  const r = generaFatturaPA(
    dati({ emittente: { ...emittenteForfettario, regime_fiscale: "ordinario" }, aliquotaIva: 22 })
  );
  assert.equal(r.ok, true);
  assert.equal(r.iva, 22);
  assert.equal(r.totale, 122);
  assert.ok(r.xml!.includes("<RegimeFiscale>RF01</RegimeFiscale>"));
  assert.ok(r.xml!.includes("<AliquotaIVA>22.00</AliquotaIVA>"));
  assert.ok(r.xml!.includes("<ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>"));
  assert.ok(!r.xml!.includes("<Natura>"), "in regime ordinario non c'è Natura");
});

test("campi mancanti: si ferma e li elenca (mai XML incompleto)", () => {
  const r = generaFatturaPA(dati({ cliente: { ...clienteCompleto, codice_fiscale: null, cap: null } }));
  assert.equal(r.ok, false);
  assert.equal(r.xml, null);
  assert.ok(r.campiMancanti.includes("codice fiscale o P.IVA del cliente"));
  assert.ok(r.campiMancanti.includes("CAP cliente"));
});

test("prestazione sanitaria a persona fisica: FUORI SDI (divieto di legge)", () => {
  assert.equal(destinoFattura("Fisioterapista", clienteCompleto), "sanitaria_no_sdi");
  assert.equal(destinoFattura("psicologa", clienteCompleto), "sanitaria_no_sdi");
});

test("sanitaria verso azienda (con P.IVA) o professione non sanitaria: via SDI", () => {
  assert.equal(destinoFattura("Fisioterapista", { ...clienteCompleto, piva: "09876543210" }), "sdi");
  assert.equal(destinoFattura("Consulente informatico", clienteCompleto), "sdi");
});

test("codice destinatario: 7 caratteri usato, altrimenti 0000000", () => {
  const conSdi = generaFatturaPA(dati({ cliente: { ...clienteCompleto, sdi: "ABC1234" } }));
  assert.ok(conSdi.xml!.includes("<CodiceDestinatario>ABC1234</CodiceDestinatario>"));
  const senza = generaFatturaPA(dati());
  assert.ok(senza.xml!.includes("<CodiceDestinatario>0000000</CodiceDestinatario>"));
});

test("escaping XML: '&' e '<' nei campi non rompono il documento", () => {
  const r = generaFatturaPA(dati({ descrizione: "Seduta <extra> & controllo" }));
  assert.equal(r.ok, true);
  assert.ok(r.xml!.includes("Seduta &lt;extra&gt; &amp; controllo"));
  assert.ok(!r.xml!.includes("<extra>"));
});

test("spezzaIndirizzo: estrae CAP, comune e provincia da un indirizzo libero", () => {
  const r = spezzaIndirizzo("Via Roma 1, 20100 Milano MI");
  assert.equal(r.cap, "20100");
  assert.equal(r.provincia, "MI");
  assert.ok((r.comune ?? "").includes("Milano"));
  assert.equal(r.indirizzo, "Via Roma 1");
});

test("numerazione: ProgressivoInvio deriva dalle cifre del numero", () => {
  const r = generaFatturaPA(dati({ numero: "7/2026" }));
  assert.ok(r.xml!.includes("<ProgressivoInvio>72026</ProgressivoInvio>"));
  assert.ok(r.xml!.includes("<Numero>7/2026</Numero>"));
});
