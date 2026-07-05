# ORION — Guida alla "Chiamata 0" (il colloquio iniziale)

La **chiamata 0** è il primo colloquio: ORION ti intervista **una domanda alla
volta**, ragiona sulle risposte e costruisce il tuo ambiente. NON è un form: le
domande esatte e il loro ordine possono variare un po'. Qui sotto trovi, per ogni
profilo, **cosa ti chiederà (più o meno)** e **cosa rispondere**, con dati finti
pronti da sostituire con i tuoi.

> Come si parla: rispondi **a voce** o in chat come parleresti a una segretaria
> nuova — frasi naturali, non "comandi". Dai del tu o del lei: ORION rispecchia
> il tuo registro. Rispondi UNA cosa alla volta e aspetta la domanda dopo.

Dopo ogni script c'è **"✅ Cosa verificare a fine colloquio"**: se qualcosa non
torna, segnalo nella tabella `Valutazione-StressTest.xlsx` (test della serie M/N).

---

## Account usa-e-getta per i test

La registrazione di ORION **non manda mail di verifica** (serve solo una `@` e
una password di almeno 6 caratteri), quindi questi indirizzi inventati vanno
benissimo — non esistono davvero e non ricevono nulla.

| Uso | Email | Password |
|---|---|---|
| **Profilo A** — studio professionista | `studio@test.orion` | `B35vCMTNIT` |
| **Profilo B / Account 1** — titolare | `titolare@mbserramenti.test` | `W6i0ZM5HjL` |
| **Profilo B / Account 2** — collaboratore (Paolo) | `paolo@mbserramenti.test` | `axFBBgHtoe` |
| **Terzo account** — estraneo (test isolamento H1/Q1) | `estraneo@altra.test` | `B3fLUmRjV1` |

Note:
- Il **terzo account** serve per i test bloccanti di isolamento (H1 e Q1): non
  deve vedere nulla degli altri due ambienti.
- Valgono sia in locale sia in produzione, ma **ogni ambiente ha il suo DB**: se
  ti registri in locale, in produzione l'account non esiste (e viceversa).
- Se un giorno ti servissero email che ricevono davvero (non serve per questi
  test), usa il trucco del `+` di Gmail: `simone07intake+studio@gmail.com`,
  `simone07intake+titolare@gmail.com`… — per ORION sono account diversi, ma la
  posta arriva tutta nella tua casella vera.
- Reset totale quando vuoi ripartire da zero: elimina `data/orion.db` e riavvia.

---

## PROFILO A — Studio da professionista (autonomo)

Esempio: **fisioterapista con studio**. Puoi sostituire la professione (medico,
avvocato, commercialista, personal trainer, elettricista…): cambiano solo le
risposte "professione", "durata/struttura" e "dati fiscali".

Prima: crea un **account nuovo** e fai partire la sessione (ORION saluta e apre
il colloquio con la prima domanda).

| # | ORION ti chiede (circa) | Tu rispondi (esempio) |
|---|---|---|
| 1 | Come preferisci essere chiamato? | «Chiamami Simone.» (o «Dottor Rossi») |
| 2 | Vuoi usare ORION anche per il tuo lavoro? | «Sì.» |
| 3 | Sei un professionista autonomo o vuoi integrarlo in un'azienda/team? | «Professionista autonomo.» |
| 4 | Che lavoro fai? | «Sono fisioterapista, ho uno studio mio.» |
| 5 | *(propone una struttura di settore: agenda sedute, pazienti, schede…)* Va bene come punto di partenza? | «Sì, va bene. Aggiungerei le schede di trattamento per paziente.» |
| 6 | Che orari fai? Giorni con regole particolari? | «Lunedì–venerdì 9–19. Il mercoledì chiudo alle 13. Sabato e domenica no.» |
| 7 | Quanto durano le sedute? | «Le sedute durano 45 minuti; la prima visita un'ora.» |
| 8 | Preferenze su come organizzi la giornata? | «Le prime visite le preferisco al mattino: lì ho più lucidità per valutare.» |
| 9 | Come gestisci le urgenze? | «Se è urgente e ho un buco in giornata lo incastro, altrimenti richiamo io appena posso.» |
| 10 | Cosa posso decidere da solo e cosa devo confermarti? *(limiti di autonomia)* | «Prendere e spostare appuntamenti su orari liberi puoi farlo da solo. Disdette, fatture e messaggi ai pazienti chiedimi sempre conferma prima.» |
| 11 | Come vuoi essere aggiornato durante la giornata? | «La mattina fammi il briefing; avvisami subito se un paziente non conferma o disdice.» |
| 12 | Cosa ti fa perdere più tempo? | «Rispondere al telefono mentre tratto i pazienti, e ricordarmi di richiamare chi è sparito.» |
| 13 | *(con calma)* I dati per le fatture? | «Regime forfettario. P.IVA 01234567890, codice fiscale RSSMRA85M01F205X. Studio in Via Roma 10, 20121 Milano.» |
| 14 | Usi già software o gestionali? | «Sì, un gestionale per le schede dei pazienti, si chiama FisioManager.» *(→ lo registra con collega_sistema)* |
| 15 | *(riassunto finale + "iniziamo?")* | «Perfetto, iniziamo.» |

**✅ Cosa verificare a fine colloquio**
- Ha fatto **una domanda alla volta**, non raffiche né un questionario.
- Ha **proposto una struttura** sensata da fisioterapista (agenda/sedute/pazienti).
- Il **riassunto finale** rispecchia ciò che hai detto (orari, prime visite al
  mattino *col perché*, limiti di autonomia, forfettario).
- Da qui in poi conosce già queste cose senza richiedertele.
- Da qui puoi lanciare i test **A–L** dello `STRESS-TEST.md` (agenda, centralino,
  anti no-show, riempi-buchi, fatture, calendario, sicurezza…).

**Dati finti pronti (sostituiscili):**
- P.IVA: `01234567890` · CF: `RSSMRA85M01F205X` · Indirizzo: `Via Roma 10, 20121 Milano`
- Clienti di prova (creali dopo, con telefono VERO tuo/di complici per vedere i
  WhatsApp arrivare): `Bianchi`, `Verdi`, `Rossi` (fai **due** "Rossi" per il
  test omonimi A3).

---

## PROFILO B — Azienda a 2 account

Simuli un'azienda vera con **due persone**: il **titolare** (Account 1, fa la
configurazione completa e ottiene il **codice aziendale**) e un **collaboratore**
(Account 2, entra col codice e configura solo sé stesso). Esempio: **"MB
Serramenti"** — produzione e posa di serramenti/infissi. Sostituibile con la tua
azienda.

### Account 1 — TITOLARE (configurazione completa)

Crea il **primo account** e avvia il colloquio.

| # | ORION ti chiede (circa) | Tu rispondi (esempio) |
|---|---|---|
| 1 | Come preferisci essere chiamato? | «Simone.» |
| 2 | Vuoi usare ORION per il lavoro? | «Sì.» |
| 3 | Autonomo o azienda/team? | «Abbiamo un'azienda, voglio integrarlo nel team.» |
| 4 | Identità: nome, settore, dimensioni, sedi? | «Ci chiamiamo MB Serramenti. Produciamo e installiamo serramenti e infissi. Siamo in 8, una sede a Milano con l'officina.» |
| 5 | Struttura: reparti, ruoli, responsabili? | «Io sono il titolare. Paolo è il responsabile di produzione, coordina l'officina. Marco è installatore. Giulia segue amministrazione e fatture.» |
| 6 | Chi è autorizzato a cosa? *(autorizzazioni)* | «I preventivi sopra 5.000 euro li approvo io. Paolo può riorganizzare la produzione da solo.» |
| 7 | Come nasce e scorre il lavoro? *(processi)* | «Il cliente chiede un preventivo, facciamo un sopralluogo, poi l'ordine, la produzione in officina e infine la posa. Ogni lavoro ha un numero di commessa.» |
| 8 | Quali informazioni/documenti contano di più? | «Le commesse, i preventivi e le date di consegna promesse ai clienti.» |
| 9 | Come comunicate? | «Coi clienti email e WhatsApp; coi fornitori telefono.» |
| 10 | Usate software/gestionali/CRM? | «Sì, un gestionale per commesse e magazzino, si chiama GesCom, e la fatturazione con un altro programma.» *(→ collega_sistema, uno per uno)* |
| 11 | Regole di autonomia: cosa posso fare da solo? | «Assegnare compiti e sollecitare i ritardi puoi farlo. Ma se devi toccare una consegna già promessa a un cliente, chiedimi conferma.» |
| 12 | *(riassunto + comunica il CODICE AZIENDALE)* | «Perfetto.» **→ ANNOTA IL CODICE** (es. `ORION-AB12CD`). |

**✅ Cosa verificare (Account 1)**
- Colloquio **dinamico**, una domanda alla volta (non un form).
- Ha costruito **identità + organigramma + processi + regole di autonomia**.
- Ha **registrato i sistemi** (GesCom…) quando li hai nominati.
- A fine colloquio ti ha dato **un codice aziendale chiaro** e spiegato che i
  collaboratori lo useranno per entrare nello stesso ambiente. **← ANNOTALO.**
- Prova subito: «mostrami l'organigramma» (mostra_organico), «cosa sai
  dell'azienda» (mostra_memoria), «che sistemi ho collegato» (mostra_sistemi).

### Account 2 — COLLABORATORE (entra col codice)

**Esci** dall'account del titolare e crea un **secondo account** (email diversa).
Avvia il colloquio: ORION parte come per un nuovo utente.

| # | ORION ti chiede (circa) | Tu rispondi (esempio) |
|---|---|---|
| 1 | Come preferisci essere chiamato? | «Paolo.» |
| 2 | Vuoi usare ORION per il lavoro? | «Sì.» |
| 3 | Autonomo o azienda/team? | «Faccio parte di un'azienda che usa già ORION, ho il codice.» |
| 4 | Qual è il codice? | «`ORION-AB12CD`.» *(→ collega_azienda: ti aggancia allo stesso ambiente)* |
| 5 | *(onboarding ridotto)* Qual è il tuo ruolo/reparto? | «Responsabile di produzione, seguo l'officina.» |
| 6 | Come vuoi essere aggiornato? | «A inizio turno, e avvisami subito sui compiti in ritardo dell'officina.» |
| 7 | Abitudini personali? | «Preferisco vedere prima le consegne in scadenza questa settimana.» |
| 8 | *(chiude e propone di iniziare)* | «Andiamo.» |

**✅ Cosa verificare (Account 2)**
- Col codice entra **nello stesso ambiente**: vede clienti/commesse/organigramma
  e la **memoria condivisa** già configurata dal titolare (non riparte da zero).
- **NON rifà** la configurazione aziendale: chiede solo nome/ruolo/preferenze.
- Le sue **preferenze personali** restano sue (salva_preferenze), non finiscono
  nella memoria condivisa del titolare.
- **Esperienza per ruolo**: al titolare il briefing dà la visione d'insieme; a
  Paolo (responsabile) il suo reparto/compiti.

### Prove incrociate (i due account insieme)

Da fare alternando i due login — sono i test **N/O** dell'xlsx:
1. **Dal titolare**: «assegna a Paolo il controllo della commessa 245, aggiornami
   ogni due giorni» (assegna_compito). **Da Paolo**: «cosa devo fare?»
   (mostra_compiti) → deve vedere quel compito.
2. **Da Paolo**: «sto chiudendo il turno: fatto il taglio dei profili, resta il
   montaggio della 245, problema col fornitore vetri» (passa_consegne).
   **Dal titolare** (o Paolo al turno dopo): all'avvio ORION **riprende** quella
   consegna.
3. **Isolamento**: crea un **TERZO account** con un'azienda diversa (o senza
   codice): NON deve vedere nulla di MB Serramenti. **[BLOCCANTE]**
4. **Verbale**: «prendi appunti, siamo in riunione» → detta 2-3 decisioni e
   scadenze → «chiudi il verbale» (verbale_riunione): deve estrarre decisioni,
   attività e scadenze e crearne i compiti.

---

## Promemoria operativi per i test

- **Reset pulito**: chiudi l'app, elimina `data/orion.db`, riavvia → riparti da
  una chiamata 0 vergine.
- **Cron a mano** (promemoria, scadenze offerte, sync calendario, compiti in
  ritardo):
  ```bash
  curl -X POST http://localhost:3000/api/cron/run -H "x-orion-cron: <VAPID_PRIVATE_KEY>"
  ```
- I test **consumano crediti API veri**: vai col contagocce, ma copri tutti i
  casi **[BLOCCANTE]**.
- Compila `Valutazione-StressTest.xlsx` man mano: il verdetto si calcola da solo.
