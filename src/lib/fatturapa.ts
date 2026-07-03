// ──────────────────────────────────────────────────────────────────────────
// FatturaPA: generazione dell'XML 1.2 (FPR12) per la fatturazione elettronica.
//
// Questo modulo è PURO (nessun accesso a DB o rete): riceve i dati, restituisce
// XML + esito di validazione. La trasmissione allo SDI è in sdi.ts.
//
// REGOLE ITALIANE IMPLEMENTATE:
//  - Regime forfettario (RF19): niente IVA, Natura N2.2, riferimento normativo
//    L.190/2014; bollo virtuale da 2,00 € se il totale supera 77,47 €.
//  - Regime ordinario (RF01): IVA con aliquota indicata (default 22%).
//  - PRESTAZIONI SANITARIE VERSO PERSONE FISICHE: per legge NON vanno inviate
//    allo SDI (divieto a tutela della privacy sanitaria — flusso Sistema TS).
//    `destinoFattura` lo rileva e ORION emette il documento SENZA trasmetterlo.
//  - Codice destinatario: SDI a 7 caratteri, oppure '0000000' (+ eventuale PEC).
// ──────────────────────────────────────────────────────────────────────────

export type ParteFattura = {
  denominazione: string | null;
  piva: string | null;
  codice_fiscale: string | null;
  indirizzo: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  pec?: string | null;
  sdi?: string | null; // codice destinatario (solo lato cliente)
  regime_fiscale?: string | null; // solo lato emittente
};

export type DatiFattura = {
  numero: string; // es. "12/2026"
  data: string; // YYYY-MM-DD
  importo: number; // imponibile (per il forfettario = compenso)
  descrizione: string;
  emittente: ParteFattura;
  cliente: ParteFattura;
  aliquotaIva?: number; // usata solo in regime ordinario (default 22)
};

export type EsitoFatturaPA = {
  ok: boolean;
  xml: string | null;
  campiMancanti: string[];
  bollo: number | null;
  totale: number;
  iva: number;
};

const SOGLIA_BOLLO = 77.47;
const IMPORTO_BOLLO = 2.0;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const dec = (n: number) => n.toFixed(2);

// Il profilo può avere solo l'indirizzo libero ("Via Roma 1, 20100 Milano MI"):
// estraiamo CAP (5 cifre), provincia (2 lettere finali) e comune come fallback.
export function spezzaIndirizzo(libero: string | null): { indirizzo: string | null; cap: string | null; comune: string | null; provincia: string | null } {
  if (!libero) return { indirizzo: null, cap: null, comune: null, provincia: null };
  const capMatch = libero.match(/\b(\d{5})\b/);
  const cap = capMatch?.[1] ?? null;
  const provMatch = libero.match(/\b([A-Z]{2})\b\s*$/);
  const provincia = provMatch?.[1] ?? null;
  let comune: string | null = null;
  if (cap) {
    // Il comune di solito segue il CAP: "…, 20100 Milano (MI)".
    const dopo = libero.slice(libero.indexOf(cap) + 5).replace(/[(),]/g, " ").trim();
    const primo = dopo.split(/\s+/).filter((w) => !/^[A-Z]{2}$/.test(w));
    if (primo.length) comune = primo.slice(0, 3).join(" ").trim() || null;
  }
  const indirizzo = cap ? libero.slice(0, libero.indexOf(cap)).replace(/[,\s]+$/, "").trim() || libero : libero;
  return { indirizzo, cap, comune, provincia };
}

// Completa i campi sede di una parte usando (in ordine): campi strutturati,
// parsing dell'indirizzo libero.
function sede(p: ParteFattura): { indirizzo: string | null; cap: string | null; comune: string | null; provincia: string | null } {
  const parsed = spezzaIndirizzo(p.indirizzo);
  return {
    indirizzo: parsed.indirizzo ?? p.indirizzo,
    cap: p.cap ?? parsed.cap,
    comune: p.comune ?? parsed.comune,
    provincia: p.provincia ?? parsed.provincia,
  };
}

const PROFESSIONI_SANITARIE =
  /psicolog|psicoterapeut|fisioterap|medic|dentist|odontoiatr|nutrizionist|dietist|logopedist|osteopat|ostetric|infermier|podolog|biolog|veterinari|oculist|ortoped|dermatolog|cardiolog|ginecolog/i;

// Dove deve andare questa fattura?
//  - 'sanitaria_no_sdi': prestazione sanitaria a persona fisica → VIETATO SDI
//    (si emette il documento e, se dovuto, si trasmette al Sistema TS).
//  - 'sdi': tutti gli altri casi → fattura elettronica via SDI.
export function destinoFattura(professione: string | null, cliente: ParteFattura): "sdi" | "sanitaria_no_sdi" {
  const sanitaria = !!professione && PROFESSIONI_SANITARIE.test(professione);
  const personaFisica = !cliente.piva; // niente P.IVA → consumatore/paziente
  return sanitaria && personaFisica ? "sanitaria_no_sdi" : "sdi";
}

export function generaFatturaPA(d: DatiFattura): EsitoFatturaPA {
  const campiMancanti: string[] = [];
  const em = d.emittente;
  const cl = d.cliente;
  const sedeEm = sede(em);
  const sedeCl = sede(cl);

  if (!em.denominazione) campiMancanti.push("nome/denominazione emittente");
  if (!em.piva) campiMancanti.push("P.IVA emittente");
  if (!sedeEm.indirizzo) campiMancanti.push("indirizzo emittente");
  if (!sedeEm.cap) campiMancanti.push("CAP emittente");
  if (!sedeEm.comune) campiMancanti.push("comune emittente");
  if (!cl.denominazione) campiMancanti.push("nome cliente");
  if (!cl.piva && !cl.codice_fiscale) campiMancanti.push("codice fiscale o P.IVA del cliente");
  if (!sedeCl.indirizzo) campiMancanti.push("indirizzo cliente");
  if (!sedeCl.cap) campiMancanti.push("CAP cliente");
  if (!sedeCl.comune) campiMancanti.push("comune cliente");

  const regime = (em.regime_fiscale ?? "").toLowerCase();
  const forfettario = /forfett|rf19|minimi/.test(regime);
  const regimeCod = forfettario ? "RF19" : "RF01";

  const aliquota = forfettario ? 0 : d.aliquotaIva ?? 22;
  const imponibile = d.importo;
  const iva = forfettario ? 0 : Math.round(imponibile * aliquota) / 100;
  const bollo = forfettario && imponibile > SOGLIA_BOLLO ? IMPORTO_BOLLO : null;
  const totale = imponibile + iva; // il bollo, se a carico del cliente, resta fuori dal totale documento (scelta prudente)

  if (campiMancanti.length) {
    return { ok: false, xml: null, campiMancanti, bollo, totale, iva };
  }

  // Codice destinatario: SDI del cliente (7 caratteri) o '0000000' (recapito
  // via PEC/cassetto fiscale). '0000000' è corretto per i consumatori.
  const codDest = (cl.sdi ?? "").trim().length === 7 ? (cl.sdi ?? "").trim().toUpperCase() : "0000000";
  const pecDest = codDest === "0000000" && cl.pec ? cl.pec.trim() : null;

  const progressivo = d.numero.replace(/\D/g, "").slice(0, 10) || "1";
  const natura = forfettario ? "N2.2" : null;
  const rifNormativo = forfettario
    ? "Operazione senza applicazione dell'IVA ai sensi dell'art. 1, commi 54-89, L. 190/2014 (regime forfettario)"
    : null;

  const idFiscaleCliente = cl.piva
    ? `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${esc(cl.piva.replace(/\D/g, ""))}</IdCodice></IdFiscaleIVA>`
    : "";
  const cfCliente = cl.codice_fiscale ? `<CodiceFiscale>${esc(cl.codice_fiscale.toUpperCase())}</CodiceFiscale>` : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${esc((em.piva ?? "").replace(/\D/g, ""))}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${esc(progressivo)}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${esc(codDest)}</CodiceDestinatario>${pecDest ? `\n      <PECDestinatario>${esc(pecDest)}</PECDestinatario>` : ""}
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${esc((em.piva ?? "").replace(/\D/g, ""))}</IdCodice>
        </IdFiscaleIVA>${em.codice_fiscale ? `\n        <CodiceFiscale>${esc(em.codice_fiscale.toUpperCase())}</CodiceFiscale>` : ""}
        <Anagrafica>
          <Denominazione>${esc(em.denominazione ?? "")}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>${regimeCod}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(sedeEm.indirizzo ?? "")}</Indirizzo>
        <CAP>${esc(sedeEm.cap ?? "")}</CAP>
        <Comune>${esc(sedeEm.comune ?? "")}</Comune>${sedeEm.provincia ? `\n        <Provincia>${esc(sedeEm.provincia)}</Provincia>` : ""}
        <Nazione>IT</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        ${idFiscaleCliente}${idFiscaleCliente && cfCliente ? "\n        " : ""}${cfCliente}
        <Anagrafica>
          <Denominazione>${esc(cl.denominazione ?? "")}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(sedeCl.indirizzo ?? "")}</Indirizzo>
        <CAP>${esc(sedeCl.cap ?? "")}</CAP>
        <Comune>${esc(sedeCl.comune ?? "")}</Comune>${sedeCl.provincia ? `\n        <Provincia>${esc(sedeCl.provincia)}</Provincia>` : ""}
        <Nazione>IT</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${esc(d.data)}</Data>
        <Numero>${esc(d.numero)}</Numero>${
          bollo
            ? `\n        <DatiBollo>\n          <BolloVirtuale>SI</BolloVirtuale>\n          <ImportoBollo>${dec(bollo)}</ImportoBollo>\n        </DatiBollo>`
            : ""
        }
        <ImportoTotaleDocumento>${dec(totale)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>${esc(d.descrizione || "Prestazione professionale")}</Descrizione>
        <Quantita>1.00</Quantita>
        <PrezzoUnitario>${dec(imponibile)}</PrezzoUnitario>
        <PrezzoTotale>${dec(imponibile)}</PrezzoTotale>
        <AliquotaIVA>${dec(aliquota)}</AliquotaIVA>${natura ? `\n        <Natura>${natura}</Natura>` : ""}
      </DettaglioLinee>
      <DatiRiepilogo>
        <AliquotaIVA>${dec(aliquota)}</AliquotaIVA>${natura ? `\n        <Natura>${natura}</Natura>` : ""}
        <ImponibileImporto>${dec(imponibile)}</ImponibileImporto>
        <Imposta>${dec(iva)}</Imposta>${rifNormativo ? `\n        <RiferimentoNormativo>${esc(rifNormativo)}</RiferimentoNormativo>` : ""}
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;

  return { ok: true, xml, campiMancanti: [], bollo, totale, iva };
}
