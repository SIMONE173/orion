const { app, BrowserWindow, ipcMain, shell, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");
const whisper = require("./whisper");

// ORION live: l'app desktop carica lo stesso ORION del web (stessi dati/account)
// e aggiunge il "ponte" verso il sistema operativo. Si può sovrascrivere con
// la variabile ORION_URL (utile per puntare al localhost in sviluppo).
const ORION_URL = process.env.ORION_URL || "https://orion-production-5ddd.up.railway.app";

// Cartelle in cui cercare i file dell'utente (no scansione dell'intero disco).
const CARTELLE = [
  os.homedir(),
  path.join(os.homedir(), "Desktop"),
  path.join(os.homedir(), "Documents"),
  path.join(os.homedir(), "Downloads"),
  path.join(os.homedir(), "Pictures"),
];

function creaFinestra() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 420,
    backgroundColor: "#05070d",
    title: "ORION",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Concedi microfono/notifiche (servono a voce e push) senza prompt continui.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));

  win.loadURL(ORION_URL);
  return win;
}

// Apre una VISTA (pannello: agenda, mappa, notizie, ecc.) in una finestra separata.
// Richiesto solo su desktop: la finestra principale resta sul "nucleo".
function apriFinestraVista(vista) {
  const win = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 360,
    backgroundColor: "#070b12",
    title: "ORION",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(`${ORION_URL}/pannello`);
  // Mando la vista appena la pagina è pronta (il preload la bufferizza se arriva prima).
  win.webContents.on("did-finish-load", () => {
    win.webContents.send("orion:vista", vista);
  });
  return win;
}

ipcMain.on("os:apriVista", (_e, vista) => {
  apriFinestraVista(vista);
});

app.whenReady().then(() => {
  creaFinestra();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) creaFinestra();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── Ricerca file: scansione superficiale (profondità limitata) delle cartelle utente ──
function cercaFile(query, limite = 1) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return [];
  const trovati = [];
  const visitate = new Set();

  const scava = (dir, profondita) => {
    if (trovati.length >= limite || profondita > 4 || visitate.has(dir)) return;
    visitate.add(dir);
    let voci = [];
    try {
      voci = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const v of voci) {
      if (trovati.length >= limite) return;
      if (v.name.startsWith(".")) continue;
      const p = path.join(dir, v.name);
      if (v.isFile() && v.name.toLowerCase().includes(q)) {
        trovati.push(p);
      } else if (v.isDirectory() && !["node_modules", "Library"].includes(v.name)) {
        scava(p, profondita + 1);
      }
    }
  };

  for (const base of CARTELLE) {
    if (trovati.length >= limite) break;
    scava(base, 0);
  }
  return trovati;
}

// Apri un file/cartella trovato per nome.
ipcMain.handle("os:apriFile", async (_e, query) => {
  const [trovato] = cercaFile(query, 1);
  if (!trovato) return { ok: false, errore: "non trovato" };
  const err = await shell.openPath(trovato);
  return err ? { ok: false, errore: err } : { ok: true, percorso: trovato, nome: path.basename(trovato) };
});

// Cestina (sposta nel cestino, recuperabile) un file trovato per nome.
ipcMain.handle("os:cestina", async (_e, query) => {
  const [trovato] = cercaFile(query, 1);
  if (!trovato) return { ok: false, errore: "non trovato" };
  try {
    await shell.trashItem(trovato);
    return { ok: true, percorso: trovato, nome: path.basename(trovato) };
  } catch (err) {
    return { ok: false, errore: String(err) };
  }
});

// Riconoscimento vocale offline: prepara il modello (scarica la prima volta).
ipcMain.handle("os:sttPronto", async () => {
  try {
    await whisper.getTranscriber();
    return { ok: true };
  } catch (err) {
    return { ok: false, errore: String(err) };
  }
});

// Trascrive audio PCM (Float32 mono 16kHz) → testo.
ipcMain.handle("os:trascrivi", async (_e, pcm) => {
  try {
    const float32 = pcm instanceof Float32Array ? pcm : new Float32Array(pcm);
    if (!float32.length) return { ok: false, errore: "audio vuoto" };
    const testo = await whisper.trascrivi(float32);
    return { ok: true, testo };
  } catch (err) {
    return { ok: false, errore: String(err) };
  }
});

// Lancia un'app installata per nome.
ipcMain.handle("os:apriApp", async (_e, nome) => {
  const n = String(nome || "").trim();
  if (!n) return { ok: false, errore: "nome mancante" };
  try {
    if (process.platform === "darwin") {
      spawn("open", ["-a", n], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", n], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [n], { detached: true, stdio: "ignore" }).unref();
    }
    return { ok: true, app: n };
  } catch (err) {
    return { ok: false, errore: String(err) };
  }
});
