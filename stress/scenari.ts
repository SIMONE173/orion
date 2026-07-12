// ──────────────────────────────────────────────────────────────────────────
// STRESS TEST — GLI SCENARI. Ogni lotto è una storia vera recitata da utenti
// simulati; le verifiche guardano il DATABASE (fatti), non solo le parole.
// I controlli sulle risposte in linguaggio naturale sono volutamente laschi
// (il modello varia le frasi); quelli sui dati sono rigidi.
// ──────────────────────────────────────────────────────────────────────────
import {
  BASE,
  creaAccount,
  dice,
  riapre,
  verifica,
  haVista,
  haAzione,
  rispostaSana,
  tenantDi,
  conta,
  riga,
  trascriviTurno,
  annota,
  budgetSuperato,
  spesa,
  type Pilota,
} from "./motore";

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ════════════════════════════════════════════════════════════════════════════
// LOTTO 1 — FONDAMENTA: la fisioterapista autonoma, dalla Chiamata 0 al lavoro
// vero (agenda, clienti, pagamenti, promemoria, memoria, finanza, tema).
// ════════════════════════════════════════════════════════════════════════════
export async function lottoFondamenta() {
  const S = "fondamenta";
  annota(`\n## Lotto 1 — Fondamenta (fisioterapista autonoma)\n`);
  const chiara = await creaAccount(`stress-fisio@test.orion`, "Chiara");
  const T = tenantDi(chiara.email);

  // — Chiamata 0 —
  let r = await riapre(chiara);
  trascriviTurno("(apertura)", "", r);
  verifica(S, "Chiamata 0: ORION si presenta e fa domande", rispostaSana(r) && r.testo.length > 40, r.errore ?? r.testo.slice(0, 80));

  r = await dice(chiara, "Sono Chiara, faccio la fisioterapista, lavoro in proprio nel mio studio. ORION lo voglio usare per il lavoro.");
  trascriviTurno("Chiara", "presentazione", r);
  verifica(S, "Onboarding: accetta la presentazione senza errori", rispostaSana(r), r.errore);

  r = await dice(
    chiara,
    "Lavoro dal lunedì al venerdì dalle 9 alle 18, le sedute durano 45 minuti. L'agenda voglio tenerla qui su ORION, non uso nessun gestionale. Sui pagamenti: segno tutto a fine seduta."
  );
  trascriviTurno("Chiara", "orari e abitudini", r);
  verifica(S, "Onboarding: registra orari/abitudini", rispostaSana(r), r.errore);

  r = await dice(
    chiara,
    "Le urgenze passamele sempre. Gli appuntamenti confermali tu. Per il resto puoi fare da solo. Direi che possiamo cominciare a lavorare."
  );
  trascriviTurno("Chiara", "regole e via", r);
  const profilo = riga<{ professione: string | null; onboarding_completo: number }>(
    "SELECT p.professione, COALESCE(u.onboarding_completo,0) AS onboarding_completo FROM profili p JOIN utenti u ON u.id = ? WHERE p.tenant_id = ?",
    riga<{ id: number }>("SELECT id FROM utenti WHERE email = ?", chiara.email)!.id,
    T
  );
  verifica(S, "DB: professione salvata nel profilo", Boolean(profilo?.professione && /fisio/i.test(profilo.professione)), `professione=${profilo?.professione}`);
  verifica(S, "DB: onboarding completato", profilo?.onboarding_completo === 1, `flag=${profilo?.onboarding_completo}`);

  // — Agenda + clienti —
  r = await dice(chiara, "Segnami la signora Bianchi martedì prossimo alle 15.");
  trascriviTurno("Chiara", "nuovo appuntamento", r);
  if (conta("appuntamenti", T) === 0) {
    r = await dice(chiara, "Sì, è una cliente nuova: creala pure, si chiama Anna Bianchi.");
    trascriviTurno("Chiara", "conferma nuova cliente", r);
  }
  verifica(S, "DB: la cliente Bianchi esiste", conta("clienti", T, "LOWER(nome) LIKE ?", ["%bianchi%"]) >= 1);
  verifica(S, "DB: l'appuntamento c'è", conta("appuntamenti", T) >= 1);

  r = await dice(chiara, "Che appuntamenti ho martedì prossimo?");
  trascriviTurno("Chiara", "agenda del martedì", r);
  verifica(S, "Vista agenda a schermo", haVista(r, "agenda"), `viste: ${r.viste.map((v) => v.tipo).join(",")}`);

  r = await dice(chiara, "Sposta la Bianchi di un'ora più tardi, sempre martedì.");
  trascriviTurno("Chiara", "sposta appuntamento", r);
  verifica(S, "Spostamento senza errori", rispostaSana(r), r.errore);

  // — Pagamenti / finanza —
  r = await dice(chiara, "La Bianchi ha pagato 60 euro per la seduta di oggi, in contanti.");
  trascriviTurno("Chiara", "registra pagamento", r);
  verifica(S, "DB: pagamento registrato", conta("pagamenti", T) >= 1);

  r = await dice(chiara, "Quanto ho incassato questo mese?");
  trascriviTurno("Chiara", "incassi del mese", r);
  verifica(S, "Autonoma: la finanza risponde (nessuna riserva)", rispostaSana(r) && (haVista(r, "finanza") || /60|sessant/i.test(r.testo)), r.testo.slice(0, 80));

  // — Promemoria + memoria viva —
  r = await dice(chiara, "Ricordami giovedì di ordinare gli elettrodi nuovi.");
  trascriviTurno("Chiara", "promemoria", r);
  verifica(S, "DB: promemoria creato", conta("promemoria", T) >= 1);

  r = await dice(chiara, "Impara questa cosa di me: tra un paziente e l'altro voglio sempre dieci minuti di pausa, non mettermi mai appuntamenti attaccati.");
  trascriviTurno("Chiara", "memoria viva", r);
  verifica(S, "DB: intuizione in memoria", conta("memoria", T) >= 1);

  // — Personalizzazione estetica —
  r = await dice(chiara, "Cambiami i colori: voglio un ORION verde smeraldo elegante.");
  trascriviTurno("Chiara", "tema verde", r);
  verifica(S, "Azione tema emessa", haAzione(r, "tema"), `azioni: ${(r.azioni ?? []).map((a) => a.tipo).join(",")}`);

  // — Riapertura: il briefing del giorno —
  r = await riapre(chiara);
  trascriviTurno("(riapertura)", "", r);
  verifica(S, "Briefing alla riapertura", rispostaSana(r), r.errore);
  console.log(`   [spesa finora: €${spesa.euro.toFixed(2)}]`);
}

// ════════════════════════════════════════════════════════════════════════════
// LOTTO 2 — AZIENDA: officina con titolare e meccanico. Codice aziendale,
// permessi veri, staffetta, compiti, approvazioni, giornale di bordo.
// ════════════════════════════════════════════════════════════════════════════
export async function lottoAzienda() {
  const S = "azienda";
  annota(`\n## Lotto 2 — Azienda (officina, 2 utenti)\n`);
  const tit = await creaAccount(`stress-officina-tit@test.orion`, "Salvo");
  const T = tenantDi(tit.email);

  // — Chiamata 0 aziendale —
  let r = await riapre(tit);
  trascriviTurno("(apertura titolare)", "", r);
  r = await dice(tit, "Sono Salvo, ho un'officina meccanica con dei dipendenti: ORION lo voglio integrare in azienda, per tutto il team.");
  trascriviTurno("Salvo", "azienda", r);
  r = await dice(
    tit,
    "Si chiama Officina Salvo, settore riparazioni auto, siamo in 4: io, Marco e Luca meccanici, e Giulia in accettazione. Due reparti: officina e accettazione."
  );
  trascriviTurno("Salvo", "identità e struttura", r);
  r = await dice(
    tit,
    "Regole importanti: gli incassi e i conti li vedo solo io. Gli sconti sopra i 100 euro li devo approvare io. Le richieste dei clienti passano da Giulia. Per il resto siamo pronti a partire."
  );
  trascriviTurno("Salvo", "regole operative", r);

  const azienda = riga<{ codice_aziendale: string | null; permessi: string | null }>(
    "SELECT codice_aziendale, permessi FROM aziende WHERE tenant_id = ?",
    T
  );
  verifica(S, "DB: azienda creata con codice aziendale", Boolean(azienda?.codice_aziendale), JSON.stringify(azienda));
  verifica(S, "DB: organico registrato (persone del team)", conta("organico", T) >= 2, `organico=${conta("organico", T)}`);
  if (!azienda?.codice_aziendale) throw new Error("senza codice aziendale il lotto non può proseguire");

  // — Il dipendente si aggancia col codice —
  const marco = await creaAccount(`stress-officina-marco@test.orion`, null as unknown as string);
  r = await riapre(marco);
  trascriviTurno("(apertura Marco)", "", r);
  r = await dice(marco, `Faccio parte di un'azienda che usa già ORION: il mio codice aziendale è ${azienda.codice_aziendale}. Sono Marco, il meccanico.`);
  trascriviTurno("Marco", "aggancio con codice", r);
  const uMarco = riga<{ azienda_id: number | null; tenant_id: number | null }>("SELECT azienda_id, tenant_id FROM utenti WHERE email = ?", marco.email);
  verifica(S, "DB: Marco agganciato all'azienda (stesso tenant)", uMarco?.tenant_id === T, JSON.stringify(uMarco));

  // — PERMESSI VERI: il meccanico non vede i soldi —
  r = await dice(marco, "Quanto abbiamo incassato questo mese in officina?");
  trascriviTurno("Marco", "tenta la finanza", r);
  const cifreNellaRisposta = /\d+[.,]?\d*\s*(€|euro)/i.test(r.testo);
  verifica(S, "Riservatezza: nessuna vista finanza a Marco", !haVista(r, "finanza"), `viste: ${r.viste.map((v) => v.tipo).join(",")}`);
  verifica(S, "Riservatezza: nessuna cifra rivelata a Marco", !cifreNellaRisposta, r.testo.slice(0, 100));

  // — Staffetta del team —
  r = await dice(tit, "Di' a Marco che domani mattina alle 8 arriva il fornitore dei ricambi, deve esserci lui ad aprire.");
  trascriviTurno("Salvo", "messaggio a Marco", r);
  verifica(S, "DB: messaggio in staffetta", conta("messaggi_team", T) >= 1);

  // — Compito assegnato —
  r = await dice(tit, "Assegna a Marco il tagliando completo della Fiat Punto del cliente Verdi, entro giovedì.");
  trascriviTurno("Salvo", "assegna compito", r);
  verifica(S, "DB: compito assegnato a Marco", conta("compiti", T, "LOWER(assegnatario) LIKE ?", ["%marco%"]) >= 1);

  // — Marco riapre: briefing con messaggio + compito —
  r = await riapre(marco);
  trascriviTurno("(riapertura Marco)", "", r);
  verifica(S, "Staffetta consegnata a voce (fornitore/8)", /fornitor|alle 8|ricambi/i.test(r.testo), r.testo.slice(0, 140));

  // — Approvazione: lo sconto sopra soglia —
  r = await dice(marco, "Il cliente Verdi chiede uno sconto di 150 euro sul tagliando. Chiedi a Salvo se posso farglielo.");
  trascriviTurno("Marco", "chiede approvazione", r);
  verifica(S, "DB: richiesta di approvazione in attesa", conta("approvazioni", T, "stato = 'in_attesa'") >= 1);

  r = await riapre(tit);
  trascriviTurno("(riapertura Salvo)", "", r);
  verifica(S, "La richiesta arriva al titolare nel briefing", /sconto|150|approv|Verdi/i.test(r.testo), r.testo.slice(0, 140));
  r = await dice(tit, "Va bene, approvala. Ma digli che è l'ultima volta senza chiedermelo prima.");
  trascriviTurno("Salvo", "approva", r);
  verifica(S, "DB: richiesta approvata", conta("approvazioni", T, "stato = 'approvata'") >= 1);

  r = await riapre(marco);
  trascriviTurno("(riapertura Marco 2)", "", r);
  verifica(S, "L'esito torna a Marco a voce", /approvat|va bene|ok|sconto/i.test(r.testo), r.testo.slice(0, 140));

  // — Consegne di turno + giornale di bordo —
  r = await dice(marco, "Sto chiudendo il turno: ho finito i freni della Golf, resta in sospeso la revisione della Panda, occhio che il ponte 2 perde olio.");
  trascriviTurno("Marco", "consegne", r);
  verifica(S, "DB: consegne registrate", conta("consegne", T) >= 1);

  r = await dice(tit, "Cosa è successo oggi in officina?");
  trascriviTurno("Salvo", "giornale di bordo", r);
  verifica(S, "Giornale di bordo: schema a schermo", haVista(r, "schema"), `viste: ${r.viste.map((v) => v.tipo).join(",")}`);
  console.log(`   [spesa finora: €${spesa.euro.toFixed(2)}]`);
}

// ════════════════════════════════════════════════════════════════════════════
// LOTTO 3 — GESTIONALE in Chiamata 0: lo studio legale che usa già Cliens.
// ORION lo registra, genera il canale d'ingresso e i dati esterni confluiscono.
// ════════════════════════════════════════════════════════════════════════════
export async function lottoGestionale() {
  const S = "gestionale";
  annota(`\n## Lotto 3 — Gestionale esistente (studio legale)\n`);
  const avv = await creaAccount(`stress-legale@test.orion`, "Avv. Ferri");
  const T = tenantDi(avv.email);

  let r = await riapre(avv);
  trascriviTurno("(apertura)", "", r);
  r = await dice(avv, "Sono l'avvocato Ferri, studio legale, lavoro da solo con una segretaria. Uso ORION per il lavoro, da autonomo.");
  trascriviTurno("Ferri", "presentazione", r);
  r = await dice(
    avv,
    "Attenzione: per le pratiche e i fascicoli uso già un gestionale che si chiama Cliens, e voglio continuare a usarlo. Lì dentro ho clienti, pratiche e udienze. ORION deve affiancarlo, non sostituirlo. Sì, collegalo pure e prepara quello che serve."
  );
  trascriviTurno("Ferri", "il gestionale esistente", r);
  verifica(S, "DB: il gestionale Cliens è registrato", conta("connessioni", T, "LOWER(nome) LIKE ?", ["%cliens%"]) >= 1);

  r = await dice(avv, "Che sistemi ho collegato a ORION?");
  trascriviTurno("Ferri", "verifica sistemi", r);
  verifica(S, "ORION conosce e racconta il suo ecosistema", /cliens/i.test(r.testo), r.testo.slice(0, 120));

  // — Il canale d'ingresso: un dato dal gestionale entra davvero —
  const conn = riga<{ id: number; token: string | null }>(
    "SELECT id, token FROM connessioni WHERE tenant_id = ? AND LOWER(nome) LIKE '%cliens%'",
    T
  );
  if (conn?.token) {
    const ing = await fetch(`${BASE}/api/integrazioni/ingest?token=${conn.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "cliente",
        chiave: "CL-2024-091",
        titolo: "Rossi Mario — pratica recupero crediti",
        dati: { nome: "Mario Rossi", telefono: "+39 333 111 2233", pratica: "recupero crediti", stato: "in corso" },
      }),
    });
    verifica(S, "Ingest: il webhook accetta il dato del gestionale", ing.ok, `status=${ing.status}`);
    await pausa(300);
    verifica(S, "DB: il dato esterno è arrivato", conta("entita_esterne", T) >= 1 || conta("clienti", T, "LOWER(nome) LIKE ?", ["%rossi%"]) >= 1);

    r = await dice(avv, "Cosa mi sai dire del cliente Mario Rossi?");
    trascriviTurno("Ferri", "interroga il dato ingerito", r);
    verifica(S, "ORION vede il dato del gestionale", /rossi|recupero|crediti/i.test(r.testo), r.testo.slice(0, 120));
  } else {
    verifica(S, "Ingest: token della connessione generato", false, "connessione senza token (modalita descritto?) — accettabile ma da guardare");
  }
  console.log(`   [spesa finora: €${spesa.euro.toFixed(2)}]`);
}

// ════════════════════════════════════════════════════════════════════════════
// LOTTO 4 — TAPPETO: una raffica di funzioni una-per-turno (riusa Chiara).
// ════════════════════════════════════════════════════════════════════════════
export async function lottoTappeto() {
  const S = "tappeto";
  annota(`\n## Lotto 4 — Tappeto delle funzioni\n`);
  const chiara = await creaAccount(`stress-fisio@test.orion`, "Chiara");
  const T = tenantDi(chiara.email);

  const colpi: { nome: string; frase: string; desktop?: boolean; check: (r: Awaited<ReturnType<typeof dice>>) => [boolean, string?] }[] = [
    {
      nome: "Schema/lavagna",
      frase: "Fammi uno schema sui benefici della riabilitazione post-operatoria.",
      check: (r) => [haVista(r, "schema") || haVista(r, "lavagna"), r.viste.map((v) => v.tipo).join(",")],
    },
    {
      nome: "Matematica",
      frase: "Quanto fa il 15% di 240?",
      check: (r) => [/36/.test(r.testo), r.testo.slice(0, 60)],
    },
    {
      nome: "Mappa",
      frase: "Mostrami la mappa intorno al Duomo di Milano.",
      check: (r) => [haVista(r, "mappa"), r.viste.map((v) => v.tipo).join(",")],
    },
    {
      nome: "WhatsApp preparato (non inviato)",
      frase: "Prepara un WhatsApp per la Bianchi per ricordarle l'appuntamento di martedì.",
      check: (r) => [haVista(r, "whatsapp") || /whatsapp|messaggio/i.test(r.testo), r.viste.map((v) => v.tipo).join(",")],
    },
    {
      nome: "Email senza account (degrado garbato)",
      frase: "Leggimi le email di oggi.",
      check: (r) => [rispostaSana(r) && /collega|configur|account|non.*collegat/i.test(r.testo), r.testo.slice(0, 100)],
    },
    {
      nome: "Lista d'attesa",
      frase: "Metti il signor Esposito in lista d'attesa: se si libera un posto questa settimana chiamalo.",
      check: () => [conta("lista_attesa", T) >= 1],
    },
    {
      nome: "Nota su cliente",
      frase: "Segna sulla scheda della Bianchi che ha ripreso a correre, dolore quasi sparito.",
      check: () => [conta("note", T) >= 1],
    },
    {
      nome: "Documenti (lista vuota, garbo)",
      frase: "Che documenti ho in archivio?",
      check: (r) => [rispostaSana(r), r.errore],
    },
    {
      nome: "Apri app (Desktop)",
      frase: "Apri la Calcolatrice.",
      desktop: true,
      check: (r) => [haAzione(r, "apri_app"), (r.azioni ?? []).map((a) => a.tipo).join(",")],
    },
    {
      nome: "Stampa agenda (Desktop)",
      frase: "Stampami l'agenda di questa settimana.",
      desktop: true,
      check: (r) => [haAzione(r, "stampa_contenuto") || haAzione(r, "stampa_file"), (r.azioni ?? []).map((a) => a.tipo).join(",")],
    },
    {
      nome: "Riposo",
      frase: "Grazie ORION, riposati pure.",
      check: (r) => [haAzione(r, "riposo"), (r.azioni ?? []).map((a) => a.tipo).join(",")],
    },
    {
      nome: "Tema: torna all'originale",
      frase: "Rimetti i colori originali di ORION.",
      check: (r) => [haAzione(r, "tema"), (r.azioni ?? []).map((a) => a.tipo).join(",")],
    },
  ];

  for (const colpo of colpi) {
    if (budgetSuperato()) {
      console.log("   ⛔ budget raggiunto: mi fermo qui nel tappeto");
      break;
    }
    const r = await dice(chiara, colpo.frase, { desktop: colpo.desktop });
    trascriviTurno("Chiara", colpo.frase, r);
    const [ok, dettaglio] = colpo.check(r);
    verifica(S, colpo.nome, ok, dettaglio);
  }
  console.log(`   [spesa finora: €${spesa.euro.toFixed(2)}]`);
}

// ════════════════════════════════════════════════════════════════════════════
// LOTTO 5 — CENTRALINO: un cliente chiama (simulatore telefono, senza Twilio).
// ════════════════════════════════════════════════════════════════════════════
export async function lottoCentralino() {
  const S = "centralino";
  annota(`\n## Lotto 5 — Centralino telefonico (simulato)\n`);
  const chiama = async (testo: string) => {
    const r = await fetch(`${BASE}/api/telefono/simula`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ da: "+393339998877", testo }),
    });
    return { status: r.status, dati: (await r.json().catch(() => ({}))) as { risposta?: string; ok?: boolean } };
  };

  const saluto = await chiama("");
  verifica(S, "Il centralino risponde al saluto", saluto.status === 200 && Boolean(saluto.dati.risposta), JSON.stringify(saluto).slice(0, 120));
  annota(`**Centralino:** ${saluto.dati.risposta ?? "(niente)"}\n`);

  const richiesta = await chiama("Buongiorno, vorrei prenotare una visita per la prossima settimana, sono Paolo Neri.");
  verifica(S, "Il centralino gestisce la richiesta di appuntamento", richiesta.status === 200 && Boolean(richiesta.dati.risposta), JSON.stringify(richiesta).slice(0, 160));
  annota(`**Centralino:** ${richiesta.dati.risposta ?? "(niente)"}\n`);
  console.log(`   [spesa finora: €${spesa.euro.toFixed(2)}]`);
}
