// ═══════════════════════════════════════════════════════════════════════════
// IL PRIMO GIRO — il tutorial guidato della versione COMPLETA.
//
// Non è un tour: è LA MESSA IN OPERA. Ogni tappa lascia dietro qualcosa di
// vero e permanente — gli strumenti registrati, i clienti dentro, la segreteria
// accesa, un appuntamento scritto nel suo gestionale. Alla fine il professionista
// non è «impressionato»: è CONFIGURATO. E la dimostrazione non è stata una
// recita, era il setup stesso.
//
// Qui non c'è NIENTE di finto: è il suo computer, i suoi programmi, i suoi
// clienti. È la differenza fra questo e la vecchia demo, che doveva inventarsi
// un mondo — e più lo inventava bene, più restava finto.
//
// LA REGOLA CHE CAMBIA TUTTO: una tappa è «fatta» solo quando il codice VEDE
// il risultato vero nel database. Non quando il modello dice di averla fatta.
// (Il prompt di sistema pesa 28.000 token e le istruzioni scritte là dentro
// vengono ignorate: in questo progetto l'abbiamo già pagato caro.)
// ═══════════════════════════════════════════════════════════════════════════
import { db } from "../db";
import { tenantIdCorrente as T } from "../tenant";
import { listClienti, listConnessioni, gestionaleFonte } from "../data";

export type TappaPrimoGiro = {
  id: string;
  titolo: string;
  icona: string;
  /** La presentazione a schermo: poche righe, grandi. */
  palco: { sottotitolo: string; cosa: string; perche: string; prova: string };
  /** Le istruzioni operative per ORION su QUESTA tappa. */
  guida: string;
  /** Serve il computer (app desktop)? Sul web la tappa non esiste. */
  soloDesktop?: boolean;
  /** Si può saltare senza rovinare niente. */
  saltabile?: boolean;
};

/**
 * LA PROVA CHE È SUCCESSO DAVVERO. Interroga il database, non il modello.
 * Se torna false, la tappa NON avanza — per quanto ORION racconti il contrario.
 */
function risultatoVero(id: string): boolean {
  try {
    switch (id) {
      case "scrivania":
        // Ha registrato almeno uno strumento con cui lavora ogni giorno.
        return listConnessioni().filter((c) => c.attivo).length > 0;
      case "clienti":
        // I suoi clienti veri sono dentro (importati, letti dal gestionale, o
        // creati a mano mentre si lavorava).
        return listClienti().length > 0;
      case "segreteria": {
        // Un canale vero collegato: WhatsApp o email.
        const w = db().prepare("SELECT COUNT(*) AS n FROM whatsapp_accounts WHERE tenant_id = ?").get(T()) as { n: number };
        const e = db().prepare("SELECT COUNT(*) AS n FROM email_accounts WHERE tenant_id = ?").get(T()) as { n: number };
        return (w?.n ?? 0) + (e?.n ?? 0) > 0;
      }
      case "mano":
        // La Mano ha scritto davvero: lo dice l'esito, segnato dal client.
        return statoPrimoGiro().provate.includes("mano");
      default:
        // Le tappe che non lasciano una traccia nel database (il referto, il
        // saluto finale) si spuntano quando ORION le ha davvero consegnate.
        return statoPrimoGiro().provate.includes(id);
    }
  } catch {
    return false;
  }
}

// ─── LE TAPPE ──────────────────────────────────────────────────────────────

const SCRIVANIA: TappaPrimoGiro = {
  id: "scrivania",
  titolo: "La tua scrivania",
  icona: "🖥",
  soloDesktop: true,
  palco: {
    sottotitolo: "Le tue cose, aperte e in ordine, prima che tu le chieda",
    cosa: "Mi dici cosa apri appena ti siedi — il gestionale, la posta, WhatsApp Web, un portale — e da domani mattina te li apro io, già disposti sullo schermo ognuno al suo posto.",
    perche: "Sono i primi cinque minuti di ogni tua giornata, tutti i giorni. Da domani non li fai più.",
    prova: "Dimmi le due o tre cose che apri ogni mattina.",
  },
  guida: `SCOPO: registrare gli strumenti con cui lavora, e APRIRGLIELI SUBITO davanti.
1) Chiedi quali 2-3 cose apre appena si siede al computer. Se non sa rispondere, offriti di guardare quali programmi ha aperto adesso ("guardo solo i nomi, non i tuoi file").
2) Per OGNUNO chiama collega_sistema: nome + tipo + come si apre (nome dell'app o indirizzo del sito) nel campo 'apertura'. Senza 'apertura' domattina non potrai aprirglielo: insisti con garbo per averla.
3) Quando ne hai almeno uno, chiama briefing: l'app APRIRÀ DA SOLA i suoi programmi e li disporrà a griglia sullo schermo. Tu digli in mezza frase di guardare lo schermo. NON descrivere quello che sta per succedere: fallo e basta.
4) Poi UNA frase: da domani mattina lo trova già così senza chiedertelo.`,
};

const CLIENTI: TappaPrimoGiro = {
  id: "clienti",
  titolo: "I tuoi clienti",
  icona: "👥",
  palco: {
    sottotitolo: "Porto dentro le persone vere, non degli esempi",
    cosa: "I tuoi clienti li prendo da dove sono già: un file esportato dal gestionale, oppure li leggo io dallo schermo del programma che usi. Se non ne hai, partiamo puliti e nascono lavorando.",
    perche: "Da qui in poi, quando nomini una persona io so chi è: quando è venuta l'ultima volta, cosa ti deve, cosa avete detto.",
    prova: "Hai un file dei clienti da qualche parte? Anche vecchio va bene.",
  },
  guida: `SCOPO: far entrare i clienti VERI. È la tappa che rende ORION suo invece che generico.
Proponi TRE strade, in quest'ordine, e lascia scegliere:
 a) UN FILE (CSV/Excel esportato dal gestionale, anche vecchio): chiedi di trascinarlo qui → importa_dati.
 b) DALLO SCHERMO (solo Desktop, solo se ha un gestionale): apri il suo gestionale e usa usa_computer per LEGGERE l'elenco clienti e riportarlo. Obiettivo chiaro e limitato: leggere nome, telefono ed eventuale email dalla lista clienti. Non modificare NIENTE nel suo programma: solo leggere.
 c) DA ZERO: nessun file, nessun gestionale. Diglielo senza drammi ("li mettiamo dentro mentre lavoriamo, uno alla volta") e crea insieme a lui il primo cliente vero con crea_cliente.
Se il file ha poche colonne o nomi strani NON inventare: mostra cosa hai capito e fatti correggere.`,
};

const REFERTO: TappaPrimoGiro = {
  id: "referto",
  titolo: "Cosa ti sta scappando",
  icona: "📊",
  palco: {
    sottotitolo: "I tuoi numeri, quelli che nessuno ti ha mai contato",
    cosa: "Guardo il tuo storico e ti dico quanto hai fatto e mai incassato, quante persone non si vedono da mesi, quali fasce della settimana ti restano vuote sempre.",
    perche: "Sono soldi che ci sono già e non li stai prendendo. Non serve un cliente nuovo: bastano quelli che hai.",
    prova: "Guarda il conto — e dimmi se i numeri ti tornano.",
  },
  guida: `SCOPO: il referto sui SUOI dati. È il momento che vale tutta la conversazione.
1) Chiama analisi_economica e analisi_proattiva; se ha abbastanza storico, anche prepara_richiami (clienti fermi da mesi).
2) Racconta i numeri in TRE righe secche, in euro, senza giri: quanto c'è da incassare e da quanto; quante persone non tornano da mesi e quanto varrebbero; quali buchi ha in agenda.
3) SE I DATI SONO POCHI (ha appena importato quattro clienti, o zero storico) NON INVENTARE NIENTE: dillo con semplicità — "con più storico ti dico di più, per ora ti dico solo questo" — e mostra il poco che c'è. Un numero inventato qui brucia tutta la fiducia in un colpo.
4) Chiudi con l'offerta concreta: "vuoi che li richiami io, uno per uno, con un messaggio scritto come parli tu?".`,
};

const SEGRETERIA: TappaPrimoGiro = {
  id: "segreteria",
  titolo: "Da stanotte rispondo io",
  icona: "💬",
  saltabile: true,
  palco: {
    sottotitolo: "I clienti scrivono a qualsiasi ora. Da stanotte trovano risposta.",
    cosa: "Collego il tuo WhatsApp e la tua posta. Da quel momento rispondo io ai clienti — anche alle undici di sera, anche a computer spento, perché quella parte vive sul server e non sul tuo PC.",
    perche: "Un cliente che scrive e non trova risposta entro un'ora, la metà delle volte scrive a un altro. Questo è il pezzo che ti fa risparmiare di più senza che tu faccia niente.",
    prova: "Colleghiamo il numero? Ci vuole un minuto.",
  },
  guida: `SCOPO: accendere la segreteria h24. È il pezzo che si ripaga da solo.
1) Proponi WhatsApp (collega_whatsapp) e/o la posta (collega_email). Spiega in una frase che quella parte vive sul server: risponde anche a computer spento.
2) Spiega i tre livelli e fatti dire quale vuole (configura_risponditore): SPENTA · ASSISTITA (risponde e prende i messaggi, l'agenda non la tocca) · AUTOPILOTA (sposta, disdice e prenota da sola negli spazi liberi). Consiglia di partire da ASSISTITA e passare all'autopilota quando si fida.
3) SE NON VUOLE COLLEGARE NIENTE ADESSO: nessun problema, si salta. Dillo tranquillo ("quando vuoi, si fa in un minuto") e vai avanti. Non insistere due volte.`,
};

const MANO: TappaPrimoGiro = {
  id: "mano",
  titolo: "Ti muovo il mouse",
  icona: "🖐",
  soloDesktop: true,
  palco: {
    sottotitolo: "Scrivo dentro il TUO programma, come faresti tu",
    cosa: "Non ho un collegamento segreto col tuo gestionale: guardo lo schermo, muovo il mouse e scrivo. Come una persona. Per questo lavoro dentro qualsiasi programma tu abbia, anche uno di vent'anni fa.",
    perche: "È la differenza fra cambiare gestionale e tenerti il tuo. Tu non cambi niente: mi adatto io.",
    prova: "Dimmi un appuntamento vero da mettere, e guarda lo schermo.",
  },
  guida: `SCOPO: la prova sul campo, nel SUO gestionale. È il momento che vende.
1) CHIEDI IL PERMESSO, una volta: "adesso ti muovo il mouse. Se ti spaventi c'è il cerchio rosso, o schiacci Esc e mi fermo." Aspetta un sì. È l'unica autorizzazione di tutto il giro.
2) Fatti dire UN appuntamento vero da inserire (persona + giorno + ora). Se non gliene viene in mente uno, proponi tu di scrivere una nota di prova che poi cancella lui.
3) usa_computer con l'obiettivo scritto in modo semplice e chiuso: apri il suo gestionale, inserisci QUELL'appuntamento, salva.
4) LA PRIMA VOLTA FERMATI PRIMA DI SALVARE e chiedi conferma: "è giusto così? salvo?". Come un dipendente nuovo che si fa controllare. Dalla seconda volta in poi non serve più.
5) Quando l'esito torna, di' LA FRASE — "non ho nessun collegamento col tuo gestionale: ho guardato lo schermo e ho scritto come faresti tu" — e riferisci l'esito VERO. Se non è andata, dillo e proponi di riprovare o di farlo insieme.`,
};

const DOMATTINA: TappaPrimoGiro = {
  id: "domattina",
  titolo: "Domattina",
  icona: "🌅",
  palco: {
    sottotitolo: "Da domani cominci con tutto già pronto",
    cosa: "Apri il computer e trovi i tuoi programmi già aperti e in ordine, la giornata raccontata, e quello che è successo mentre non c'eri già riportato dove doveva andare.",
    perche: "Non è che fai le stesse cose più in fretta: è che certe cose non le fai più.",
    prova: "Domattina apri ORION e vedi.",
  },
  guida: `SCOPO: consegnargli il DOMANI, e chiudere.
1) Racconta in tre frasi cosa succede da domani: il buongiorno che apparecchia la scrivania e racconta la giornata; la segreteria che ha lavorato la notte; quello che è successo mentre era via, riportato nel gestionale al risveglio.
2) Digli come si comanda: si parla e basta. Un paio di esempi presi dal SUO mestiere, non generici.
3) Chiudi con una frase sola e senza retorica, e da qui in poi lavora normalmente: il giro è finito e ORION è operativo.`,
};

export const TAPPE_PRIMO_GIRO: TappaPrimoGiro[] = [SCRIVANIA, CLIENTI, REFERTO, SEGRETERIA, MANO, DOMATTINA];

// ─── LO STATO (nel database: sopravvive a riavvii e rilasci) ───────────────

export type StatoPrimoGiro = {
  indice: number;
  finito: boolean;
  /** Le tappe che ORION ha davvero consegnato (per quelle senza traccia nel DB). */
  provate: string[];
  /** Le tappe che l'utente ha scelto di saltare. */
  saltate: string[];
  /** L'utente ha chiuso il giro: non si ripropone più. */
  uscito?: boolean;
};

const VUOTO: StatoPrimoGiro = { indice: 0, finito: false, provate: [], saltate: [] };

export function statoPrimoGiro(): StatoPrimoGiro {
  try {
    const r = db().prepare("SELECT primo_giro FROM profili WHERE tenant_id = ?").get(T()) as
      | { primo_giro?: string | null }
      | undefined;
    if (!r?.primo_giro) return { ...VUOTO };
    return { ...VUOTO, ...(JSON.parse(r.primo_giro) as StatoPrimoGiro) };
  } catch {
    return { ...VUOTO };
  }
}

function salva(s: StatoPrimoGiro): void {
  try {
    db()
      .prepare(
        "INSERT INTO profili (tenant_id, primo_giro, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(tenant_id) DO UPDATE SET primo_giro = excluded.primo_giro, updated_at = excluded.updated_at"
      )
      .run(T(), JSON.stringify(s), new Date().toISOString());
  } catch {
    /* profilo assente: il giro riparte, nessun danno */
  }
}

/** Le tappe che valgono per QUESTO utente (il web non ha il computer da comandare). */
export function tappeValide(desktop: boolean): TappaPrimoGiro[] {
  return TAPPE_PRIMO_GIRO.filter((t) => desktop || !t.soloDesktop);
}

export function tappaCorrente(desktop: boolean): TappaPrimoGiro | null {
  const s = statoPrimoGiro();
  if (s.finito || s.uscito) return null;
  return tappeValide(desktop)[s.indice] ?? null;
}

/**
 * AVANTI. Una tappa si lascia SOLO se il suo risultato vero esiste, oppure se
 * l'utente ha scelto di saltarla. Così la barra non può mentire.
 */
export function avanza(desktop: boolean, opzioni: { saltando?: boolean } = {}): { tappa: TappaPrimoGiro | null; finito: boolean } {
  const s = statoPrimoGiro();
  const tappe = tappeValide(desktop);
  const ora = tappe[s.indice];
  if (ora && opzioni.saltando && !s.saltate.includes(ora.id)) s.saltate.push(ora.id);
  s.indice = Math.min(s.indice + 1, tappe.length);
  if (s.indice >= tappe.length) {
    s.finito = true;
    salva(s);
    return { tappa: null, finito: true };
  }
  salva(s);
  return { tappa: tappe[s.indice], finito: false };
}

/** ORION dichiara di aver consegnato una tappa senza traccia nel DB (il referto). */
export function segnaProvata(id: string): void {
  const s = statoPrimoGiro();
  if (!s.provate.includes(id)) s.provate.push(id);
  salva(s);
}

/** «Basta, lo faccio dopo»: il giro si chiude e non si ripropone. */
export function esciDalGiro(): void {
  salva({ ...statoPrimoGiro(), uscito: true, finito: true });
}

/** Il binario visibile: dove siamo, cosa manca. */
export function riepilogoPrimoGiro(desktop: boolean): {
  attivo: boolean;
  tappe: { id: string; titolo: string; icona: string; fatta: boolean; corrente: boolean; saltata: boolean }[];
} {
  const s = statoPrimoGiro();
  const tappe = tappeValide(desktop);
  return {
    attivo: !s.finito && !s.uscito,
    tappe: tappe.map((t, i) => ({
      id: t.id,
      titolo: t.titolo,
      icona: t.icona,
      fatta: i < s.indice && !s.saltate.includes(t.id),
      corrente: i === s.indice && !s.finito && !s.uscito,
      saltata: s.saltate.includes(t.id),
    })),
  };
}

// ─── IL PROMEMORIA DI CODA ─────────────────────────────────────────────────
// Va agganciato all'ULTIMO messaggio dell'utente, non nel prompt di sistema:
// è l'ultimo posto che il modello legge prima di rispondere.

export function promemoriaPrimoGiro(desktop: boolean): string {
  const s = statoPrimoGiro();
  if (s.finito || s.uscito) return "";
  const tappe = tappeValide(desktop);
  const t = tappe[s.indice];
  if (!t) return "";

  const fatta = risultatoVero(t.id);
  const quante = `tappa ${s.indice + 1} di ${tappe.length}`;

  return [
    `[Sistema · PRIMO GIRO — ${quante}] Sei nella tappa «${t.titolo}». Questo NON è un giro di prova: è il suo computer, i suoi clienti, il suo lavoro. Non c'è niente di finto e non devi far finta di niente.`,
    t.guida,
    fatta
      ? "STATO: il risultato di questa tappa C'È GIÀ. Non rifarla: dillo in mezza frase e chiama primo_giro azione='avanti' per passare alla prossima."
      : "STATO: il risultato di questa tappa NON c'è ancora. Portala a termine PRIMA di andare avanti — e non dire di averla fatta se non è successo.",
    "REGOLE DEL GIRO: mai più di DUE domande di fila; se ti serve sapere una cosa, DICHIARALA come la immagini e fatti correggere. Se l'utente chiede altro, FALLO SUBITO e poi riprendi da qui. Se dice «salta» o «dopo», chiama primo_giro azione='salta' senza discutere. Se dice «basta» o «lo faccio dopo», chiama primo_giro azione='esci' e lascialo lavorare in pace.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** «Vai avanti», detto in tutti i modi in cui lo dice una persona. */
export const VUOLE_AVANTI =
  /\b(avanti|prosegu\w*|vai\s*(pure|avanti)?|continua|passa\s+(pure\s+)?(alla|al)|prossim\w*|dopo\s+questo|ok\s*(dai|vai)?|fatto|ho\s+fatto|va\s+bene\s+vai)\b/i;

/** «Salta» / «questo dopo». */
export const VUOLE_SALTARE = /\b(salta\w*|salt(ala|alo)|lo\s+facciamo\s+dopo|questo\s+dopo|per\s+ora\s+no|non\s+adesso|passiamo\s+oltre)\b/i;

/** «Basta, lo faccio dopo» — il giro si chiude. */
export const VUOLE_USCIRE =
  /\b(basta|lascia\s+stare|non\s+mi\s+interessa|lo\s+faccio\s+dopo|chiudi\s+(il\s+)?tutorial|salta\s+tutto|voglio\s+lavorare)\b/i;
