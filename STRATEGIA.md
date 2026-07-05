# ORION — Strategia

> **La frase che guida tutto:** vendi la segretaria, non il sistema operativo.
> L'"OS cognitivo" resta la visione a lungo termine; si compra però una cosa
> sola: una segretaria AI che si ripaga da sola. Da lì si cresce.

## Il posizionamento (da luglio 2026)

**ORION è la segretaria AI degli studi su appuntamento.**
Risponde al telefono quando lo studio non può, prenota, manda i promemoria che
azzerano i no-show, tiene i conti, emette fatture elettroniche vere e vive nel
calendario che il professionista già usa. Si parla, non si impara.

**Verticale di lancio:** professionisti della salute e del benessere su
appuntamento — psicologi, psicoterapeuti, fisioterapisti, osteopati,
nutrizionisti, logopedisti, poliambulatori piccoli. Perché loro:

- lavorano su appuntamento con WhatsApp e telefono al centro;
- perdono chiamate mentre hanno il paziente davanti (ogni chiamata persa ≈
  50–100 € che vanno altrove) e subiscono no-show;
- non possono permettersi una segretaria (800–1.200 €/mese part-time);
- molti sono forfettari → fatturazione semplice, perfetta per l'automazione;
- i gestionali storici li coprono poco (a differenza di commercialisti e
  avvocati, presidiati da TeamSystem/Zucchetti).

**Chi NON inseguiamo ora:** commercialisti (TeamSystem ha comprato Normo.ai e
ha AI nativa in tutta la suite), avvocati (spesa digitale più bassa della
categoria, ~9.500 €/anno), aziende strutturate (la modalità team resta nel
prodotto ma non si spinge finché il verticale non tira).

## Perché adesso (dati, luglio 2026)

- Adozione AI nelle imprese italiane triplicata dal 6% al 16,4% (2023–2025);
  nelle piccole (<49 addetti) è al 14,2% e il freno n.1 dichiarato è la
  **mancanza di competenze** (Rapporto Istat 2026). Un prodotto a cui *parli e
  basta* attacca esattamente quella barriera.
- ~70% dei professionisti si dichiara attivo nell'adozione di AI (survey
  TeamSystem 2026): il mercato sta comprando ADESSO.
- La nicchia "receptionist AI medicale" (CiaoDott, GAIA, AIDA, VocalMed…) è
  già affollata: la domanda è PROVATA. Ma quei prodotti fanno solo il
  telefono e devono integrarsi col gestionale altrui. ORION ha già dentro
  agenda, clienti, WhatsApp, incassi e fatture: il centralino è una feature,
  non il prodotto — questo è il vantaggio strutturale.
- AI Act in applicazione generale dal 2 agosto 2026 (trasparenza verso il
  pubblico, sanzioni operative) e Garante con ispezioni su AI + dati sanitari:
  la compliance è diventata un'ARMA di vendita per chi ce l'ha ("a prova di
  Garante") e un rischio per i concorrenti improvvisati.

## Il prodotto: 4 pilastri che fanno i soldi (implementati)

1. **Centralino AI** (`/api/telefono/*`, `lib/telefono.ts`) — risponde al
   numero dello studio 24/7, si dichiara AI (AI Act), prenota SOLO su slot
   liberi, prende messaggi, notifica il professionista. Modello rapido:
   risposte in ~1-2 s, costi da centesimi.
2. **Anti no-show** (`cron` + webhook WhatsApp) — promemoria automatico prima
   di ogni appuntamento; SÌ = conferma da sola, NO = promemoria di richiamo +
   push. È il ROI più documentato del settore.
3. **Fatture elettroniche vere** (`lib/fatturapa.ts`, `lib/sdi.ts`) — XML
   FatturaPA 1.2, forfettario (N2.2, bollo) e ordinario, trasmissione via
   provider API; e la regola che i concorrenti generici sbagliano:
   **le prestazioni sanitarie a persone fisiche NON passano dallo SDI** (le
   rileva da solo).
4. **Calendario dove vive il professionista** (`lib/gcal.ts`) — sync
   bidirezionale con Google Calendar: nessuno deve abbandonare il proprio
   calendario per adottare ORION.

E il quinto, quello che nessun concorrente ha — il **MOTORE RICAVI** (ORION
non evita solo perdite: genera incassi e lo dimostra):

5. **Riempi-buchi automatico** — a ogni disdetta lo slot viene offerto via
   WhatsApp alla lista d'attesa, uno alla volta con scadenza 45', finché
   qualcuno dice SÌ (prenotato, notificato, tracciato). **Richiami dormienti**
   — ORION trova i clienti spariti da mesi, scrive messaggi personalizzati e
   li invia dopo conferma. **Report del valore** — a fine mese quantifica in
   euro quanto ha portato (chiamate gestite, prenotazioni, buchi riempiti,
   no-show evitati, stima prudente sul prezzo medio reale): è l'argomento di
   rinnovo che si scrive da solo, e la metrica dei pilot già automatizzata.

Trasversali: **fiducia** (audit log di ogni azione automatica, disclosure AI
nelle interazioni coi clienti, cifratura a riposo dei segreti) ed **economia**
(routing dei modelli: operatività al modello rapido, intelligenza piena dove
serve).

## Pricing (ipotesi da validare nei pilot)

- **ORION Studio** — 99 €/mese: tutto incluso, 1 professionista, centralino
  fino a ~200 chiamate/mese.
- **ORION Studio+** — 149 €/mese: più chiamate, più numeri, modalità team
  leggera (segreteria condivisa).
- Argomento di vendita, in una riga: *"meno di un decimo di una segretaria
  part-time; si ripaga con 2 no-show evitati e 3 chiamate recuperate al mese"*.

## Go-to-market (in quest'ordine)

1. **10 studi pilota** (gratis 3 mesi contro feedback settimanale e
   testimonianza): 4 psicologi, 3 fisioterapisti, 2 nutrizionisti, 1
   poliambulatorio. Obiettivo: usarlo TUTTI i giorni. Il segnale di verità:
   ti chiamano quando si rompe = hai un'azienda; li rincorri tu = il mercato
   ha risposto.
2. Landing verticale ("La segretaria AI per psicologi" — una per professione,
   stesso prodotto) + demo video di 60 secondi: una chiamata vera gestita dal
   centralino, dall'inizio alla notifica push.
3. Canali: passaparola dei pilot, ordini/associazioni di categoria, gruppi
   professionali, i commercialisti DEI pilot (vedono le fatture pulite
   arrivare da sole → diventano canale).

## Cosa resta CONGELATO (non cancellato) fino a trazione

Gesti, visione continua, sport/finanza/notizie, creative workspace
(Blender/VS Code), modalità azienda estesa. Sono demo spettacolari ma non
spostano un euro nel verticale scelto: si riaccendono quando i numeri ci sono.
Il codice resta nel repo; semplicemente non si raccontano e non si sviluppano.

## Fonti principali (ricerca luglio 2026)

- Rapporto Istat 2026 / Statreport ICT — adozione AI e barriera competenze
- Osservatorio Professionisti e Innovazione Digitale (PoliMi) — spesa digitale per categoria
- TeamSystem (Be Leader 2026, acquisizione Normo.ai) — pressione competitiva sui commercialisti
- CiaoDott, Ideandum GAIA, XDENT AIDA, VocalMed — domanda provata di receptionist AI sanitari
- AI Act: applicazione generale e sanzioni dal 2/8/2026 — obblighi di trasparenza del deployer
- Garante Privacy: ispezioni 2026 su AI e dati sanitari; provvedimento 12/02/2026
