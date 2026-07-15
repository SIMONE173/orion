// ── NOVITÀ E AGGIORNAMENTI ───────────────────────────────────────────────────
// La scheda che scorre sul sito. Per aggiungere una novità basta una riga in
// cima: { data: "YYYY-MM-DD", testo: "…" }. Le più recenti prima.

export type Novita = { data: string; testo: string };

export const NOVITA: Novita[] = [
  { data: "2026-07-15", testo: "Founding member: lo sconto a vita si aggancia da solo al tuo account — niente codici da inserire" },
  { data: "2026-07-14", testo: "Aperte le iscrizioni alla beta: i primi professionisti diventano founding member" },
  { data: "2026-07-14", testo: "Nuova voce di ORION: più naturale e umana, uguale su ogni dispositivo" },
  { data: "2026-07-13", testo: "ORION ora scrive nel tuo gestionale: appuntamenti e clienti arrivano anche nel tuo software, firmati" },
  { data: "2026-07-12", testo: "Stress test superato: 190+ conversazioni reali, dalla Chiamata 0 all'azienda multi-utente" },
  { data: "2026-07-12", testo: "Sicurezza rafforzata: sessioni a impronta, aree riservate per ruolo, header di protezione" },
  { data: "2026-07-12", testo: "Backup cifrati fuori sede ogni notte, con ripristino collaudato" },
  { data: "2026-07-12", testo: "Per le aziende: staffetta del team, approvazioni che viaggiano da sole e giornale di bordo" },
  { data: "2026-07-11", testo: "ORION su misura: digli 'mettimi rosso Ferrari' e tutta l'interfaccia cambia con un'onda di colore" },
  { data: "2026-07-11", testo: "Comandi gestuali: sposta e ridimensiona le finestre di tutto il computer con le mani" },
  { data: "2026-07-08", testo: "ORION stampa davvero: 'stampami l'agenda di domani' e il foglio esce dalla stampante" },
];
