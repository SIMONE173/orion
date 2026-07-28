// ═══════════════════════════════════════════════════════════════════════════
// L'ANTICIPAZIONE — «mentre parlate, ORION ha già aperto ciò che serve».
//
// Questo NON è un'istruzione nel prompt: è una pipeline che gira su OGNI turno
// PRIMA di chiamare l'AI. Il modello non decide se aprire — trova le cose già
// aperte e i dati già in mano, e deve solo raccontarlo. Un prompt di 28.000
// token si dimentica le cose; il codice no.
//
// La difficoltà vera non è capire chi è nominato: è NON essere invadenti.
// Per questo la parte più lunga qui sotto è il Governatore, cioè l'elenco dei
// motivi per NON aprire niente.
// ═══════════════════════════════════════════════════════════════════════════
import { listClienti, listConnessioni, listAppuntamenti, listPagamenti, listDocumenti } from "../data";
import { tenantIdCorrente } from "../tenant";
import type { Vista, Azione } from "./views";
import type { Cliente } from "../data";

/** La fotografia di ciò che l'utente ha GIÀ davanti: senza, anticipare = spam. */
export type Schermo = {
  /** Pannelli già a schermo, per tipo ("cliente", "agenda", …). */
  pannelli?: string[];
  /** Finestre di altri programmi già aperte (solo Desktop). */
  app?: string[];
  /** La Mano sta guidando il computer: non si tocca NIENTE. */
  manoInCorso?: boolean;
};

export type Anticipo = {
  viste: Vista[];
  azioni: Azione[];
  /** Il blocco che finisce in coda all'ultimo messaggio: ORION lo legge per ultimo. */
  nota: string;
};

// ─── 1. IL VOCABOLARIO DELL'UTENTE ─────────────────────────────────────────
// Non un riconoscitore di nomi generico: i nomi VERI di questo studio, presi
// dal database. Cache breve per non interrogare il DB a ogni battuta.
type Vocabolario = { clienti: Cliente[]; sistemi: { nome: string; apertura: string }[]; scadenza: number };
const vocabolari = new Map<string, Vocabolario>();

/** Il vocabolario si rilegge dal database: da usare quando i clienti cambiano. */
export function dimenticaVocabolario(): void {
  vocabolari.clear();
  cacheAppuntamenti = null;
}

function vocabolario(): Vocabolario {
  const chiave = String(tenantIdCorrente() ?? "-");
  const ora = Date.now();
  const c = vocabolari.get(chiave);
  if (c && c.scadenza > ora) return c;
  const v: Vocabolario = {
    clienti: listClienti(),
    sistemi: listConnessioni()
      .filter((x) => x.attivo)
      .map((x) => ({ nome: x.nome, apertura: x.apertura || x.nome })),
    scadenza: ora + 30_000,
  };
  vocabolari.set(chiave, v);
  return v;
}

/** Scritto come si pronuncia: niente accenti, niente maiuscole, niente punteggiatura. */
function piano(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── 2. DI COSA SI STA PARLANDO ────────────────────────────────────────────
const INTENTI: { id: string; re: RegExp; peso: number }[] = [
  { id: "fattura", re: /\b(fattur\w*|parcell\w*|ricevut\w*|preventiv\w*|nota\s+spese)\b/, peso: 0.3 },
  { id: "pagamento", re: /\b(pagament\w*|pagat\w*|incass\w*|salda\w*|sospes\w*|deve\s+dar\w*|acconto)\b/, peso: 0.28 },
  { id: "documento", re: /\b(document\w*|contratt\w*|referto|cartell\w*|scheda|allegat\w*|pratica|pratich\w*)\b/, peso: 0.28 },
  { id: "appuntamento", re: /\b(appuntament\w*|visit\w*|sedut\w*|prenotaz\w*|incontr\w*|riunion\w*|convoc\w*)\b/, peso: 0.26 },
  { id: "agenda", re: /\b(agenda|giornata|domani|stamattina|pomeriggio|settimana|dopodomani|calendari\w*)\b/, peso: 0.22 },
  { id: "gestionale", re: /\b(gestional\w*|softwar\w*|portal\w*|programm\w*|sistem\w*)\b/, peso: 0.24 },
];

// I cognomi italiani che sono ANCHE parole di tutti i giorni: la fonte numero
// uno di falsi allarmi («i conti non tornano» non parla del signor Conti).
const PAROLE_COMUNI = new Set(
  ("rossi bianchi conti monti costa villa sole forte greco gallo riva franco sala chiesa " +
    "grasso pace marino bello rosa neri longo ferro sartori corte piazza ponte prato bosco " +
    "campo mare lungo bruno grande russo").split(" ")
);
const TITOLI = /\b(sig|sig ra|signor\w*|dott\w*|avv\w*|ing\w*|prof\w*|geom|rag|il|la|del|della|per|con|da)\s+$/;

/** Distanza di una lettera: il dettato sbaglia le finali («Rossì», «Ross»). */
function quasiUguale(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;
  let i = 0;
  let j = 0;
  let differenze = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++differenze > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return differenze + (a.length - i) + (b.length - j) <= 1;
}

type Candidato = { cliente: Cliente; punti: number; come: string };

function candidati(testoPiano: string, intenti: string[]): Candidato[] {
  const parole = testoPiano.split(" ");
  const fuori: Candidato[] = [];
  const pesoIntento = INTENTI.filter((i) => intenti.includes(i.id)).reduce((m, i) => Math.max(m, i.peso), 0);

  for (const cl of vocabolario().clienti) {
    const intero = piano(cl.nome);
    if (!intero) continue;
    const pezzi = intero.split(" ").filter((p) => p.length >= 3);
    let punti = 0;
    let come = "";

    if (testoPiano.includes(intero) && intero.includes(" ")) {
      punti = 0.95;
      come = "nome e cognome";
    } else {
      // Il cognome è l'ultimo pezzo del nome: è quello che si dice davvero.
      const cognome = pezzi[pezzi.length - 1];
      const battesimo = pezzi.length > 1 ? pezzi[0] : "";
      if (cognome && parole.includes(cognome)) {
        punti = 0.7;
        come = "cognome";
      } else if (battesimo && parole.includes(battesimo)) {
        punti = 0.55;
        come = "nome di battesimo";
      } else if (cognome && cognome.length >= 5 && parole.some((p) => p.length >= 5 && quasiUguale(p, cognome))) {
        punti = 0.5;
        come = "cognome quasi uguale (dettatura)";
      }
    }
    if (!punti) continue;

    // Un titolo davanti («il signor Rossi») toglie quasi ogni dubbio.
    const dove = testoPiano.indexOf(come === "nome e cognome" ? intero : pezzi[pezzi.length - 1]);
    if (dove > 0 && TITOLI.test(testoPiano.slice(Math.max(0, dove - 14), dove))) punti += 0.08;
    if (pesoIntento) punti += pesoIntento;

    // Un appuntamento con lui nelle prossime 48 ore: è quasi certo che sia lui.
    if (haAppuntamentoVicino(cl.id)) punti += 0.15;

    // La trappola italiana: cognome che è anche parola comune, senza niente
    // che lo sostenga → quasi sempre è un falso allarme.
    const cognome = pezzi[pezzi.length - 1];
    if (PAROLE_COMUNI.has(cognome) && !pesoIntento && come !== "nome e cognome") punti -= 0.22;

    fuori.push({ cliente: cl, punti: Math.min(1, punti), come });
  }
  return fuori.sort((a, b) => b.punti - a.punti);
}

let cacheAppuntamenti: { fino: number; ids: Set<number> } | null = null;
function haAppuntamentoVicino(clienteId: number): boolean {
  const ora = Date.now();
  if (!cacheAppuntamenti || cacheAppuntamenti.fino < ora) {
    const oggi = new Date();
    const fra2 = new Date(ora + 48 * 3600 * 1000);
    const ids = new Set<number>();
    try {
      for (const a of listAppuntamenti(oggi.toISOString().slice(0, 10), fra2.toISOString().slice(0, 10))) {
        if (a.cliente_id) ids.add(a.cliente_id);
      }
    } catch {
      /* agenda non disponibile: nessun bonus, nessun danno */
    }
    cacheAppuntamenti = { fino: ora + 60_000, ids };
  }
  return cacheAppuntamenti.ids.has(clienteId);
}

// ─── 3. IL GOVERNATORE ─────────────────────────────────────────────────────
const SOGLIA = 0.62;
const APERTO_DA_POCO = new Map<string, number>(); // chiave → quando (cooldown 10')

/** Un ORDINE esplicito non è un'anticipazione: ci pensa lo strumento. */
const ORDINE = /\b(apri|aprimi|mostra|mostrami|fammi\s+vedere|visualizza|tira\s+su|dammi)\b/;
/** «Non aprirmi niente da solo»: se lo dice, l'anticipo tace. */
export const NON_ANTICIPARE = /\bnon\s+(aprir\w*|mostrar\w*)\s+(niente|nulla)\b|\bsmettila\s+di\s+aprire\b/;

// ─── 4. IL MOTORE ──────────────────────────────────────────────────────────
export async function anticipa(
  testo: string,
  opzioni: {
    desktop?: boolean;
    inDemo?: boolean;
    onboardingCompleto?: boolean;
    schermo?: Schermo;
    utenteId?: string | number;
  } = {}
): Promise<Anticipo | null> {
  const { desktop, inDemo, onboardingCompleto = true, schermo = {} } = opzioni;
  if (!testo || inDemo || !onboardingCompleto) return null;
  if (schermo.manoInCorso) return null; // la Mano sta lavorando: giù le mani

  const t = piano(testo);
  if (!t || t.length < 3) return null;
  if (ORDINE.test(t)) return null; // te l'ha chiesto: non serve anticipare
  if (NON_ANTICIPARE.test(t)) return null;

  const intenti = INTENTI.filter((i) => i.re.test(t)).map((i) => i.id);
  const lista = candidati(t, intenti);
  const viste: Vista[] = [];
  const azioni: Azione[] = [];
  const righe: string[] = [];

  // ── DUE PERSONE CON LO STESSO COGNOME: non si indovina, si chiede. ──
  if (lista.length >= 2 && lista[0].punti >= 0.55 && lista[0].punti - lista[1].punti < 0.08) {
    return {
      viste: [],
      azioni: [],
      nota:
        `[Sistema · ANTICIPO] Ho due persone che corrispondono a quel nome: ${lista[0].cliente.nome} e ${lista[1].cliente.nome}. ` +
        "NON ho aperto niente e non devi indovinare: chiedi in mezza frase quale dei due, poi vai avanti.",
    };
  }

  const scelto = lista[0];
  const apribile = scelto && scelto.punti >= SOGLIA;

  if (apribile) {
    const chiave = `cliente:${scelto.cliente.id}`;
    const giaSuSchermo = (schermo.pannelli ?? []).includes("cliente");
    const appenaFatto = (APERTO_DA_POCO.get(chiave) ?? 0) > Date.now() - 10 * 60_000;

    if (!giaSuSchermo && !appenaFatto) {
      APERTO_DA_POCO.set(chiave, Date.now());
      const { dispatch } = await import("./tools");
      const esito = await dispatch("scheda_cliente", { cliente_id: scelto.cliente.id }, { strumentiUsati: [] });
      if (esito.vista) viste.push(esito.vista);
      righe.push(`Ti ho GIÀ aperto la scheda di ${scelto.cliente.nome} (l'ho riconosciuto dal ${scelto.come}).`);
    } else {
      righe.push(`${scelto.cliente.nome} ce l'hai già davanti: NON riaprirlo, parlane e basta.`);
    }

    // ── LA PERLA: i suoi dati già in mano, senza un secondo giro. ──
    const pezzi: string[] = [];
    try {
      const anno = new Date().getFullYear();
      const dovuti = listPagamenti(`${anno - 1}-01-01`, `${anno + 1}-12-31`).filter(
        (x) => x.cliente_id === scelto.cliente.id && x.stato !== "pagato"
      );
      if (dovuti.length) {
        const tot = dovuti.reduce((s, x) => s + (Number(x.importo) || 0), 0);
        pezzi.push(`${tot.toFixed(0)} € ancora da incassare`);
      }
    } catch {
      /* niente pagamenti: nessun dato in più, nessun danno */
    }
    try {
      const d = listDocumenti().filter((x) => x.cliente_id === scelto.cliente.id);
      if (d.length) pezzi.push(`${d.length} document${d.length === 1 ? "o" : "i"} archiviat${d.length === 1 ? "o" : "i"}`);
    } catch {
      /* niente documenti */
    }
    if (scelto.cliente.ultima_visita) pezzi.push(`ultima volta il ${String(scelto.cliente.ultima_visita).slice(8, 10)}/${String(scelto.cliente.ultima_visita).slice(5, 7)}`);
    if (pezzi.length) righe.push(`Cosa sai già di lui, senza cercare: ${pezzi.join("; ")}.`);
  }

  // ── L'AGENDA: se si parla di giornata/appuntamenti e non c'è già davanti. ──
  if (!viste.length && (intenti.includes("agenda") || intenti.includes("appuntamento")) && !(schermo.pannelli ?? []).includes("agenda")) {
    const chiave = "agenda";
    if ((APERTO_DA_POCO.get(chiave) ?? 0) < Date.now() - 10 * 60_000) {
      APERTO_DA_POCO.set(chiave, Date.now());
      const { dispatch } = await import("./tools");
      const quando = /\bdomani\b/.test(t) ? domani() : /\bdopodomani\b/.test(t) ? domani(2) : undefined;
      const esito = await dispatch("mostra_agenda", quando ? { data_da: quando, data_a: quando } : {}, { strumentiUsati: [] });
      if (esito.vista) {
        viste.push(esito.vista);
        righe.push(`Ti ho GIÀ aperto l'agenda${quando ? " di " + quando.slice(8, 10) + "/" + quando.slice(5, 7) : ""}.`);
      }
    }
  }

  // ── IL SUO GESTIONALE, sul computer vero (solo Desktop). ──
  if (desktop && intenti.includes("gestionale")) {
    const sistema = vocabolario().sistemi.find((x) => t.includes(piano(x.nome)));
    if (sistema) {
      const chiave = `app:${sistema.nome}`;
      const giaAperto = (schermo.app ?? []).some((a: string) => piano(a).includes(piano(sistema.nome)));
      if (!giaAperto && (APERTO_DA_POCO.get(chiave) ?? 0) < Date.now() - 10 * 60_000) {
        APERTO_DA_POCO.set(chiave, Date.now());
        azioni.push({ tipo: "apri_app", nome: sistema.apertura });
        righe.push(
          `STO APRENDO ${sistema.nome} sul suo computer adesso. Dillo al PRESENTE («te lo sto aprendo»), ` +
            "non al passato: se poi non si apre te lo dirà l'app e in quel caso lo correggi subito."
        );
      }
    }
  }

  if (!righe.length) return null;
  return {
    viste,
    azioni,
    nota:
      "[Sistema · ANTICIPO] " +
      righe.join(" ") +
      " ISTRUZIONI: nominalo in MEZZA FRASE all'inizio («intanto ti ho già aperto…») e poi rispondi a quello che ti ha chiesto. " +
      "NON descrivere il pannello, NON elencare cosa contiene, NON chiedere il permesso: è già fatto. Una mezza frase, poi avanti.",
  };
}

function domani(giorni = 1): string {
  const d = new Date();
  d.setDate(d.getDate() + giorni);
  return d.toISOString().slice(0, 10);
}
