# Centralino AI — collegare il numero dello studio (Twilio)

Quando è collegato, alle chiamate dello studio risponde l'assistente ORION:
si presenta come AI (obbligo AI Act), prenota su slot liberi, prende messaggi,
e ti avvisa con una push. Tutto finisce nel registro chiamate ("chi ha
chiamato?" → ORION risponde).

## Come funziona (già nel codice)

- `POST /api/telefono/webhook` — riceve la chiamata (Twilio `<Gather>` speech
  it-IT), conversa col chiamante usando un modello rapido e strumenti
  RISTRETTI: disponibilità, prenota (solo slot liberi), lascia messaggio,
  chiudi. Mai dati di altri clienti.
- `POST /api/telefono/stato` — a chiamata finita chiude il registro e manda
  la push ("Il centralino ha prenotato Rossi per martedì alle 15").
- `POST /api/telefono/simula` — prova SENZA Twilio (vedi sotto).
- Il tenant si risolve dal numero chiamato (tabella `telefono_accounts`);
  in sviluppo: variabile `ORION_TELEFONO_TENANT` o primo account.

## Setup Twilio (≈20 minuti)

1. Account su twilio.com → compra un numero italiano con Voice (~1 €/mese;
   serve la verifica del bundle regolatorio italiano: indirizzo + documento).
2. ORION deve essere raggiungibile in HTTPS (Railway: vedi DEPLOY.md).
3. Nel numero → **Voice Configuration**:
   - *A call comes in*: Webhook `https://<dominio>/api/telefono/webhook` (POST)
   - *Call status changes*: `https://<dominio>/api/telefono/stato` (POST)
4. (Opz.) `TWILIO_VOICE=Polly.Bianca` in env per la voce italiana.
5. Registra il numero per il tenant: di' a ORION "il numero del centralino è
   +39…" oppure inserisci la riga in `telefono_accounts`. In sviluppo basta
   `ORION_TELEFONO_TENANT=<id utente>`.

## Provare subito senza Twilio

```bash
# saluto
curl -X POST http://localhost:3000/api/telefono/simula \
  -H 'Content-Type: application/json' -d '{"da":"+393331112233","testo":""}'

# conversazione
curl -X POST http://localhost:3000/api/telefono/simula \
  -H 'Content-Type: application/json' \
  -d '{"da":"+393331112233","testo":"buongiorno vorrei un appuntamento domani pomeriggio"}'
```

Ogni turno prosegue la stessa chiamata (stesso numero). Il risultato lo vedi
in ORION: registro chiamate, eventuale appuntamento, promemoria di richiamo.

## Costi indicativi

Numero ~1 €/mese + ~0,01 €/min + AI (modello rapido) pochi centesimi a
chiamata → una chiamata media costa ~2-4 centesimi. Un appuntamento
recuperato li ripaga ~1.000 volte.

## Regole di sicurezza già attive

- Si presenta SEMPRE come assistente virtuale (disclosure AI Act).
- Prenota solo su slot LIBERI; mai consigli medici; disdette → messaggio al
  professionista (non cancella mai da solo).
- Emergenze → invita a chiamare il 112.
- Ogni azione è nel log di audit.
