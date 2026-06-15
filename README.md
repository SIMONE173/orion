# ORION

Il primo **Sistema Operativo Conversazionale** per professionisti.

ORION non è un software con dentro una chat: è un assistente — una segretaria
personale altamente competente — con dentro un software. L'utente non impara a
usarlo: gli parla. ORION capisce, organizza, mostra, prepara ed esegue.

Interfaccia **vocale prima** (stile Jarvis): un nucleo animato al centro, lo
tocchi e parli. Le risposte sono lette ad alta voce e i **pannelli compaiono in
base a ciò che ORION fa** (agenda, scheda cliente, incassi, WhatsApp, fattura…),
quasi a tutto schermo (focus totale) o in split dinamico.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4**
- **SQLite** (`better-sqlite3`) — single-tenant, nessuna autenticazione
- **Claude** (`claude-opus-4-8`) con *tool use* come cervello conversazionale
- **Web Speech API** (it-IT) per riconoscimento e sintesi vocale (lato browser)

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
   Rossi"_, _"Rossi ha pagato 80 euro in contanti"_, _"prepara un WhatsApp per
   Bianchi per spostare l'appuntamento"_, _"quanto ho incassato questo mese?"_.

   **Nessun comando da imparare.** ORION capisce l'_intenzione_, non parole
   chiave. _"Metti Rossi martedì alle 15"_, _"prenota Rossi martedì alle tre"_ e
   _"segnami Rossi per martedì alle 15"_ fanno la stessa cosa. Se manca un dato
   (l'ora) propone uno slot libero invece di inventarlo; se il nome è ambiguo
   (due "Rossi") chiede _quale_; se l'intenzione è incerta su un'azione
   importante, fa una domanda breve invece di indovinare.
3. **Azioni critiche con conferma.** Invio di WhatsApp ed emissione fatture
   passano sempre per un'anteprima + conferma esplicita.

## Funzioni

- **Agenda** — crea/sposta/elimina, rileva conflitti, trova slot liberi, lista d'attesa per riempire i buchi.
- **Clienti** — schede complete (appuntamenti, pagamenti, comunicazioni, note).
- **Note & promemoria** — appunti dettati e cose da ricordare (richiami, scadenze, commercialista…).
- **Pagamenti & analisi economica** — incassi per metodo, clienti top, giorno più redditizio, da incassare.
- **Fatture** — anteprima precompilata dai dati fiscali → conferma → emissione, con **PDF scaricabile**.
- **WhatsApp** — l'utente detta, ORION formalizza, mostra la bozza, conferma e invia.
- **Documenti** — "digitalizza questo documento": fotocamera → ORION legge l'immagine (vision),
  ricostruisce il testo, archivia e genera un **PDF**.
- **Chiamate** — "Chiama Rossi" apre il pannello chiamata.
- **Briefing & analisi proattiva** — all'avvio il riepilogo della giornata; su richiesta ORION
  segnala non confermati, pagamenti mancanti, clienti inattivi, buchi in agenda e propone azioni.

## Cosa è reale e cosa è simulato

- **Reale:** agenda, clienti, note, promemoria, pagamenti, analisi economica, fatture (+PDF),
  documenti (+PDF), lista d'attesa, analisi proattiva — tutto su SQLite.
- **Vision:** la lettura/OCR dei documenti usa Claude (richiede la chiave API).
- **WhatsApp:** **reale** se configuri la WhatsApp Business Cloud API (vedi
  [WHATSAPP.md](WHATSAPP.md)) — invio, ricezione e allegati (foto/PDF/audio)
  visualizzabili in ORION. Senza configurazione resta **simulato** (registrato nel
  DB); puoi simulare un messaggio in arrivo via `POST /api/whatsapp/simula`.
- **Osservazione continua:** mentre l'app è aperta ORION controlla ogni ~90s e ti
  avvisa ("Rossi ha risposto"). È sola lettura del DB → non consuma crediti.
- **Chiamate:** link `tel:` (su telefono chiama davvero; su desktop è dimostrativo).
- **Non ancora implementati** (richiedono infrastruttura esterna): consegna dei
  promemoria ad app chiusa (serve un server sempre acceso + push/email), telefonia
  VoIP integrata, auth/multi-tenant.

## Reset

Il database demo si rigenera da solo. Per azzerarlo: elimina `data/orion.db`.

## Struttura

```
src/
  app/
    page.tsx              # orchestratore: voce + conversazione + pannelli
    api/chat/route.ts     # loop conversazionale con tool use
    api/state/route.ts    # stato iniziale (onboarding, chiave)
  lib/
    db.ts                 # schema SQLite + seed demo
    data.ts               # accesso ai dati (logCommunication = punto WhatsApp)
    orion/
      system.ts           # personalità e regole di ORION
      tools.ts            # strumenti che ORION può eseguire
      client.ts           # chiamata a Claude + ciclo tool use
      views.ts            # tipi dei pannelli
  components/
    OrionCore.tsx         # nucleo animato
    PanelStage.tsx        # disposizione dei pannelli (focus totale / split)
    useSpeech.ts          # STT + TTS (Web Speech API)
    panels/               # agenda, cliente, clienti, note, pagamenti, whatsapp, briefing, fattura
```
