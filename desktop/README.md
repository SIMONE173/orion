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

## Creare gli installer scaricabili (Mac .dmg + Windows .zip)

Ogni modifica a `main.js`/`preload.js` va ricostruita in TUTTE e 4 le varianti e
ricaricata su R2 (prefisso `download/`), perché sono quelle che `/api/scarica`
serve. I nomi dei file DEVONO combaciare con `src/lib/download.ts`.

```bash
cd desktop
npm run dist            # ORION full    → dist/ORION-1.0.0-arm64.dmg
npm run dist:demo       # ORION Demo    → dist/ORION-Demo-1.0.0-arm64.dmg
npm run dist:win        # ORION full    → dist/ORION-1.0.0-win.zip   (x64, via wine)
npm run dist:demo:win   # ORION Demo    → dist/ORION-Demo-1.0.0-win.zip (x64, via wine)
```

Il build Windows gira anche da Mac: electron-builder scarica e usa wine da solo
(cache in `~/Library/Caches/electron-builder/`). Poi si caricano i 4 file nel
bucket R2 sotto `download/` (le chiavi sono in `src/lib/download.ts`); un piccolo
script con `@aws-sdk/lib-storage` e le `R2_*` di `.env.local` fa l'upload.

Per la distribuzione pubblica servono firma/notarizzazione (Apple Developer su
Mac, code signing su Windows): passo successivo. Finché è tutto NON firmato, su
Mac si sblocca con `xattr -cr "/percorso/ORION Demo.app"`.

## Note
- Carica `https://orion-production-5ddd.up.railway.app` (modificabile con `ORION_URL`).
- Microfono e notifiche sono concessi automaticamente.
- Il riconoscimento vocale (dettatura) usa l'API del browser: se in Electron
  risultasse limitato, si può usare la modalità testo; valutiamo un STT lato
  server come miglioria.
