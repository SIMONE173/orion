# Google Calendar — sync bidirezionale

Nessun professionista abbandona il proprio calendario: ORION vive DENTRO
quello che già usi. Prenoti a voce (o prenota il centralino) → l'evento
compare su Google. Metti un impegno su Google → ORION lo vede e non prenota
sopra. Allineamento a cicli di ~15 minuti (il cron già esistente).

## Setup (una volta sola, ≈15 minuti)

1. [console.cloud.google.com](https://console.cloud.google.com) → nuovo
   progetto → **API e servizi → Libreria** → abilita *Google Calendar API*.
2. **Schermata consenso OAuth**: tipo "Esterno", aggiungi il tuo utente di
   test (finché l'app non è verificata funziona per gli utenti di test).
3. **Credenziali → Crea credenziali → ID client OAuth → Applicazione web**:
   - URI di reindirizzamento: `https://<dominio>/api/calendario/callback`
     (in locale: `http://localhost:3000/api/calendario/callback`)
4. In `.env.local` / variabili Railway:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
5. In ORION, di': **"collega il mio calendario"** → si apre il consenso
   Google → fatto. Il refresh token è cifrato a riposo nel DB.

## Come si comporta il sync (motore in `src/lib/gcal.ts`)

- **ORION → Google:** appuntamenti nuovi e spostati (push); eliminati su
  ORION → cancellati su Google (lapidi).
- **Google → ORION:** eventi nuovi/spostati/cancellati entrano in agenda
  (sync incrementale con syncToken; eventi "tutto il giorno" ignorati).
- I conflitti non possono nascere: gli slot liberi si calcolano
  sull'agenda ORION, che contiene anche gli impegni tirati giù da Google.
