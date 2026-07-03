# ORION — Roadmap operativa

Regola unica: **niente feature nuove finché i 4 pilastri non sono in
produzione con utenti veri.** Ogni settimana: una cosa finita > tre iniziate.

## Fase 1 — Accendere i pilastri (2–4 settimane)

Il codice c'è; qui si tratta di CONFIGURARE e provare sul campo.

- [ ] Deploy su Railway (DEPLOY.md) con dominio HTTPS stabile
- [ ] WhatsApp reale (WHATSAPP.md): numero di prova → Embedded Signup
- [ ] Centralino: account Twilio, numero italiano, webhook (TELEFONO.md);
      collaudo con `/api/telefono/simula` prima, poi chiamate vere
- [ ] SDI: account provider (A-Cube sandbox → produzione), variabili SDI_*
      (FATTURE.md); prova completa forfettario + sanitaria fuori SDI
- [ ] Google Cloud: OAuth client, variabili GOOGLE_* (CALENDARIO.md)
- [ ] Onboarding rivisto per il verticale: alla professione sanitaria ORION
      propone subito centralino + promemoria + calendario (già nel prompt)
- [ ] Backup automatico del DB (Railway volume snapshot o cron di copia)

## Fase 2 — 10 studi pilota (4–8 settimane)

- [ ] Reclutare 10 studi (psicologi/fisioterapisti/nutrizionisti)
- [ ] Setup assistito di persona/da remoto (<1 ora per studio)
- [ ] Metriche da tracciare A MANO ogni settimana per studio:
      chiamate gestite dal centralino, appuntamenti prenotati da AI,
      no-show evitati (confermati vs mancati), fatture emesse, minuti d'uso
- [ ] Feedback loop settimanale → correzioni rapide
- [ ] 3 testimonianze video + numeri veri ("il centralino mi ha recuperato
      11 appuntamenti in un mese")

**Criterio di verità di fine Fase 2:** ≥6 studi su 10 usano ORION ogni
giorno e accettano di pagare. Se no: capire il perché PRIMA di scrivere
altra ROADMAP.

## Fase 3 — Vendere (dal 3° mese)

- [ ] Prezzi attivi su Stripe (99/149) + fatturazione propria con ORION stesso
- [ ] Landing per professione + demo video 60"
- [ ] Canali: associazioni di categoria, gruppi professionali, commercialisti
      dei pilot come segnalatori
- [ ] Compliance pack scritto e scaricabile: DPA, informativa AI Act,
      registro trattamenti tipo, "dove stanno i dati" (arma di vendita)
- [ ] Obiettivo: 50 studi paganti = ~5.000 €/mese ricorrenti

## Dopo (solo con trazione)

- Migrazione DB: SQLite → Postgres/Turso (quando i tenant superano ~50)
- STT server-side (Whisper API) al posto di Web Speech su browser
- Trasmissione Sistema TS per le fatture sanitarie (oggi: emesse fuori SDI)
- Integrazione pull con 1-2 gestionali del verticale (se i pilot li usano)
- Secondo verticale (estetica avanzata? veterinari?) — stessa ricetta
- Modalità azienda spinta, e solo qui si riapre il discorso "OS cognitivo"

## Cosa NON fare (promemoria permanente)

- Non aggiungere pannelli/feature "belle" prima della trazione
- Non inseguire commercialisti/avvocati
- Non fare integrazioni su richiesta di un solo non-pagante
- Non riaccendere gesti/visione/creative-workspace fino a Fase 3 conclusa
