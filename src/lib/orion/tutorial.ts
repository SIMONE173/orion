import { db } from "../db";
import { tenantIdCorrente } from "../tenant";
import { getProfilo, setRisponditore, creaPromemoria, aggiungiAttesa, creaDocumento, attivaPonteManuale } from "../data";
import { processaEmailInArrivo } from "../posta";

// ── IL TUTORIAL DELLA DEMO ───────────────────────────────────────────────────
// Nella demo ORION non viene "spiegato": viene VISSUTO. Dopo la Chiamata 0
// (identica a quella vera) ORION stesso fa da guida: un binario di tappe
// visibile a lato, e a ogni tappa lui parla, AGISCE, fa provare, e chiude con
// una presentazione animata che fissa il punto. Due percorsi — professionista
// e azienda — scelti in automatico da ciò che l'utente ha raccontato.
//
// Il motore è volutamente semplice: lo stato vive in profili.tutorial (JSON),
// la guida della SOLA tappa corrente viene iniettata nel system prompt, e
// l'attrezzo `tutorial` fa avanzare il binario quando la tappa è stata vissuta.

export type Percorso = "professionista" | "azienda";

export type TappaTutorial = {
  id: string;
  titolo: string; // breve, per il binario
  icona: string; // emoji del binario
  guida: string; // le istruzioni operative per ORION, SOLO per questa tappa
};

export type StatoTutorial = {
  percorso: Percorso | null; // null = Chiamata 0 ancora in corso
  indice: number; // tappa corrente (0-based)
  completate: string[];
  finito: boolean;
  feedback?: { piaciuto?: boolean; utile?: boolean };
};

// Ciò che serve al client per disegnare il binario.
export type RiepilogoTutorial = {
  percorso: Percorso | null;
  indice: number;
  totale: number;
  finito: boolean;
  tappe: { id: string; titolo: string; icona: string; fatta: boolean; corrente: boolean }[];
};

const T = () => tenantIdCorrente();

// ── LE TAPPE ─────────────────────────────────────────────────────────────────
// Regole di scrittura delle guide: dicono a ORION COSA far vivere, con quali
// strumenti, cosa far FARE all'utente, e quando chiamare tappa_completata.
// Il tono ("parole semplici, calore, agisci tu") sta nelle REGOLE DEL TUTOR
// nel system prompt: qui solo la sostanza della tappa.

const TAPPA_BENVENUTO: TappaTutorial = {
  id: "benvenuto",
  titolo: "La tua giornata",
  icona: "☀️",
  guida: `SCOPO: fargli sentire in 30 secondi cosa vuol dire avere una segretaria che gli mette la giornata sul piatto.
1) Digli in UNA frase che il giro guidato è partito: alla sua destra c'è il binario delle tappe, vi muovete insieme, lui può dire "avanti" o fermarsi quando vuole.
2) Spiega che gli hai preparato uno STUDIO DI PROVA su misura del suo mestiere (clienti e appuntamenti finti, così tocca tutto senza rischi).
3) Chiama lo strumento briefing e raccontagli la giornata a voce come fai sempre: appuntamenti, cose da confermare, pagamenti in sospeso.
4) Invitalo a chiederti QUALSIASI cosa sulla giornata a parole sue ("chi ho oggi pomeriggio?", "apri l'agenda") e rispondi.
5) Quando ha visto il briefing e ha fatto almeno una domanda (o dice di andare avanti): apri una presentazione (strumento presentazione) con 3 punti su ciò che ha appena vissuto, poi chiama tutorial azione tappa_completata.`,
};

const TAPPA_WHATSAPP: TappaTutorial = {
  id: "whatsapp",
  titolo: "Il cliente ti scrive",
  icona: "💬",
  guida: `SCOPO: fargli vivere la segreteria H24 dal lato del CLIENTE — il momento "caspita, risponde davvero".
1) Racconta la scena in due frasi: sono le undici di sera, lui sta dormendo, e un cliente scrive su WhatsApp. Nella demo il cliente lo fa LUI: digli che gli apri il telefono di Giulia Marchetti (una sua cliente di prova) e che scriva come scriverebbe un cliente vero.
2) Chiama tutorial azione apri_telefono: compare il telefono finto col WhatsApp dello studio. IMPORTANTissimo: le risposte NON le scrivi tu in chat — le fa la segreteria automatica da sola, lui le vedrà comparire sul telefono.
3) Suggeriscigli di provare sul serio: chiedere di spostare l'appuntamento, disdire, chiedere un orario libero. Se disdice, digli DOPO cosa è successo dietro le quinte: il buco si è offerto DA SOLO alla lista d'attesa (riempi-buchi).
4) Ricorda (se te lo chiede): quella segreteria vive sul server — funziona anche a computer SPENTO, e ha tre livelli (spenta / assistita / autopilota). Nella demo è già in autopilota.
5) Quando ha fatto almeno uno scambio vero col telefono: presentazione con i punti (risponde lei H24 · autopilota che sposta e prenota davvero · buchi riempiti da soli), poi tappa_completata.`,
};

const TAPPA_IMPREVISTO: TappaTutorial = {
  id: "imprevisto",
  titolo: "L'imprevisto",
  icona: "🌪️",
  guida: `SCOPO: fargli capire che la segretaria lavora anche quando l'imprevisto è SUO, non del cliente.
1) Proponigli la scena: "domattina non puoi esserci — dimmelo come lo diresti a una segretaria vera" (es. "domattina non ci sono, ho un impegno").
2) Quando te lo dice: AGISCI. Guarda l'agenda di domattina, sposta tu gli appuntamenti in orari liberi (strumenti agenda/sposta_appuntamento), e racconta cosa hai fatto: chi hai spostato, dove, e che i clienti riceverebbero l'avviso WhatsApp da solo (nella demo l'invio è simulato: dillo con onestà).
3) Fagli notare la differenza: lui ha detto UNA frase, tu hai riorganizzato tutto — nessun menu, nessun click.
4) Presentazione (una frase = agenda sistemata · avvisi ai clienti da soli · zero click), poi tappa_completata.`,
};

const TAPPA_GESTIONALE: TappaTutorial = {
  id: "gestionale",
  titolo: "Il tuo software",
  icona: "🖥️",
  guida: `SCOPO: il pezzo da fantascienza — ORION che scrive DAVVERO nel software che lui usa ogni giorno.
CONTROLLA LA FONTE DATI (profilo):
• Se alla Chiamata 0 ha detto che USA un gestionale/software: digli che le modifiche appena nate (la disdetta di Giulia, gli spostamenti dell'imprevisto) ora gliele riporti TU nel SUO software, davanti ai suoi occhi. Attiva il Ponte se serve (attiva_scrittura_gestionale senza url), poi usa la Mano (usa_computer) con obiettivo autosufficiente: apri il suo software e riporta ESATTAMENTE quelle modifiche, una per una. Prima di partire digli di guardare lo schermo. A esito positivo: spunta le consegne (segna_consegne_fatte) e digli che quelle voci di prova può cancellarle dal suo software quando vuole (o glielo farai fare a te).
• Se NON usa software (fonte ORION): spiegagli che allora ORION È il suo gestionale — agenda, clienti e archivio vivono qui — e mostra la coda Consegne (mostra_consegne) spiegando che se un giorno ne adottasse uno, ORION scriverebbe lì dentro al posto suo, con la Mano.
2) Sottolinea la frase chiave: "non devi cambiare software: io lavoro nel TUO".
3) Presentazione (scrive nel tuo software · qualsiasi gestionale, anche senza collegamenti · tu guardi e basta), poi tappa_completata.`,
};

const TAPPA_POSTA: TappaTutorial = {
  id: "posta",
  titolo: "La posta pensata",
  icona: "✉️",
  guida: `SCOPO: fargli vedere che la posta ha un cervello — ti disturba solo per ciò che conta.
1) Annuncia che gli fai arrivare la posta di un mattino qualsiasi: chiama tutorial azione simula_posta (arrivano 3 email: una che conta e due di rumore).
2) Spiega cosa sta succedendo: l'email IMPORTANTE (un cliente) viene annunciata a voce dall'app da sola tra pochi istanti; le newsletter/promozioni sono state silenziate e CONTATE nel digest — digli quante ne ha tolte di torno oggi (campo mail_silenziate_oggi di messaggi_in_arrivo).
3) Se apre la mail (a voce o dalla scheda), mostragli che può rispondere dettando: la risposta parte con le SUE parole (nella demo l'invio è simulato: dillo).
4) Presentazione (solo le mail che contano · spam contato e silenziato · rispondi a voce), poi tappa_completata.`,
};

const TAPPA_MEMORIA: TappaTutorial = {
  id: "memoria",
  titolo: "Ti conosce",
  icona: "🧠",
  guida: `SCOPO: fargli toccare la memoria viva — la differenza tra un software e una collega che lo conosce.
1) Digli cosa hai già imparato di lui SOLO parlando (dalla Chiamata 0 e dal giro fatto insieme): richiama 2-3 cose vere dal profilo/memoria, con naturalezza.
2) Invitalo a dirti UNA sua abitudine o regola vera ("il venerdì niente appuntamenti", "le prime visite sempre al mattino"): salvala con impara e digli che da oggi vale per sempre, senza doverla ripetere.
3) Fagli provare anche un promemoria personale, fuori dal lavoro ("ricordami di pagare il bollo venerdì") → crea_promemoria: spiega che glielo riproporrai nel briefing del mattino. La segretaria protegge anche la vita, non solo lo studio.
4) Presentazione (impara come lavori · ricorda per sempre · protegge anche il fuori-orario), poi tappa_completata.`,
};

const TAPPA_GIORNATA_PRONTA: TappaTutorial = {
  id: "giornata_pronta",
  titolo: "Tutto pronto",
  icona: "📂",
  guida: `SCOPO: l'anticipazione — la segretaria che prepara PRIMA che serva.
1) Guarda l'agenda di domani: c'è un appuntamento con documenti collegati (li ho preparati io nello studio di prova). Digli che per quell'impegno è già tutto pronto e APRI tu il documento collegato (apri_documento), senza che lo chieda.
2) Spiega in una frase la regola: quando nomina un impegno, tu porti in primo piano ciò che serve — documenti, note, scadenze.
3) Fagli provare la stampa vera: proponigli "stampami l'agenda di domani" → strumento stampa. Il foglio esce dalla SUA stampante. (Se non ha una stampante collegata, l'anteprima di stampa che si apre vale come prova: dillo con leggerezza.)
4) Presentazione (documenti già aperti · l'agenda in mano · la stampante è mia), poi tappa_completata.`,
};

const TAPPA_NOTTE: TappaTutorial = {
  id: "notte",
  titolo: "Mentre dormi",
  icona: "🌙",
  guida: `SCOPO: raccontare (non simulare) il film della notte: è la tappa-racconto, la presentazione è la protagonista.
1) Digli che quest'ultima cosa non gliela fai provare: gliela racconti, perché succede quando il computer è SPENTO.
2) Apri SUBITO una presentazione in 4 quadri, e commentala a voce quadro per quadro:
   • «22:41 — un cliente scrive»: la segreteria risponde e sistema l'agenda da sola;
   • «Nella notte»: ogni modifica si mette in fila, firmata, in attesa del gestionale;
   • «Il mattino»: al primo caffè ti faccio il briefing della notte;
   • «La Mano»: e allineo io il tuo software, mentre guardi.
3) Chiudi con la frase: "tu accendi il computer e trovi il lavoro già fatto: questo è avere una segretaria."
4) Poi tappa_completata.`,
};

const TAPPA_SU_MISURA: TappaTutorial = {
  id: "su_misura",
  titolo: "Su misura",
  icona: "🎨",
  guida: `SCOPO: chiudere il giro con due colpi che restano in testa: la bellezza e i soldi.
1) Digli che ORION è SUO anche nell'aspetto: si faccia dire un colore o uno stile ("mettimi blu elettrico", "qualcosa di elegante") → personalizza_aspetto: l'onda di colore parte in diretta. Battezza il tema con un nome e diglielo.
2) Poi il colpo dei soldi: spiega in due frasi il report del valore — ogni mese ORION quantifica in euro quanto gli ha portato (buchi riempiti, no-show evitati, prenotazioni fatte da sola). Nella demo i numeri sono di prova, ma nella versione vera quel numero è SUO.
3) Presentazione (il tuo ORION, i tuoi colori · ogni mese ti dice quanto ti ha fatto guadagnare), poi tappa_completata.`,
};

const TAPPA_FINALE: TappaTutorial = {
  id: "finale",
  titolo: "Il verdetto",
  icona: "🏁",
  guida: `SCOPO: chiudere da professionisti — feedback, ringraziamento, e la strada per la versione completa.
1) Digli che il giro è finito e fagli LE DUE DOMANDE, una per volta, a voce: "Ti è piaciuto?" e "Ti è stato utile per capire come lavorerei per te?". Registra le risposte con tutorial azione feedback (piaciuto/utile true o false in base a ciò che dice).
2) Se le risposte sono positive: ringrazialo con calore e senza esagerare, poi chiama tutorial azione finale — si apre il sito di ORION nel suo browser — e digli che quando vuole, da lì, si passa alla versione completa: stesso ORION, ma coi SUOI clienti veri, il suo numero WhatsApp e la sua posta.
3) Se qualcosa non l'ha convinto: chiedigli COSA, ascolta, rispondi con onestà (senza promettere ciò che non c'è), ringrazia comunque e chiama lo stesso tutorial azione finale.
4) Ultima frase, sempre: la demo si può rifare quando vuole, e lo studio di prova sparisce da solo — nessun impegno, nessun dato suo in giro.`,
};

// Tappe extra del percorso AZIENDA.

const TAPPA_CODICE: TappaTutorial = {
  id: "codice",
  titolo: "Il codice azienda",
  icona: "🔑",
  guida: `SCOPO: fargli capire come il suo team entra nello stesso ambiente con UN codice.
1) Alla Chiamata 0 è nato il CODICE AZIENDALE (lo trovi nel profilo azienda): mostraglielo (mostra_profilo) e spiegalo in parole semplici: ogni collaboratore scarica ORION, dice il codice, e si ritrova DENTRO l'azienda — stessi clienti, stessa agenda, stessa memoria; ognuno col suo ruolo.
2) Sii onesto sul limite della demo: per vedere l'aggancio dal vivo servono DUE computer (lui titolare su uno, un collaboratore sull'altro) — nella versione completa è la prima cosa da fare col team. Qui glielo racconti e nelle prossime tappe gli fai vivere la squadra con un collaboratore di prova.
3) Presentazione (un codice, tutto il team dentro · ognuno col suo ruolo · la memoria è di tutti), poi tappa_completata.`,
};

const TAPPA_SQUADRA: TappaTutorial = {
  id: "squadra",
  titolo: "La squadra",
  icona: "🤝",
  guida: `SCOPO: fargli vivere la staffetta del team — i messaggi che si consegnano da soli.
1) Nello studio di prova c'è un collaboratore: Marco (responsabile). Fagli provare la staffetta: "di' a Marco che domani la riunione è alle 9" → lascia_messaggio. Spiega che Marco lo sentirà A VOCE appena apre ORION, con notifica subito.
2) Mostra l'organigramma vivo (mostra_organico): ORION conosce le PERSONE, non solo i ruoli — chi fa cosa, chi va avvisato per cosa.
3) Fagli assegnare un compito vero: "assegna a Marco il preventivo del cliente nuovo, aggiornami tra due giorni" → assegna_compito: spiega che seguirai tu l'avanzamento e segnalerai i ritardi.
4) Presentazione (di' a Marco che… e ci pensa ORION · l'organigramma è vivo · i compiti si seguono da soli), poi tappa_completata.`,
};

const TAPPA_APPROVAZIONI: TappaTutorial = {
  id: "approvazioni",
  titolo: "Il sì che viaggia",
  icona: "✅",
  guida: `SCOPO: fargli capire il sì/no che viaggia da solo tra i ruoli.
1) Racconta la scena in una frase: un collaboratore vuole fare uno sconto oltre la soglia — serve l'ok del titolare (lui).
2) Simulala dal lato del collaboratore: chiama chiedi_approvazione (es. "sconto 15% al cliente Bianchi — chiede Marco"). Digli che al titolare arriva nel briefing e con una notifica; lui è il titolare: fagliela decidere A VOCE ("approvala" / "digli di no perché…") → rispondi_approvazione. Spiega che l'esito TORNA DA SOLO a chi ha chiesto.
3) Ricorda in una frase le AREE RISERVATE: incassi, pagamenti e fatture li vede solo chi decide lui (imposta_permessi) — se un operatore chiede gli incassi, ORION risponde con garbo che è riservato.
4) Presentazione (le richieste viaggiano da sole · decidi a voce · le aree riservate restano riservate), poi tappa_completata.`,
};

const TAPPA_GIORNALE: TappaTutorial = {
  id: "giornale",
  titolo: "Il giornale di bordo",
  icona: "📔",
  guida: `SCOPO: la memoria di gruppo — cosa è successo oggi in azienda, senza chiederlo a nessuno.
1) Fagli chiedere "cosa è successo oggi?" → giornale_di_bordo: racconta a voce i fatti salienti della giornata di prova (i messaggi, i compiti, le approvazioni appena vissute ci sono davvero).
2) Spiega il know-how: le decisioni e le procedure si salvano con il loro PERCHÉ (impara) — è la memoria che resta anche quando una persona lascia l'azienda.
3) Presentazione (il giorno raccontato in 30 secondi · le decisioni restano, con il perché · la memoria è dell'azienda, non delle persone), poi tappa_completata.`,
};

// I due percorsi. L'ordine è un crescendo: prima il colpo (la giornata servita),
// poi i pezzi da novanta (cliente → imprevisto → il SUO software), poi testa e
// cuore (posta, memoria, anticipazione), il racconto della notte, la bellezza,
// il finale.
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
  };
}

// ── AVVIO E AVANZAMENTO ──────────────────────────────────────────────────────

// Sceglie il percorso da ciò che la Chiamata 0 ha scoperto e semina lo studio
// di prova. Idempotente: se già avviato, restituisce lo stato con'è.
export function avviaTutorial(): StatoTutorial {
  const attuale = statoTutorial();
  if (attuale.percorso) return attuale;
  const profilo = getProfilo();
  const azienda = db().prepare("SELECT tenant_id FROM aziende WHERE tenant_id = ?").get(T());
  const percorso: Percorso = azienda || profilo.tipo_lavoro === "azienda" ? "azienda" : "professionista";
  seminaStudioDiProva(percorso, profilo.professione ?? null);
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

// La prestazione tipo per professione: rende il finto studio credibile
// ("seduta", non "appuntamento generico") per il mestiere dichiarato.
function prestazioneDi(professione: string | null): { nome: string; durataMin: number } {
  const p = (professione ?? "").toLowerCase();
  const tra = (parole: string[], nome: string, durataMin: number) =>
    parole.some((w) => p.includes(w)) ? { nome, durataMin } : null;
  return (
    tra(["dentist", "odontoiatr", "igienist"], "Visita di controllo", 45) ??
    tra(["avvocat", "legale", "notai"], "Consulenza", 60) ??
    tra(["fisioterap", "osteopat", "massaggi"], "Seduta", 50) ??
    tra(["psicolog", "psicoterap"], "Seduta", 50) ??
    tra(["parrucchier", "barbier", "estetist", "nail"], "Appuntamento in salone", 60) ??
    tra(["personal trainer", "allenator", "palestra", "fitness"], "Allenamento", 60) ??
    tra(["veterinari"], "Visita", 30) ??
    tra(["tatuator", "tattoo", "piercing"], "Sessione", 120) ??
    tra(["medic", "dottor", "pediatr", "dermatolog", "cardiolog"], "Visita", 30) ??
    tra(["commercialist", "consulente del lavoro", "tributar"], "Incontro", 45) ??
    tra(["elettricist", "idraulic", "artigian", "muratore", "tecnic"], "Sopralluogo", 60) ??
    tra(["fotograf"], "Servizio fotografico", 90) ??
    { nome: "Appuntamento", durataMin: 45 }
  );
}

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

function inserisciAppuntamento(a: { cliente_id: number; titolo: string; inizio: Date; durataMin: number; stato: string; note?: string | null }): void {
  const fine = new Date(a.inizio.getTime() + a.durataMin * 60_000);
  db()
    .prepare(
      "INSERT INTO appuntamenti (tenant_id, cliente_id, titolo, inizio, fine, stato, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(T(), a.cliente_id, a.titolo, a.inizio.toISOString(), fine.toISOString(), a.stato, a.note ?? null, new Date().toISOString());
}

// Un orario "di studio" nel futuro prossimo: oggi se c'è ancora giornata,
// altrimenti scala a domani (il briefing deve sempre avere qualcosa davanti).
function prossimaOra(oraBase: number, giorniAvanti: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + giorniAvanti);
  d.setHours(oraBase, 0, 0, 0);
  if (giorniAvanti === 0 && d.getTime() < Date.now() + 30 * 60_000) {
    // Quell'ora di oggi è già passata: la prima utile tra un'ora tonda.
    const traUnOra = new Date(Date.now() + 60 * 60_000);
    traUnOra.setMinutes(0, 0, 0);
    d.setTime(traUnOra.getTime());
    if (d.getHours() >= 19) {
      // Giornata finita: si va a domattina.
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    }
  }
  return d;
}

export function seminaStudioDiProva(percorso: Percorso, professione: string | null): void {
  const prest = prestazioneDi(professione);
  const ids = CLIENTI_DEMO.map(inserisciCliente);
  const [giulia, andrea, elena, paolo, martina] = ids;

  // La giornata di oggi: piena il giusto, con una cosa da confermare.
  inserisciAppuntamento({ cliente_id: andrea, titolo: `${prest.nome} — Andrea Colombo`, inizio: prossimaOra(10, 0), durataMin: prest.durataMin, stato: "confermato" });
  inserisciAppuntamento({ cliente_id: elena, titolo: `${prest.nome} — Elena Ricci`, inizio: prossimaOra(15, 0), durataMin: prest.durataMin, stato: "confermato" });
  inserisciAppuntamento({ cliente_id: paolo, titolo: `${prest.nome} — Paolo Fontana`, inizio: prossimaOra(17, 0), durataMin: prest.durataMin, stato: "da_confermare" });

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
- Sei TU la guida: accogli, spiega con parole SEMPLICI (zero tecnicismi: non dire "webhook", "API", "tool" — di' "si collega", "lo faccio io"), e soprattutto AGISCI tu per primo. Fagli vedere, poi fagli provare.
- UNA cosa alla volta, ritmo vivo: frasi brevi, mai lezioni. Il tono è quello di una collega in gamba il primo giorno: calore vero, zero recite.
- Segui la GUIDA DELLA TAPPA corrente. Non anticipare le tappe successive; se l'utente chiede una cosa di un'altra tappa, rispondi breve e riportalo con leggerezza al filo ("ci arriviamo tra pochissimo, è una delle mie preferite").
- L'utente comanda: "avanti/andiamo avanti" = chiudi la tappa (tappa_completata); "salta questa" = idem senza insistere; "aspetta/fermati" = fermati e rispondi.
- A fine tappa apri SEMPRE la presentazione (strumento presentazione): 2-4 punti, titoli corti, testi di una riga — è il riassunto che resta negli occhi. Poi chiama tutorial azione tappa_completata NELLO STESSO turno.
- ONESTÀ DEMO: WhatsApp, email e avvisi qui sono SIMULATI (lo studio è di prova) — se il contesto lo richiede, dillo con naturalezza e ricorda che nella versione completa sono veri. MAI fingere che un invio vero sia partito.
- Niente P.IVA, carta o dati fiscali: nella demo NON si chiedono e NON si configurano collegamenti reali (WhatsApp/email/calendario veri, import di file): se l'utente li chiede, spiega che vivono nella versione completa.
- L'obiettivo emotivo: deve pensare "questa è la segretaria che non ho mai potuto permettermi". Ogni tappa deve regalargli un momento così.`;

// Il blocco da iniettare nel system prompt (parte VOLATILE), per gli account demo.
export function bloccoTutorialSystem(onboardingCompleto: boolean): string {
  const s = statoTutorial();

  if (!s.percorso) {
    if (onboardingCompleto) {
      // Caso raro: onboarding chiuso ma tutorial mai avviato (es. riavvio) → avvia.
      return `\n\n═══ ORION DEMO ═══\nQuesto è un account DEMO. L'onboarding è completo ma il giro guidato non è ancora partito: chiama SUBITO lo strumento tutorial con azione "avvia" e comincia dalla prima tappa.\n${REGOLE_TUTOR}`;
    }
    return `\n\n═══ ORION DEMO — CHIAMATA 0 ═══\nQuesto è un account DEMO (l'app "ORION Demo"): l'utente sta assaggiando ORION prima di sceglierlo. La Chiamata 0 si fa COME SEMPRE (stessa qualità, stessa naturalezza), con QUESTI adattamenti:
- All'inizio, UNA frase di benvenuto in più: è la demo, facciamo conoscenza e poi lo porti a fare un giro guidato dove gli mostri dal vivo come lavoreresti per lui.
- Colloquio SNELLO: punta a 5-6 domande totali. SALTA del tutto i dati fiscali (P.IVA, regime, indirizzo) e NON proporre import di file né collegamenti reali (WhatsApp/email/calendario): nella demo non servono.
- La domanda sul software gestionale FALLA (è importantissima per il giro): se ne usa uno, registralo (collega_sistema, con COME si apre) e imposta la fonte (imposta_fonte_dati); se no, fonte='orion'.
- Appena imposti onboarding_completo=1: NELLO STESSO TURNO chiama lo strumento tutorial con azione "avvia" e parti con la prima tappa del giro.
${REGOLE_TUTOR}`;
  }

  if (s.finito) {
    return `\n\n═══ ORION DEMO — GIRO COMPLETATO ═══\nIl tutorial è finito. Continua a essere ORION al completo nello studio di prova: rispondi e agisci normalmente. Se l'utente mostra interesse, ricordagli con leggerezza che la versione completa è su orionvision.it. Ricorda l'ONESTÀ DEMO: invii simulati, studio di prova.`;
  }

  const tappe = TAPPE[s.percorso];
  const tappa = tappe[s.indice];
  return `\n\n═══ ORION DEMO — TUTORIAL IN CORSO ═══\nPercorso: ${s.percorso.toUpperCase()} — Tappa ${s.indice + 1} di ${tappe.length}: «${tappa.titolo}» ${tappa.icona}\n\nGUIDA DELLA TAPPA (il tuo copione operativo, da vivere non da recitare):\n${tappa.guida}\n\nSE QUESTA È UNA NUOVA SESSIONE (direttiva d'avvio): NON fare il briefing di routine — bentornato in una frase e riprendi il giro dalla tappa corrente («eravamo qui: ${tappa.titolo}»).\n\n${REGOLE_TUTOR}`;
}
