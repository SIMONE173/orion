# Attivare WhatsApp reale

Di default WhatsApp è **simulato** (i messaggi sono solo registrati nel DB).
Per renderlo reale serve la **WhatsApp Business Cloud API** di Meta. Il codice è
già pronto: devi solo creare l'accesso e incollare 3 variabili.

## La parte che fai tu (una volta)

1. Vai su [developers.facebook.com](https://developers.facebook.com/) → crea
   un'app di tipo **Business** e aggiungi il prodotto **WhatsApp**.
2. Nella sezione WhatsApp → **API Setup** trovi:
   - un **numero di test** già pronto (per provare subito), oppure collega un tuo
     numero dedicato (non deve essere già attivo sulla WhatsApp normale);
   - il **Phone number ID** → mettilo in `WHATSAPP_PHONE_NUMBER_ID`;
   - un **token** temporaneo (24h) per i test, o genera un **token permanente**
     da un utente di sistema → mettilo in `WHATSAPP_TOKEN`.
3. Scegli tu una stringa qualsiasi come **verify token** (es. `orion-2026`) e
   mettila in `WHATSAPP_VERIFY_TOKEN`.
   **Firma dei webhook (obbligatoria in produzione):** copia l'**App Secret**
   dell'app Meta (Impostazioni → Di base) e mettilo in `META_APP_SECRET`.
   ORION verifica `X-Hub-Signature-256` sul corpo di ogni webhook: senza
   segreto, in produzione i webhook vengono rifiutati (fail-closed).
4. **Webhook:** in fase di test l'app gira su `localhost`, che Meta non può
   raggiungere. Esponi la porta con un tunnel:
   ```bash
   npx ngrok http 3000
   ```
   Poi in Meta → WhatsApp → **Configuration → Webhook**:
   - Callback URL: `https://<tuo-ngrok>.ngrok-free.app/api/whatsapp/webhook`
   - Verify token: lo stesso di `WHATSAPP_VERIFY_TOKEN`
   - Sottoscrivi il campo **messages**.
5. Per i messaggi che parti **tu** verso un cliente fuori dalla finestra di 24h,
   Meta richiede **template approvati** (li crei nel Business Manager). Le
   risposte entro 24h da un messaggio del cliente sono libere.

## La parte già fatta (codice)

- Invio reale: `src/lib/whatsapp.ts` (`inviaMessaggioWhatsApp`), agganciato allo
  strumento `invia_whatsapp`. Se le variabili non ci sono → resta simulato.
- Ricezione + allegati: `src/app/api/whatsapp/webhook/route.ts` registra i
  messaggi in arrivo, associa il cliente dal numero e scarica gli allegati.
- ORION ti avvisa ("Rossi ha risposto") tramite l'osservazione continua.

## Provare SENZA WhatsApp (subito)

Puoi simulare un messaggio in arrivo per vedere la notifica e gli allegati:

```bash
# messaggio di testo
curl -X POST localhost:3000/api/whatsapp/simula \
  -H 'content-type: application/json' \
  -d '{"cliente_nome":"Marco Rossi","testo":"Confermo per martedì, grazie!"}'
```

Entro ~90s (o riaprendo l'app) ORION mostrerà "Marco Rossi ha risposto".
