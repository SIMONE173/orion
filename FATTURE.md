# Fatturazione elettronica — come funziona in ORION

"Fammi la fattura a Rossi, 80 euro" → ORION prepara l'anteprima, ti chiede
SOLO i dati che mancano, e alla conferma emette una fattura **vera**.

## Cosa succede alla conferma

1. ORION decide il **destino** della fattura:
   - **SDI** (caso normale): genera l'XML **FatturaPA 1.2** e, se il provider
     è collegato, lo trasmette al Sistema di Interscambio.
   - **Sanitaria fuori SDI**: se sei un professionista sanitario e il cliente
     è una persona fisica (paziente), la legge VIETA l'invio allo SDI (tutela
     dei dati sanitari): ORION emette il documento con PDF, fuori SDI, come
     previsto dal flusso Sistema TS. Lo capisce da solo dalla tua professione
     e dal cliente.
2. Regimi gestiti:
   - **Forfettario (RF19)**: niente IVA, Natura N2.2 con riferimento
     normativo L.190/2014, **bollo virtuale 2 €** automatico sopra 77,47 €.
   - **Ordinario (RF01)**: IVA (default 22%, puoi dire "con IVA al 10").
3. L'XML resta salvato sulla fattura e si scarica da
   `/api/fattura/xml?id=<id>`; ogni emissione finisce nel log di audit.

## Stati della fattura

`da_trasmettere` (XML pronto, provider non collegato o invio fallito) →
`trasmessa` → `consegnata` / `scartata` (aggiornati dal provider) ·
`non_applicabile` (sanitaria fuori SDI).

## Collegare un provider SDI (per la trasmissione automatica)

Serve un intermediario API che firma e inoltra allo SDI. Consigliato per
iniziare: **A-Cube** (acubeapi.com, ha sandbox); alternative: Openapi, Aruba.

```
SDI_PROVIDER=acube
SDI_API_URL=https://api-sandbox.acubeapi.com/invoices   # poi produzione
SDI_API_KEY=<token del provider>
```

Senza queste variabili ORION genera comunque l'XML conforme e lo conserva
(`da_trasmettere`): puoi scaricarlo e trasmetterlo dal cassetto fiscale o
passarlo al commercialista. Nessun blocco.

## I dati che servono (ORION li chiede da solo se mancano)

- **Tu (emittente):** P.IVA, regime fiscale, indirizzo con CAP/comune/provincia.
- **Cliente:** codice fiscale (o P.IVA), indirizzo con CAP/comune.
  Per i pazienti (sanitaria fuori SDI) basta molto meno.

Di' a ORION "il mio indirizzo è Via Roma 1, 20100 Milano MI" o "il codice
fiscale di Rossi è RSSMRC…" e li salva lui nei posti giusti.
