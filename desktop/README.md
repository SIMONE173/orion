# ORION Desktop

App desktop (Electron) che carica ORION live e gli dà i "superpoteri" sul
computer: aprire/cercare file, lanciare app, cestinare file. Per il resto è
identica alla versione web (stesso account, stessi dati).

## Provarla subito (sviluppo)

```bash
cd desktop
npm install      # scarica Electron (la prima volta ci mette un po')
npm start        # apre la finestra ORION Desktop
```

Per puntarla a un ORION locale invece che a quello online:

```bash
ORION_URL=http://localhost:3000 npm start
```

## Cosa può fare in più rispetto al web
- **Apri file**: "apri il file budget" → lo cerca in Scrivania/Documenti/Download e lo apre.
- **Apri app**: "apri Spotify" → lancia l'app installata.
- **Cestina**: "cestina il file vecchio" → lo sposta nel Cestino (recuperabile), dopo conferma.

Le funzioni OS passano dal `preload.js` (ponte sicuro) → `main.js` (esegue
con `shell`/`fs`). La pagina riconosce di essere nel desktop via `window.orionDesktop`.

## Creare l'app scaricabile (.dmg / .exe)

```bash
npm run dist     # genera l'installer in desktop/dist/
```

Per la distribuzione pubblica servono firma/notarizzazione (Apple Developer su
Mac, code signing su Windows): è un passo successivo, non serve per provarla.

## Note
- Carica `https://orion-production-5ddd.up.railway.app` (modificabile con `ORION_URL`).
- Microfono e notifiche sono concessi automaticamente.
- Il riconoscimento vocale (dettatura) usa l'API del browser: se in Electron
  risultasse limitato, si può usare la modalità testo; valutiamo un STT lato
  server come miglioria.
