# ORION

**La segretaria AI degli studi su appuntamento.**

Risponde al telefono quando non puoi, prenota, manda i promemoria che azzerano
i no-show, tiene i conti, emette fatture elettroniche vere (SDI) e vive nel
calendario che già usi. Non la impari: le parli.

> Posizionamento, verticale e piano: [STRATEGIA.md](STRATEGIA.md) · prossimi
> passi: [ROADMAP.md](ROADMAP.md)

ORION non è un software con dentro una chat: è un assistente — una segretaria
personale altamente competente — con dentro un software. Interfaccia **vocale
prima** (stile Jarvis): un nucleo animato al centro, lo tocchi e parli. Le
risposte sono lette ad alta voce e i **pannelli compaiono in base a ciò che
ORION fa** (agenda, scheda cliente, incassi, WhatsApp, fattura…).

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4**
- **SQLite** (`better-sqlite3`) — multi-tenant (auth con sessioni), Stripe per gli abbonamenti
- **Claude** con *tool use* come cervello (routing: modello pieno + modello rapido)
- **Web Speech API** (it-IT) per riconoscimento e sintesi vocale (lato browser)
- Integrazioni via REST puro (niente SDK): WhatsApp Cloud API, Twilio Voice,
  Google Calendar, provider SDI

## Avvio

```bash
npm install
cp .env.local.example .env.local   # poi inserisci la tua ANTHROPIC_API_KEY
npm run dev
```

Apri http://localhost:3000 — **in Chrome** per la voce (Web Speech API).
Senza chiave API l'interfaccia parte ugualmente, ma ORION non potrà rispondere.

## Come funziona

1. **Chiamata 0 (onboarding).** Alla prima apertura ORION conduce una
   conversazione naturale per conoscere il professionista (nome, professione,
   abitudini, dati fiscali…). Salva tutto nella *memoria operativa*.
2. **Uso quotidiano.** All'avvio ORION saluta e presenta il **briefing** della
   giornata. Poi basta chiedere: _"mostrami l'agenda"_, _"apri la scheda di
   Rossi"_, _"Rossi ha pagato 80 euro in contanti"_, _"chi ha chiamato?"_,
   _"quanto ho incassato questo mese?"_.

   **Nessun comando da imparare.** ORION capisce l'_intenzione_, non parole
   chiave. Se manca un dato propone (es. uno slot libero) invece di inventare;
   se il nome è ambiguo chiede _quale_.
3. **Azioni critiche con conferma.** Invio di WhatsApp ed emissione fatture
   passano sempre per un'anteprima + conferma esplicita.

## I quattro pilastri (quelli che fanno guadagnare tempo e soldi)

- **Centralino AI** — risponde al numero dello studio 24/7 (Twilio): si
  presenta come assistente virtuale (AI Act), prenota SOLO su slot liberi,
  prende messaggi, ti notifica con una push. "Chi ha chiamato?" → te lo dice.
  → [TELEFONO.md](TELEFONO.md)
- **Anti no-show** — promemoria WhatsApp automatico prima di ogni appuntamento;
  il cliente risponde SÌ e l'appuntamento si conferma da solo; risponde NO e ti
  arrivano richiamo + notifica (non cancella mai da solo).
- **Fatture elettroniche vere** — XML **FatturaPA 1.2**: forfettario (N2.2 +
  bollo automatico), ordinario (IVA), trasmissione SDI via provider API, XML
  scaricabile. E la regola che i software generici sbagliano: le prestazioni
  sanitarie a persone fisiche **non passano dallo SDI** — ORION lo rileva da
  solo. → [FATTURE.md](FATTURE.md)
- **Google Calendar bidirezionale** — "collega il mio calendario": ciò che
  prenoti (tu o il centralino) appare su Google; ciò che metti su Google blocca
  gli slot in ORION. → [CALENDARIO.md](CALENDARIO.md)

## Il resto della segretaria

- **Agenda** — crea/sposta/elimina, conflitti, slot liberi, lista d'attesa.
- **Clienti** — schede complete (appuntamenti, pagamenti, comunicazioni, note).
- **Note & promemoria** — appunti dettati, richiami, scadenze; consegna anche
  ad app chiusa (push + cron in produzione).
- **Pagamenti & analisi economica** — incassi per metodo, clienti top, da incassare.
- **WhatsApp** — l'utente detta, ORION formalizza, bozza → conferma → invio
  (Cloud API reale o Embedded Signup per il numero dello studio).
- **Email** — collega IMAP/SMTP: triage, riassunti, bozze, invio con conferma.
- **Documenti** — fotocamera → OCR (vision) → archivio + PDF.
- **Briefing & analisi proattiva** — riepilogo del giorno, non confermati,
  pagamenti mancanti, buchi in agenda, preparazione per domani.
- **Memoria viva** — ORION impara abitudini, regole ed eccezioni (con il
  perché) e le consolida ogni giorno.
- **Fiducia** — log di **audit** di ogni azione automatica (telefono,
  promemoria, fatture, invii), disclosure AI verso i clienti (AI Act),
  segreti **cifrati a riposo**.
- **Economia** — routing dei modelli: richieste operative brevi → modello
  rapido (~10-20× più economico); onboarding, analisi e scrittura → modello
  pieno. `ORION_ROUTING=off` per disattivare.

## Cosa è reale e cosa è simulato

- **Reale (su SQLite):** agenda, clienti, note, promemoria, pagamenti, analisi,
  fatture (+XML FatturaPA +PDF), documenti, lista d'attesa, memoria, audit,
  registro chiamate, auth/multi-tenant, abbonamenti Stripe.
- **Reale se configuri le chiavi (altrimenti degrado con garbo):**
  - WhatsApp → [WHATSAPP.md](WHATSAPP.md) (senza: simulato, `POST /api/whatsapp/simula`)
  - Centralino → [TELEFONO.md](TELEFONO.md) (senza Twilio: `POST /api/telefono/simula`)
  - Trasmissione SDI → [FATTURE.md](FATTURE.md) (senza provider: XML pronto, `da_trasmettere`)
  - Google Calendar → [CALENDARIO.md](CALENDARIO.md)
- **Promemoria automatici:** il cron interno gira ogni ~15' (in produzione
  sempre; in locale finché l'app è accesa). Anti no-show attivo di default con
  WhatsApp configurato (orario di cortesia 8–21, `ORION_REMINDER_ORE`).
- **Chiamate in uscita:** link `tel:` (su telefono chiama davvero).
- **In pausa (congelati, non cancellati):** modalità gesti, visione continua,
  creative workspace, pannelli sport/finanza/notizie — vedi STRATEGIA.md.

## Deploy

Guida Railway in [DEPLOY.md](DEPLOY.md) (HTTPS pubblico necessario per i
webhook di WhatsApp e Twilio e per il cron sempre attivo).

## Reset

Il database demo si rigenera da solo. Per azzerarlo: elimina `data/orion.db`.

## Struttura

```
src/
  app/
    page.tsx                    # orchestratore: voce + conversazione + pannelli
    api/chat/route.ts           # loop conversazionale con tool use
    api/cron/run/route.ts       # promemoria, anti no-show, sync calendario
    api/telefono/…              # centralino AI (webhook Twilio, stato, simula)
    api/calendario/…            # OAuth Google (connect, callback)
    api/whatsapp/…              # webhook, connect (Embedded Signup), simula
    api/fattura/xml/route.ts    # download XML FatturaPA
  lib/
    db.ts                       # schema SQLite (migrazioni additive) + seed
    data.ts                     # accesso dati multi-tenant
    telefono.ts                 # cervello del centralino (modello rapido, tool ristretti)
    fatturapa.ts                # XML FatturaPA 1.2 (forfettario/ordinario/sanitaria)
    sdi.ts                      # adapter trasmissione SDI (provider API)
    gcal.ts                     # sync bidirezionale Google Calendar
    whatsapp.ts                 # adapter WhatsApp Cloud API
    crypto.ts                   # cifratura a riposo dei segreti
    orion/
      system.ts                 # personalità e regole di ORION
      tools.ts                  # strumenti che ORION può eseguire
      client.ts                 # ciclo tool use + routing dei modelli
      views.ts                  # tipi dei pannelli
  components/                   # nucleo animato, pannelli, voce (STT/TTS)
```
