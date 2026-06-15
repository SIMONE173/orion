# Mettere ORION online (Railway)

Obiettivo: un URL pubblico HTTPS sempre acceso. Serve per:
- usare ORION da qualsiasi dispositivo,
- ricevere i messaggi WhatsApp (il webhook di Meta deve poter raggiungere ORION),
- far girare i promemoria automatici (cron).

Il database resta **SQLite** su un **disco persistente** (niente migrazioni).

## 1. Codice su GitHub
Railway fa il deploy da un repo GitHub.
```bash
git init && git add -A && git commit -m "ORION"
# crea un repo vuoto su github.com, poi:
git remote add origin https://github.com/<tuo-utente>/orion.git
git push -u origin main
```
(`.env.local` e `data/` sono già in `.gitignore`: chiavi e database non vengono caricati.)

## 2. Progetto su Railway
1. Vai su [railway.app](https://railway.app), accedi con GitHub, **New Project → Deploy from GitHub repo** → scegli `orion`.
2. Railway rileva Next.js e builda da solo (installa anche il modulo nativo SQLite).

## 3. Disco persistente per il database
1. Nel servizio → **Variables**: aggiungi `DATA_DIR = /data`.
2. → **Volumes**: crea un volume montato su **`/data`**.
   Così `orion.db` vive lì e non si perde a ogni deploy.

## 4. Variabili d'ambiente
Nel servizio → **Variables**, incolla:
```
ANTHROPIC_API_KEY=sk-ant-...        # il cervello (obbligatoria)
DATA_DIR=/data                      # database persistente

# WhatsApp (quando lo attivi — vedi WHATSAPP.md)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
```
(Le variabili di Stripe, notifiche push e fattura SDI le aggiungeremo man mano che attiviamo quelle funzioni.)

## 5. Dominio pubblico
Servizio → **Settings → Networking → Generate Domain**. Ottieni un URL tipo
`https://orion-production.up.railway.app`. Quello è il tuo ORION online.

## 6. Collega WhatsApp
Nel webhook di Meta usa: `https://<tuo-dominio>/api/whatsapp/webhook`
(dettagli in [WHATSAPP.md](WHATSAPP.md)).

---

**Nota voce/microfono/fotocamera:** funzionano perché Railway serve in **HTTPS**
(le API del browser le richiedono). In locale funziona solo su `localhost`.
