// ═══════════════════════════════════════════════════════════════════════════
// IL REFERTO — «ecco quanto stai lasciando per terra».
//
// Non è un cruscotto e non è un grafico: è un foglio con TRE numeri veri, presi
// dai dati di QUESTO studio, che nessuno gli ha mai contato. Serve a una cosa
// sola: far capire che ORION non è un costo ma un recupero.
//
// LA REGOLA CHE LO RENDE CREDIBILE: se i dati sono pochi, il referto lo DICE
// invece di riempire i buchi con delle stime. Un numero inventato qui brucia la
// fiducia in un colpo solo, e non torna più.
// ═══════════════════════════════════════════════════════════════════════════
import { listPagamenti, clientiDormienti, listAppuntamenti, listClienti, oggiRoma } from "./data";

export type VoceReferto = {
  chiave: "da_incassare" | "dormienti" | "agenda_vuota";
  titolo: string;
  /** Il numero grosso, già scritto come va letto («3.240 €», «47 persone»). */
  valore: string;
  /** La riga sotto, che spiega cosa vuol dire. */
  dettaglio: string;
  /** Quanto vale in euro, se si può dire con onestà. 0 = non si sa. */
  euro: number;
};

export type Referto = {
  voci: VoceReferto[];
  /** Il totale che si può dire ad alta voce senza inventare niente. */
  totaleEuro: number;
  /** Quanto storico c'era davvero sotto: serve a ORION per non spararle. */
  base: { clienti: number; pagamenti: number; appuntamenti: number };
  /** Con pochi dati il referto è onesto e corto: qui c'è il perché, in italiano. */
  avvertenza: string | null;
};

const euro = (n: number) => `${Math.round(n).toLocaleString("it-IT")} €`;

function meseIndietro(mesi: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - mesi);
  return d.toISOString().slice(0, 10);
}

/**
 * IL CONTO. Guarda indietro di due anni e cerca solo tre cose — quelle che un
 * professionista riconosce al volo come soldi suoi.
 */
export function calcolaReferto(): Referto {
  const da = meseIndietro(24);
  const a = oggiRoma();
  const voci: VoceReferto[] = [];

  const pagamenti = listPagamenti(da, a);
  const clienti = listClienti();
  const appuntamenti = listAppuntamenti(meseIndietro(3), a);

  // ── 1. QUELLO CHE HAI FATTO E NON HAI MAI INCASSATO ──
  const dovuti = pagamenti.filter((p) => p.stato === "da_incassare");
  if (dovuti.length) {
    const tot = dovuti.reduce((s, p) => s + (Number(p.importo) || 0), 0);
    const piuVecchio = dovuti.map((p) => p.data).sort()[0];
    const mesi = piuVecchio ? Math.max(0, Math.round((Date.now() - new Date(piuVecchio).getTime()) / 2_592_000_000)) : 0;
    voci.push({
      chiave: "da_incassare",
      titolo: "Lavoro fatto e mai incassato",
      valore: euro(tot),
      dettaglio:
        `${dovuti.length} incass${dovuti.length === 1 ? "o" : "i"} ancora aperti` +
        (mesi >= 1 ? ` — il più vecchio è di ${mesi} mes${mesi === 1 ? "e" : "i"} fa` : ""),
      euro: tot,
    });
  }

  // ── 2. LE PERSONE CHE NON TORNANO ──
  // Il valore si stima sullo scontrino MEDIO VERO di questo studio, non su un
  // numero di fantasia: se non si può calcolare, non si dà nessuna cifra.
  // ATTENZIONE: clientiDormienti taglia a 20 di default. Qui serve il numero
  // VERO, altrimenti «47 clienti fermi» diventerebbe «20» senza dirlo.
  const dormienti = clientiDormienti(8, 5000);
  if (dormienti.length) {
    const incassati = pagamenti.filter((p) => p.stato === "incassato");
    const medio = incassati.length >= 5 ? incassati.reduce((s, p) => s + (Number(p.importo) || 0), 0) / incassati.length : 0;
    // Un quarto di chi viene richiamato torna: è la stima prudente, e va detta
    // come stima — mai come promessa.
    const stima = medio ? dormienti.length * 0.25 * medio : 0;
    voci.push({
      chiave: "dormienti",
      titolo: "Persone che non si vedono più",
      valore: `${dormienti.length} client${dormienti.length === 1 ? "e" : "i"}`,
      dettaglio: medio
        ? `fermi da più di 8 mesi. Sul tuo scontrino medio (${euro(medio)}), se ne torna uno su quattro sono circa ${euro(stima)}`
        : "fermi da più di 8 mesi. Quanto valgano non te lo so ancora dire: mi serve un po' di storico degli incassi",
      euro: Math.round(stima),
    });
  }

  // ── 3. I BUCHI CHE SI RIPETONO ──
  // Non «quanto sei pieno», ma QUALE fascia è vuota sempre: è l'unica lettura
  // su cui un professionista può fare qualcosa lunedì mattina.
  if (appuntamenti.length >= 10) {
    const giorni = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
    const conteggio = new Map<string, number>();
    for (const ap of appuntamenti) {
      const d = new Date(ap.inizio);
      const ora = Number(String(ap.inizio).slice(11, 13));
      const fascia = ora < 13 ? "mattina" : "pomeriggio";
      const k = `${giorni[d.getDay()]} ${fascia}`;
      conteggio.set(k, (conteggio.get(k) ?? 0) + 1);
    }
    const tutte: string[] = [];
    for (const g of giorni.slice(1, 7)) for (const f of ["mattina", "pomeriggio"]) tutte.push(`${g} ${f}`);
    const vuote = tutte.filter((k) => (conteggio.get(k) ?? 0) === 0);
    if (vuote.length) {
      voci.push({
        chiave: "agenda_vuota",
        titolo: "Le fasce che restano vuote",
        valore: vuote.length === 1 ? "1 fascia" : `${vuote.length} fasce`,
        dettaglio: `negli ultimi tre mesi non hai mai avuto nessuno il ${vuote.slice(0, 3).join(", il ")}`,
        euro: 0,
      });
    }
  }

  const base = { clienti: clienti.length, pagamenti: pagamenti.length, appuntamenti: appuntamenti.length };
  const pochi = base.pagamenti < 5 && base.appuntamenti < 10;

  return {
    voci,
    totaleEuro: voci.reduce((s, v) => s + v.euro, 0),
    base,
    avvertenza: pochi
      ? "Di storico ce n'è ancora poco: quello che c'è te l'ho detto, il resto te lo dirò quando avremo lavorato insieme qualche settimana. Non ti do numeri inventati."
      : voci.length === 0
        ? "Ho guardato e non ho trovato niente da recuperare: incassi in ordine, nessuno sparito, agenda senza buchi fissi. È una buona notizia."
        : null,
  };
}

/** Il foglio, come va letto — anche da stampare o da lasciare sulla scrivania. */
export function refertoInParole(r: Referto, nomeStudio?: string | null): string {
  const righe: string[] = [];
  righe.push(nomeStudio ? `${nomeStudio.toUpperCase()} — cosa ti sta scappando` : "COSA TI STA SCAPPANDO");
  righe.push("");
  for (const v of r.voci) righe.push(`· ${v.titolo}: ${v.valore} — ${v.dettaglio}`);
  if (!r.voci.length) righe.push("· Niente da recuperare: è una buona notizia.");
  if (r.totaleEuro > 0) {
    righe.push("");
    righe.push(`In tutto, soldi che oggi ti passano davanti: circa ${euro(r.totaleEuro)}.`);
    righe.push("È una stima prudente sui tuoi numeri, non una promessa.");
  }
  if (r.avvertenza) {
    righe.push("");
    righe.push(r.avvertenza);
  }
  righe.push("");
  righe.push(`Conto fatto il ${oggiRoma().split("-").reverse().join("/")} da ORION.`);
  return righe.join("\n");
}
