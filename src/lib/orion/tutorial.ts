import { db } from "../db";
import { tenantIdCorrente } from "../tenant";
import { getProfilo, setRisponditore, creaPromemoria, aggiungiAttesa, creaDocumento, attivaPonteManuale } from "../data";
import { processaEmailInArrivo } from "../posta";

// ── IL TUTORIAL DELLA DEMO ───────────────────────────────────────────────────
// Nella demo il centro dello schermo è un PALCO: una presentazione animata che,
// tappa per tappa, spiega con parole semplici COS'È una funzione, PERCHÉ serve
// e COME provarla — prima che succeda qualcosa. ORION la accompagna a voce e
// apre i pannelli veri (come fa sempre) per farla toccare con mano.
//
// Il motore è semplice: lo stato vive in profili.tutorial (JSON); il contenuto
// del palco della tappa corrente viaggia nel riepilogo (il client lo disegna);
// la guida operativa della tappa vive nel system prompt; l'attrezzo `tutorial`
// fa avanzare il binario quando la tappa è stata vissuta.

export type Percorso = "professionista" | "azienda";

// Il contenuto del PALCO di una tappa: la presentazione animata al centro.
export type PalcoTappa = {
  sottotitolo: string; // il gancio, una riga
  cosa: string; // COS'È — parole semplici, cosa fa ORION
  perche: string; // PERCHÉ TI SERVE — il beneficio concreto
  prova: string; // PROVA TU — la frase esatta da dire/fare
};

export type TappaTutorial = {
  id: string;
  titolo: string; // breve, per il binario e il titolo del palco
  icona: string; // emoji del binario e del palco
  palco: PalcoTappa; // la presentazione animata al centro
  guida: string; // le istruzioni operative per ORION, SOLO per questa tappa
};

export type StatoTutorial = {
  percorso: Percorso | null; // null = Chiamata 0 ancora in corso
  indice: number; // tappa corrente (0-based)
  completate: string[];
  finito: boolean;
  feedback?: { piaciuto?: boolean; utile?: boolean };
};

// Ciò che serve al client: il binario + il PALCO della tappa corrente.
export type RiepilogoTutorial = {
  percorso: Percorso | null;
  indice: number;
  totale: number;
  finito: boolean;
  tappe: { id: string; titolo: string; icona: string; fatta: boolean; corrente: boolean }[];
  // Il palco della tappa viva (null durante la Chiamata 0 o a giro finito).
  palco: (PalcoTappa & { titolo: string; icona: string; numero: number; totale: number }) | null;
};

const T = () => tenantIdCorrente();

// ── LE TAPPE ─────────────────────────────────────────────────────────────────
// Per ogni tappa: il PALCO (cosa/perché/prova, che il client mostra animato) e
// la GUIDA (il copione operativo di ORION: quali pannelli aprire, cosa simulare).
// La guida NON deve leggere il palco a voce: il palco lo mostra già a schermo;
// ORION lo accompagna con calore e apre le cose vere.

const TAPPA_BENVENUTO: TappaTutorial = {
  id: "benvenuto",
  titolo: "La tua giornata",
  icona: "☀️",
  palco: {
    sottotitolo: "La tua giornata, già pronta appena apri",
    cosa: "Appena accendi il computer ti metto davanti cosa ti aspetta oggi: appuntamenti, cose da confermare, incassi in sospeso. Tutto in un colpo d'occhio.",
    perche: "Non perdi più tempo a ricostruire la giornata a mente. La trovi già sul piatto, come te la preparerebbe una segretaria arrivata un'ora prima di te.",
    prova: "Chiedimi «chi ho oggi?» oppure «apri l'agenda» — proprio come lo diresti a voce.",
  },
  guida: `SCOPO: fargli sentire cosa vuol dire trovare la giornata già pronta.
1) UNA frase calda di partenza: il giro è cominciato, al centro compaiono le spiegazioni tappa per tappa e a destra le tappe; può dire "avanti" o fermarsi quando vuole. Digli che gli ho preparato uno STUDIO DI PROVA su misura del suo mestiere (clienti e appuntamenti finti, tocca tutto senza rischi).
2) Chiama lo strumento briefing e RACCONTA a voce la giornata come fai sempre (appuntamenti, da confermare, sospesi) — NON leggere il palco, aggiungi il calore.
3) Invitalo a chiederti qualcosa a parole sue e rispondi.
4) Quando ha visto il briefing e ha fatto una domanda (o dice avanti): chiama tutorial azione tappa_completata.`,
};

const TAPPA_WHATSAPP: TappaTutorial = {
  id: "whatsapp",
  titolo: "Il cliente ti scrive",
  icona: "💬",
  palco: {
    sottotitolo: "Rispondo io ai clienti, anche mentre dormi",
    cosa: "Quando un cliente scrive su WhatsApp gli rispondo io: gli propongo gli orari liberi, sposto e prenoto da solo. Tu non muovi un dito.",
    perche: "Sono le undici di sera e un cliente vuole spostare? Ci penso io. La mattina trovi l'agenda già sistemata, e nessun cliente resta senza risposta.",
    prova: "Ti apro il telefono di una cliente: scrivi tu come farebbe lei — tipo «posso spostare domani?» — e guarda cosa rispondo.",
  },
  guida: `SCOPO: fargli vivere la segreteria H24 dal lato del CLIENTE — il momento "caspita, risponde davvero".
1) In due frasi: è sera, lui dorme, un cliente scrive. Qui il cliente lo fa LUI. Chiama tutorial azione apri_telefono: compare il telefono di Giulia Marchetti.
2) IMPORTANTISSIMO: le risposte al cliente NON le scrivi tu in chat — le fa la segreteria da sola, lui le vede sul telefono. Invitalo a chiedere di spostare/disdire/un orario libero.
3) Se disdice, digli DOPO cosa è successo dietro le quinte: il buco si è offerto DA SOLO alla lista d'attesa.
4) Fatto uno scambio (o "avanti"): tutorial azione tappa_completata.`,
};

const TAPPA_IMPREVISTO: TappaTutorial = {
  id: "imprevisto",
  titolo: "L'imprevisto",
  icona: "🌪️",
  palco: {
    sottotitolo: "Un imprevisto tuo? Riorganizzo tutto io",
    cosa: "Se salta fuori un impegno e non puoi esserci, me lo dici a voce e io sposto gli appuntamenti negli orari liberi, avvisando i clienti al posto tuo.",
    perche: "Basta telefonate a raffica per rimandare tutti. Una frase tua, e la giornata si ricompone da sola.",
    prova: "Dimmi «domattina non ci sono, ho un impegno» e guarda come sistemo l'agenda.",
  },
  guida: `SCOPO: mostrare che la segretaria lavora anche quando l'imprevisto è SUO.
1) Proponi la scena: "dimmi come lo diresti a una segretaria — tipo domattina non ci sono".
2) Quando te lo dice: AGISCI. Guarda l'agenda di domattina, sposta gli appuntamenti in orari liberi (agenda/sposta_appuntamento), racconta chi hai spostato e dove; i clienti riceverebbero l'avviso da soli (qui simulato: dillo).
3) Fai notare: lui UNA frase, tu hai riorganizzato tutto, zero click. Poi tutorial azione tappa_completata.`,
};

const TAPPA_GESTIONALE: TappaTutorial = {
  id: "gestionale",
  titolo: "Il tuo software",
  icona: "🖥️",
  palco: {
    sottotitolo: "Scrivo io nel programma che usi già",
    cosa: "Le modifiche nate qui — un appuntamento spostato, un cliente nuovo — le riporto io nel tuo gestionale: lo apro e ci scrivo dentro, davanti a te.",
    perche: "Non devi cambiare programma né imparare niente di nuovo: io lavoro nel TUO, qualunque sia. Tu guardi e basta.",
    prova: "Sta' a guardare lo schermo: ora riporto io nel tuo software le modifiche di prima.",
  },
  guida: `SCOPO: il pezzo da fantascienza — ORION che scrive DAVVERO nel software dell'utente.
CONTROLLA LA FONTE (profilo):
• Se USA un gestionale: le modifiche appena nate (disdetta di Giulia, spostamenti) le riporti TU nel SUO software. Attiva il Ponte se serve (attiva_scrittura_gestionale senza url), poi usa_computer con obiettivo autosufficiente: apri il software e riporta ESATTAMENTE quelle modifiche, una per una. Prima digli di guardare. A esito positivo: segna_consegne_fatte e digli che quelle voci di prova può cancellarle quando vuole.
• Se NON usa software (fonte ORION): spiega che ORION È il suo gestionale (agenda/clienti/archivio vivono qui) e mostra la coda Consegne (mostra_consegne): se un giorno adottasse un software, scriverei io lì con la Mano.
Poi: "non devi cambiare software, lavoro nel TUO" → tutorial azione tappa_completata.`,
};

const TAPPA_POSTA: TappaTutorial = {
  id: "posta",
  titolo: "La posta pensata",
  icona: "✉️",
  palco: {
    sottotitolo: "Ti disturbo solo per le mail che contano",
    cosa: "Leggo la tua posta e capisco cosa è importante — un cliente, una scadenza. Le newsletter e le promozioni le metto a tacere e te le conto soltanto.",
    perche: "Basta aprire cento mail per trovarne una che serve. Ti annuncio solo quelle vere; il resto sparisce dal tuo pensiero.",
    prova: "Ti faccio arrivare la posta di un mattino: guarda quale ti annuncio e quante ne silenzio.",
  },
  guida: `SCOPO: mostrare che la posta ha un cervello.
1) Chiama tutorial azione simula_posta (3 email: 1 che conta, 2 di rumore).
2) Spiega: l'email importante (un cliente) viene annunciata da sola tra poco; le newsletter le ho silenziate e contate — digli quante (mail_silenziate_oggi di messaggi_in_arrivo).
3) Se apre la mail, mostragli che può rispondere dettando, con le SUE parole (qui invio simulato: dillo). Poi tutorial azione tappa_completata.`,
};

const TAPPA_MEMORIA: TappaTutorial = {
  id: "memoria",
  titolo: "Ti conosce",
  icona: "🧠",
  palco: {
    sottotitolo: "Ti conosco come una segretaria di anni",
    cosa: "Mi ricordo le tue abitudini, le tue regole, come ti piace lavorare. E anche i tuoi impegni personali, non solo il lavoro.",
    perche: "Non devi ripetermi le cose ogni volta. Più lavoriamo insieme, più ti conosco — come una collega che ti sta accanto da sempre.",
    prova: "Dimmi una tua regola vera — tipo «il venerdì niente clienti nuovi» — e da ora vale per sempre.",
  },
  guida: `SCOPO: fargli toccare la memoria viva.
1) Richiama 2-3 cose vere che hai già imparato di lui (dalla Chiamata 0 e dal giro), con naturalezza.
2) Invitalo a dirti una sua abitudine/regola → salvala con impara, e digli che vale per sempre senza ripeterla.
3) Fagli provare un promemoria personale ("ricordami di pagare il bollo venerdì") → crea_promemoria: te lo riproporrò nel briefing. Poi tutorial azione tappa_completata.`,
};

const TAPPA_GIORNATA_PRONTA: TappaTutorial = {
  id: "giornata_pronta",
  titolo: "Tutto pronto",
  icona: "📂",
  palco: {
    sottotitolo: "Preparo tutto prima ancora che serva",
    cosa: "Per ogni appuntamento tiro fuori io i documenti e le note che ti servono, prima che tu li cerchi. E se vuoi, stampo.",
    perche: "Arrivi all'appuntamento e trovi già tutto aperto sullo schermo. Nessuna corsa a cercare la scheda del cliente all'ultimo secondo.",
    prova: "Prova a dirmi «stampami l'agenda di domani».",
  },
  guida: `SCOPO: l'anticipazione — preparare PRIMA che serva.
1) Guarda l'agenda di domani: c'è un appuntamento con documenti collegati (già pronti). APRI tu il documento (apri_documento) senza che lo chieda, spiegando la regola: quando nomina un impegno, ti porto davanti ciò che serve.
2) Fagli provare la stampa: "stampami l'agenda di domani" → stampa (se non ha stampante, l'anteprima vale come prova: dillo leggero). Poi tutorial azione tappa_completata.`,
};

const TAPPA_NOTTE: TappaTutorial = {
  id: "notte",
  titolo: "Mentre dormi",
  icona: "🌙",
  palco: {
    sottotitolo: "Il lavoro che faccio mentre il computer è spento",
    cosa: "Di notte continuo: rispondo ai clienti, sistemo l'agenda, metto in fila le modifiche. Al mattino ti racconto tutto e allineo il tuo gestionale.",
    perche: "Accendi il computer e trovi il lavoro già fatto. È la parte che nessun altro programma può darti: io vivo anche quando tu stacchi.",
    prova: "Questa te la racconto io: ascolta cosa succede nella notte.",
  },
  guida: `SCOPO: raccontare (non simulare) il film della notte — succede a computer SPENTO.
1) Digli che questa te la racconti. Il palco al centro mostra già i quadri: tu commenta a voce, con calore — un cliente scrive alle 22:41 e la segreteria sistema tutto; nella notte le modifiche si mettono in fila; al mattino il briefing della notte; poi allineo io il gestionale.
2) Chiudi: "accendi il computer e trovi il lavoro già fatto — questo è avere una segretaria". Poi tutorial azione tappa_completata.`,
};

const TAPPA_SU_MISURA: TappaTutorial = {
  id: "su_misura",
  titolo: "Su misura",
  icona: "🎨",
  palco: {
    sottotitolo: "Il tuo ORION, coi tuoi colori — e i tuoi guadagni",
    cosa: "Mi vesti come vuoi: dimmi un colore e cambio aspetto in diretta. E ogni mese ti dico, in euro, quanto ti ho fatto guadagnare.",
    perche: "Non sono un software freddo uguale per tutti: sono TUO. E ti dimostro col numero, nero su bianco, quanto vale avermi.",
    prova: "Dimmi un colore o uno stile — «mettimi verde smeraldo», «qualcosa di elegante».",
  },
  guida: `SCOPO: chiudere con due colpi — la bellezza e i soldi.
1) Fatti dire un colore/stile → personalizza_aspetto: l'onda di colore parte in diretta, battezza il tema e diglielo.
2) Poi in due frasi il report del valore: ogni mese quantifico in euro quanto ti ho portato (buchi riempiti, no-show evitati, prenotazioni). Qui numeri di prova, nella versione vera è il TUO. Poi tutorial azione tappa_completata.`,
};

const TAPPA_FINALE: TappaTutorial = {
  id: "finale",
  titolo: "Il verdetto",
  icona: "🏁",
  palco: {
    sottotitolo: "Ci siamo — dimmi com'è andata",
    cosa: "Il giro è finito. Ora dimmi con sincerità: ti è piaciuto? Ti è stato utile per capire come lavorerei per te?",
    perche: "Se ti ha convinto, la versione completa è lo stesso ORION — ma coi tuoi clienti veri, il tuo WhatsApp e la tua posta.",
    prova: "Rispondimi a voce o qui sotto: ti è piaciuto?",
  },
  guida: `SCOPO: chiudere da professionisti — feedback, grazie, strada per la versione completa.
1) Fai LE DUE DOMANDE una alla volta ("ti è piaciuto?", "ti è stato utile?") e registra con tutorial azione feedback (piaciuto/utile true|false).
2) Se positivo: ringrazia con calore, poi tutorial azione finale (si apre il sito) e digli che da lì si passa alla versione completa: stesso ORION, coi suoi dati veri.
3) Se qualcosa non l'ha convinto: chiedi COSA, ascolta, rispondi con onestà, ringrazia comunque e chiama lo stesso tutorial azione finale.
4) Ultima frase: la demo si rifà quando vuole, lo studio di prova sparisce da solo — nessun impegno, nessun dato suo in giro.`,
};

// Tappe extra del percorso AZIENDA.

const TAPPA_CODICE: TappaTutorial = {
  id: "codice",
  titolo: "Il codice azienda",
  icona: "🔑",
  palco: {
    sottotitolo: "Un codice, e tutto il team è dentro",
    cosa: "Alla tua azienda ho dato un codice. Ogni collaboratore scarica ORION, dice quel codice, e si ritrova dentro il tuo ambiente: stessi clienti, stessa agenda, ognuno col suo ruolo.",
    perche: "Tutta la squadra lavora sulla stessa memoria, senza passarsi file o ripetersi le cose. Io tengo insieme il filo tra le persone.",
    prova: "Guarda: ti mostro il codice della tua azienda di prova.",
  },
  guida: `SCOPO: capire come il team entra con UN codice.
1) Mostra il codice (mostra_profilo) e spiegalo semplice: ogni collaboratore scarica ORION, dice il codice, entra nell'ambiente col suo ruolo.
2) Onestà: per vederlo dal vivo servono DUE computer; nella versione completa è la prima cosa da fare col team. Qui glielo racconti e nelle prossime tappe vive la squadra con un collega di prova. Poi tutorial azione tappa_completata.`,
};

const TAPPA_SQUADRA: TappaTutorial = {
  id: "squadra",
  titolo: "La squadra",
  icona: "🤝",
  palco: {
    sottotitolo: "«Di' a Marco che…» e ci penso io",
    cosa: "Passo io i messaggi tra voi: li consegno a voce appena la persona apre ORION. E seguo i compiti che assegni, ricordandoti i ritardi.",
    perche: "Niente più «te l'avevo detto» o cose che si perdono. Ogni messaggio arriva, ogni compito ha qualcuno che lo segue: io.",
    prova: "Prova: «di' a Marco che domani la riunione è alle 9».",
  },
  guida: `SCOPO: la staffetta del team.
1) Nello studio c'è Marco (responsabile). Fagli provare: "di' a Marco che…" → lascia_messaggio: Marco lo sentirà a voce appena apre ORION.
2) Mostra l'organigramma (mostra_organico): conosco le PERSONE, non solo i ruoli.
3) Fagli assegnare un compito ("assegna a Marco …, aggiornami tra due giorni") → assegna_compito: seguo io l'avanzamento. Poi tutorial azione tappa_completata.`,
};

const TAPPA_APPROVAZIONI: TappaTutorial = {
  id: "approvazioni",
  titolo: "Il sì che viaggia",
  icona: "✅",
  palco: {
    sottotitolo: "Il sì del capo viaggia da solo",
    cosa: "Quando serve un ok — uno sconto, una spesa — la richiesta arriva a chi decide, e la risposta torna da sola a chi l'ha chiesta. Le cose riservate le vede solo chi dici tu.",
    perche: "Le decisioni non si incastrano più in mail e telefonate: viaggiano da sole, e tu decidi a voce in un secondo.",
    prova: "Ti mostro una richiesta di sconto: decidila a voce — «approvala» o «di' di no».",
  },
  guida: `SCOPO: il sì/no che viaggia tra i ruoli.
1) Scena in una frase: un collaboratore vuole uno sconto oltre soglia, serve l'ok del titolare (lui). Simula dal lato collaboratore: chiedi_approvazione ("sconto 15% a Bianchi — chiede Marco").
2) Lui è il titolare: fagliela decidere a voce → rispondi_approvazione; l'esito torna da solo a chi ha chiesto.
3) Ricorda le aree riservate (incassi/pagamenti/fatture li vede chi decide lui). Poi tutorial azione tappa_completata.`,
};

const TAPPA_GIORNALE: TappaTutorial = {
  id: "giornale",
  titolo: "Il giornale di bordo",
  icona: "📔",
  palco: {
    sottotitolo: "Cosa è successo oggi, senza chiederlo a nessuno",
    cosa: "Tengo il diario della giornata dell'azienda: messaggi, compiti, decisioni. E conservo il perché di ogni scelta, per sempre.",
    perche: "A fine giornata sai tutto in trenta secondi. E quando qualcuno lascia l'azienda, la sua esperienza resta — con me.",
    prova: "Chiedimi «cosa è successo oggi?».",
  },
  guida: `SCOPO: la memoria di gruppo.
1) Fagli chiedere "cosa è successo oggi?" → giornale_di_bordo: racconta i fatti salienti (i messaggi/compiti/approvazioni vissuti ci sono davvero).
2) Spiega il know-how: decisioni e procedure si conservano col loro PERCHÉ (impara) — resta anche quando una persona lascia. Poi tutorial azione tappa_completata.`,
};

// I due percorsi. Crescendo: la giornata servita → i pezzi da novanta (cliente,
// imprevisto, il SUO software) → testa e cuore (posta, memoria, anticipazione) →
// il racconto della notte → la bellezza → il finale.
const TAPPE: Record<Percorso, TappaTutorial[]> = {
  professionista: [
    TAPPA_BENVENUTO,
    TAPPA_WHATSAPP,
    TAPPA_IMPREVISTO,
    TAPPA_GESTIONALE,
    TAPPA_POSTA,
    TAPPA_MEMORIA,
    TAPPA_GIORNATA_PRONTA,
    TAPPA_NOTTE,
    TAPPA_SU_MISURA,
    TAPPA_FINALE,
  ],
  azienda: [
    TAPPA_BENVENUTO,
    TAPPA_CODICE,
    TAPPA_SQUADRA,
    TAPPA_APPROVAZIONI,
    TAPPA_WHATSAPP,
    TAPPA_GESTIONALE,
    TAPPA_POSTA,
    TAPPA_GIORNALE,
    TAPPA_NOTTE,
    TAPPA_SU_MISURA,
    TAPPA_FINALE,
  ],
};

export function tappeDi(percorso: Percorso): TappaTutorial[] {
  return TAPPE[percorso];
}

// ── STATO ────────────────────────────────────────────────────────────────────

const STATO_VUOTO: StatoTutorial = { percorso: null, indice: 0, completate: [], finito: false };

export function statoTutorial(): StatoTutorial {
  const r = db().prepare("SELECT tutorial FROM profili WHERE tenant_id = ?").get(T()) as
    | { tutorial?: string | null }
    | undefined;
  if (!r?.tutorial) return { ...STATO_VUOTO };
  try {
    return { ...STATO_VUOTO, ...(JSON.parse(r.tutorial) as StatoTutorial) };
  } catch {
    return { ...STATO_VUOTO };
  }
}

export function salvaStatoTutorial(s: StatoTutorial): void {
  db().prepare("UPDATE profili SET tutorial = ? WHERE tenant_id = ?").run(JSON.stringify(s), T());
}

export function tappaCorrente(s: StatoTutorial): TappaTutorial | null {
  if (!s.percorso || s.finito) return null;
  return TAPPE[s.percorso][s.indice] ?? null;
}

export function riepilogoTutorial(s: StatoTutorial = statoTutorial()): RiepilogoTutorial {
  const tappe = s.percorso ? TAPPE[s.percorso] : [];
  const corrente = tappaCorrente(s);
  return {
    percorso: s.percorso,
    indice: s.indice,
    totale: tappe.length,
    finito: s.finito,
    tappe: tappe.map((t, i) => ({
      id: t.id,
      titolo: t.titolo,
      icona: t.icona,
      fatta: s.finito || i < s.indice,
      corrente: !s.finito && i === s.indice,
    })),
    palco: corrente
      ? { ...corrente.palco, titolo: corrente.titolo, icona: corrente.icona, numero: s.indice + 1, totale: tappe.length }
      : null,
  };
}

// ── AVVIO E AVANZAMENTO ──────────────────────────────────────────────────────

// Sceglie il percorso da ciò che la Chiamata 0 ha scoperto e semina lo studio
// di prova. La PRESTAZIONE (come si chiama un appuntamento in quel mestiere) la
// decide ORION e la passa qui: nessuna lista di professioni: ORION si adatta a
// CHIUNQUE. Idempotente: se già avviato, restituisce lo stato com'è.
export function avviaTutorial(prestazione?: string, durataMin?: number): StatoTutorial {
  const attuale = statoTutorial();
  if (attuale.percorso) return attuale;
  const profilo = getProfilo();
  const azienda = db().prepare("SELECT tenant_id FROM aziende WHERE tenant_id = ?").get(T());
  const percorso: Percorso = azienda || profilo.tipo_lavoro === "azienda" ? "azienda" : "professionista";
  const nome = (prestazione ?? "").trim() || "Appuntamento";
  const durata = durataMin && durataMin >= 10 && durataMin <= 240 ? durataMin : 45;
  seminaStudioDiProva(percorso, { nome, durataMin: durata });
  // Se alla Chiamata 0 è nato un gestionale, il Ponte si accende DA SOLO: così
  // ogni modifica viva del giro (la disdetta di Giulia, l'imprevisto…) si
  // accoda per il suo software e la tappa della Mano ha materiale VERO.
  try {
    const conn = db()
      .prepare("SELECT id, webhook_uscita FROM connessioni WHERE tenant_id = ? AND attivo = 1 LIMIT 1")
      .get(T()) as { id: number; webhook_uscita: string | null } | undefined;
    if (conn && !conn.webhook_uscita) attivaPonteManuale(conn.id);
  } catch {
    /* senza gestionale il giro vive comunque */
  }
  const s: StatoTutorial = { percorso, indice: 0, completate: [], finito: false };
  salvaStatoTutorial(s);
  return s;
}

export function avanzaTutorial(): StatoTutorial {
  const s = statoTutorial();
  const corrente = tappaCorrente(s);
  if (!corrente) return s;
  s.completate = [...s.completate.filter((id) => id !== corrente.id), corrente.id];
  s.indice += 1;
  if (!s.percorso || s.indice >= TAPPE[s.percorso].length) s.finito = true;
  salvaStatoTutorial(s);
  // La tappa APPENA diventata corrente può avere bisogno di scenografia.
  const nuova = tappaCorrente(s);
  if (nuova) allestisciTappa(nuova.id);
  return s;
}

export function salvaFeedbackTutorial(f: { piaciuto?: boolean; utile?: boolean }): StatoTutorial {
  const s = statoTutorial();
  s.feedback = { ...s.feedback, ...f };
  salvaStatoTutorial(s);
  return s;
}

// ── SCENOGRAFIA ──────────────────────────────────────────────────────────────

// Preparativi che una tappa richiede nel MOMENTO in cui diventa corrente.
function allestisciTappa(id: string): void {
  if (id === "whatsapp") {
    // Il telefono del cliente funziona al massimo: autopilota acceso.
    try {
      setRisponditore("autopilota");
    } catch {
      /* la tappa vive comunque, in assistita */
    }
  }
}

// La posta del mattino: 1 email che conta + 2 di rumore. Passa dalla STESSA
// pipeline vera (classificatore + digest): l'app annuncerà da sola quella
// importante al prossimo giro di sondaggio.
export function simulaPostaDemo(): { importanti: number; silenziate: number } {
  const base = Date.now() % 100000;
  processaEmailInArrivo({
    uid: 900001 + base,
    daNome: "Giulia Marchetti",
    daIndirizzo: "giulia.marchetti@esempio.it",
    oggetto: "Domanda sul prossimo appuntamento",
    data: new Date().toISOString(),
    corpo: "Buongiorno, avrei una domanda sul nostro prossimo appuntamento: è possibile anticipare di mezz'ora? Grazie mille, Giulia",
    bulk: false,
  });
  processaEmailInArrivo({
    uid: 900002 + base,
    daNome: "SuperOfferte Store",
    daIndirizzo: "news@superofferte-store.it",
    oggetto: "SOLO OGGI: sconto 70% su tutto! Non perdere l'occasione",
    data: new Date().toISOString(),
    corpo: "Promozione imperdibile! Clicca qui per lo sconto. Per disiscriverti clicca qui.",
    bulk: true,
  });
  processaEmailInArrivo({
    uid: 900003 + base,
    daNome: "Newsletter Tendenze",
    daIndirizzo: "newsletter@tendenze-digitali.it",
    oggetto: "Le 10 tendenze della settimana che devi conoscere",
    data: new Date().toISOString(),
    corpo: "Ecco la newsletter della settimana con tutte le novità. Unsubscribe in fondo.",
    bulk: true,
  });
  return { importanti: 1, silenziate: 2 };
}

// ── LO STUDIO DI PROVA ───────────────────────────────────────────────────────

// I clienti del finto studio. Giulia Marchetti è LA protagonista: è lei che
// "scrive" dal telefono finto, la sua email è quella importante della posta.
const CLIENTI_DEMO: { nome: string; telefono: string; email: string | null }[] = [
  { nome: "Giulia Marchetti", telefono: "+393901000001", email: "giulia.marchetti@esempio.it" },
  { nome: "Andrea Colombo", telefono: "+393901000002", email: "andrea.colombo@esempio.it" },
  { nome: "Elena Ricci", telefono: "+393901000003", email: null },
  { nome: "Paolo Fontana", telefono: "+393901000004", email: null },
  { nome: "Martina Greco", telefono: "+393901000005", email: null },
];

// Inserimenti DIRETTI (niente eventi d'uscita): lo studio di prova rappresenta
// il mondo "già esistente" — le consegne per il gestionale devono nascere solo
// dalle azioni VIVE del tutorial (la disdetta di Giulia, l'imprevisto…).
function inserisciCliente(c: { nome: string; telefono: string; email: string | null }): number {
  const r = db()
    .prepare("INSERT INTO clienti (tenant_id, nome, telefono, email, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(T(), c.nome, c.telefono, c.email, new Date().toISOString());
  return Number(r.lastInsertRowid);
}

// L'agenda di ORION vive in ora ITALIANA "naive" ("YYYY-MM-DDTHH:MM"): i
// pannelli mostrano la stringa così com'è. Il server però può vivere in un
// ALTRO fuso (Railway = UTC): la semina deve ragionare in Europe/Rome, mai
// nell'ora locale della macchina — sennò «le 10» diventano «le 18 per tutti».
function isoLocale(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
    .format(d)
    .replace(" ", "T");
}

// L'ora corrente in Italia (0-23), qualunque sia il fuso del server.
function oraItaliana(): number {
  return Number(new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "numeric", hourCycle: "h23" }).format(new Date()));
}

function inserisciAppuntamento(a: { cliente_id: number; titolo: string; inizio: Date; durataMin: number; stato: string; note?: string | null }): void {
  const fine = new Date(a.inizio.getTime() + a.durataMin * 60_000);
  db()
    .prepare(
      "INSERT INTO appuntamenti (tenant_id, cliente_id, titolo, inizio, fine, stato, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(T(), a.cliente_id, a.titolo, isoLocale(a.inizio), isoLocale(fine), a.stato, a.note ?? null, new Date().toISOString());
}

// Il momento (assoluto) che in ITALIA corrisponde a "tra N giorni alle H:00":
// aritmetica sui minuti a partire dall'ora italiana corrente, così il fuso
// del server non conta nulla.
function dataRoma(giorniAvanti: number, ora: number): Date {
  const parti = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(new Date());
  const h = Number(parti.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parti.find((p) => p.type === "minute")?.value ?? 0);
  const deltaMin = giorniAvanti * 24 * 60 + ora * 60 - (h * 60 + m);
  return new Date(Date.now() + deltaMin * 60_000);
}

// Un orario "di studio" nel futuro prossimo (in ora ITALIANA): oggi se c'è
// ancora giornata, altrimenti scala a domattina.
function prossimaOra(oraBase: number, giorniAvanti: number): Date {
  let d = dataRoma(giorniAvanti, oraBase);
  if (giorniAvanti === 0 && d.getTime() < Date.now() + 30 * 60_000) {
    const prossima = oraItaliana() + 1;
    d = prossima >= 19 ? dataRoma(1, 9) : dataRoma(0, prossima);
  }
  return d;
}

export function seminaStudioDiProva(percorso: Percorso, prest: { nome: string; durataMin: number }): void {
  const ids = CLIENTI_DEMO.map(inserisciCliente);
  const [giulia, andrea, elena, paolo, martina] = ids;

  // La giornata "viva": piena il giusto, con una cosa da confermare, in ORARI
  // DISTINTI. Se in Italia la giornata di studio è quasi finita (dalle 14 in
  // poi), il trio va a DOMANI — mai tre appuntamenti ammassati alla stessa ora.
  const hRoma = oraItaliana();
  const oggiVivo = hRoma < 14;
  const base = Math.max(10, hRoma + 1);
  const trio: [number, number][] = oggiVivo
    ? [[0, base], [0, base + 2], [0, base + 4]]
    : [[1, 10], [1, 15], [1, 17]];
  inserisciAppuntamento({ cliente_id: andrea, titolo: `${prest.nome} — Andrea Colombo`, inizio: dataRoma(...trio[0]), durataMin: prest.durataMin, stato: "confermato" });
  inserisciAppuntamento({ cliente_id: elena, titolo: `${prest.nome} — Elena Ricci`, inizio: dataRoma(...trio[1]), durataMin: prest.durataMin, stato: "confermato" });
  inserisciAppuntamento({ cliente_id: paolo, titolo: `${prest.nome} — Paolo Fontana`, inizio: dataRoma(...trio[2]), durataMin: prest.durataMin, stato: "da_confermare" });

  // Domani: Giulia (la protagonista del telefono) al mattino, con documenti
  // pronti; Martina a metà mattina (carburante per l'imprevisto).
  inserisciAppuntamento({ cliente_id: giulia, titolo: `${prest.nome} — Giulia Marchetti`, inizio: prossimaOra(9, 1), durataMin: prest.durataMin, stato: "confermato", note: "Preparare i documenti" });
  inserisciAppuntamento({ cliente_id: martina, titolo: `${prest.nome} — Martina Greco`, inizio: prossimaOra(11, 1), durataMin: prest.durataMin, stato: "confermato" });
  // Dopodomani: respiro.
  inserisciAppuntamento({ cliente_id: andrea, titolo: `${prest.nome} — Andrea Colombo`, inizio: prossimaOra(10, 2), durataMin: prest.durataMin, stato: "confermato" });

  // I documenti dell'appuntamento di domani (l'anticipazione della tappa "Tutto pronto").
  creaDocumento({
    cliente_id: giulia,
    titolo: "Scheda di Giulia Marchetti",
    tipo: "scheda",
    testo: `Scheda cliente — Giulia Marchetti\nStorico: cliente dal 2024, sempre puntuale.\nNote per il prossimo appuntamento (${prest.nome.toLowerCase()}): riprendere da dove eravamo rimasti; verificare le preferenze aggiornate.\nDa portare: nulla, è tutto in archivio.`,
  });
  creaDocumento({
    cliente_id: giulia,
    titolo: "Appunti ultimo incontro — Giulia Marchetti",
    tipo: "nota",
    testo: "Ultimo incontro: tutto regolare. Aveva chiesto, se possibile, orari al mattino presto. Ricordarle la promozione di stagione.",
  });

  // Un pagamento in sospeso (dà sostanza al briefing) e la lista d'attesa
  // piena: è la benzina del riempi-buchi quando Giulia disdice.
  registraPagamentoDemo(paolo, 80);
  aggiungiAttesa({ cliente_id: elena, nome: "Elena Ricci", motivo: "Prima disponibilità", priorita: "alta" });
  aggiungiAttesa({ cliente_id: martina, nome: "Martina Greco", motivo: "Preferisce il mattino" });

  // Un promemoria di lavoro già in essere.
  creaPromemoria({ cliente_id: paolo, testo: "Richiamare Paolo Fontana per il saldo", categoria: "richiamo" });

  // Percorso azienda: la squadra di prova (Marco è il co-protagonista).
  if (percorso === "azienda") {
    const ora = new Date().toISOString();
    const inserisci = db().prepare(
      "INSERT INTO organico (tenant_id, nome, ruolo, reparto, responsabilita, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    inserisci.run(T(), "Marco Bellini", "responsabile", "operativo", "Segue i preventivi e i clienti nuovi; va avvisato per urgenze operative", ora, ora);
    inserisci.run(T(), "Laura Conti", "amministrativo", "amministrazione", "Fatture, pagamenti e documenti", ora, ora);
  }
}

function registraPagamentoDemo(clienteId: number, importo: number): void {
  db()
    .prepare(
      "INSERT INTO pagamenti (tenant_id, cliente_id, importo, metodo, stato, data, descrizione, created_at) VALUES (?, ?, ?, 'contanti', 'in_sospeso', ?, 'Saldo prestazione', ?)"
    )
    .run(T(), clienteId, importo, new Date().toISOString().slice(0, 10), new Date().toISOString());
}

// ── IL BLOCCO DI SYSTEM PROMPT ───────────────────────────────────────────────

// Le regole del tutor: stabili per tutta la demo (la tappa cambia, queste no).
const REGOLE_TUTOR = `REGOLE DEL TUTOR (valgono per tutto il giro guidato)
- IL PALCO FA LA SPIEGAZIONE: al centro dello schermo compare da solo, per ogni tappa, un riquadro animato che spiega COS'È la funzione, PERCHÉ serve e COME provarla. NON leggerlo a voce parola per parola: tu lo ACCOMPAGNI con calore, aggiungi il tocco umano, e soprattutto AGISCI (apri i pannelli veri, fai succedere le cose).
- Parole SEMPLICI, zero tecnicismi (mai "webhook", "API", "tool" — di' "si collega", "lo faccio io"). UNA cosa alla volta, frasi brevi, il tono di una collega in gamba il primo giorno.
- Ritmo della tappa: 1) una frase che introduce (il palco ha già i dettagli), 2) AGISCI/mostra col pannello vero, 3) invita a provare ciò che dice il palco, 4) quando ha provato (o dice "avanti") chiama tutorial azione tappa_completata. Il binario a destra avanza da solo.
- I PANNELLI restano quelli di sempre: aprili come fai normalmente (briefing, agenda, telefono…). Il palco è in più, non li sostituisce.
- Segui la GUIDA DELLA TAPPA corrente. Non anticipare le altre tappe; se chiede cose di un'altra tappa, riportalo con leggerezza al filo.
- L'utente comanda: "avanti" = tappa_completata; "salta questa" = idem; "aspetta/fermati" = fermati e rispondi.
- ONESTÀ DEMO: WhatsApp, email e avvisi qui sono SIMULATI (studio di prova) — dillo con naturalezza quando serve; mai fingere un invio vero.
- Niente P.IVA, carta o collegamenti reali nella demo: se li chiede, spiega che vivono nella versione completa.
- ANTI-STALLO: ogni tuo turno fa SEMPRE la mossa successiva. MAI un cenno secco ("Bene", "Grazie") e fermarti: il giro non si ferma mai da solo.
- Obiettivo emotivo: deve pensare "questa è la segretaria che non ho mai potuto permettermi". Ogni tappa un momento così.`;

// Il blocco da iniettare nel system prompt (parte VOLATILE), per gli account demo.
export function bloccoTutorialSystem(onboardingCompleto: boolean): string {
  const s = statoTutorial();

  if (!s.percorso) {
    if (onboardingCompleto) {
      // Caso raro: onboarding chiuso ma tutorial mai avviato (es. riavvio) → avvia.
      return `\n\n═══ ORION DEMO ═══\nQuesto è un account DEMO. L'onboarding è completo ma il giro guidato non è ancora partito: chiama SUBITO lo strumento tutorial con azione "avvia" e comincia dalla prima tappa.\n${REGOLE_TUTOR}`;
    }
    return `\n\n═══ ORION DEMO — CHIAMATA 0 ═══\nQuesto è un account DEMO (l'app "ORION Demo"): l'utente sta assaggiando ORION prima di sceglierlo. Al centro dello schermo c'è già la PRESENTAZIONE d'apertura (cosa fai per lui): tu conduci la Chiamata 0 COME SEMPRE, con QUESTI adattamenti:
- Colloquio SNELLO: punta a 5-6 domande. SALTA i dati fiscali (P.IVA, regime, indirizzo) e NON proporre import o collegamenti reali.
- La domanda sul software gestionale è L'ULTIMA: se ne usa uno, registralo (collega_sistema, con COME si apre) e imposta la fonte (imposta_fonte_dati); se no, fonte='orion'. Se dice «Google Calendar»: fonte='orion' e digli leggero che nella versione completa mi ci collego in due minuti — nella demo lo studio di prova basta.
- APPENA hai la risposta sul software, NELLO STESSO TURNO e senza altre domande: salva tutto, onboarding_completo=1, e chiama tutorial azione "avvia" passando anche 'prestazione' = come si chiama un appuntamento nel SUO mestiere (tu lo sai: es. avvocato→"Udienza"/"Consulenza", nutrizionista→"Visita", parrucchiere→"Appuntamento", consulente→"Sessione", idraulico→"Sopralluogo"…) e 'durata_min' sensata. Poi parti con la prima tappa. Un «Grazie.» che si ferma lì è un ERRORE GRAVE: il giro parte SUBITO.
- ANTI-STALLO (assoluta): OGNI turno fa la mossa successiva (la prossima domanda, o la chiusura+avvio). Mai un cenno secco e stop.
- Se la conversazione è GIÀ iniziata e arriva una nuova direttiva d'avvio: NON ripresentarti, riprendi dall'ultima domanda aperta.
${REGOLE_TUTOR}`;
  }

  if (s.finito) {
    return `\n\n═══ ORION DEMO — GIRO COMPLETATO ═══\nIl tutorial è finito. Continua a essere ORION al completo nello studio di prova: rispondi e agisci normalmente. Se l'utente mostra interesse, ricordagli con leggerezza che la versione completa è su orionvision.it. Ricorda l'ONESTÀ DEMO: invii simulati, studio di prova.`;
  }

  const tappe = TAPPE[s.percorso];
  const tappa = tappe[s.indice];
  return `\n\n═══ ORION DEMO — TUTORIAL IN CORSO ═══\nPercorso: ${s.percorso.toUpperCase()} — Tappa ${s.indice + 1} di ${tappe.length}: «${tappa.titolo}» ${tappa.icona}\nIl PALCO al centro sta già mostrando la spiegazione di questa tappa (cos'è / perché / prova tu): NON leggerlo, accompagnalo e AGISCI.\n\nGUIDA DELLA TAPPA (il tuo copione operativo):\n${tappa.guida}\n\nSE QUESTA È UNA NUOVA SESSIONE (direttiva d'avvio): niente briefing di routine — bentornato in una frase e riprendi dalla tappa corrente.\n\n${REGOLE_TUTOR}`;
}
