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

let finestraPrincipale = null;

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
      // Continua a girare (e ad ascoltare i colpi) anche da ridotta a icona.
      backgroundThrottling: false,
    },
  });
  finestraPrincipale = win;

  // Concedi microfono/notifiche (servono a voce e push) senza prompt continui.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));

  // Avvisa la pagina quando la finestra è ridotta a icona / ripristinata.
  win.on("minimize", () => win.webContents.send("orion:finestra", "minimizzata"));
  win.on("restore", () => win.webContents.send("orion:finestra", "ripristinata"));
  win.on("closed", () => {
    if (finestraPrincipale === win) finestraPrincipale = null;
  });

  win.loadURL(ORION_URL);
  return win;
}

// Riporta in primo piano la finestra principale (richiamata dal doppio battito di mani).
function mostraFinestraPrincipale() {
  let win = finestraPrincipale;
  if (!win || win.isDestroyed()) win = creaFinestra();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return win;
}

// Apre una VISTA in una finestra separata. La principale resta sul "nucleo".
// Teniamo traccia delle finestre per poterle CHIUDERE a voce ("chiudi l'agenda").
// Riuso della finestra SOLO per le MAPPE (così "ristoranti vicini" aggiorna la stessa
// mappa); gli altri tipi aprono una finestra nuova a ogni comando.
const finestreViste = []; // { win, tipo }

function apriFinestraVista(vista) {
  const tipo = vista && vista.tipo ? String(vista.tipo) : "vista";

  if (tipo === "mappa") {
    const m = finestreViste.find((f) => f.tipo === "mappa" && !f.win.isDestroyed());
    if (m) {
      m.win.webContents.send("orion:vista", vista);
      if (m.win.isMinimized()) m.win.restore();
      m.win.focus();
      return m.win;
    }
  }

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
  finestreViste.push({ win, tipo });
  win.on("closed", () => {
    const i = finestreViste.findIndex((f) => f.win === win);
    if (i >= 0) finestreViste.splice(i, 1);
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

// Chiude le finestre-pannello: per tipo (es. "agenda", "mappa") o tutte ("tutto").
ipcMain.on("os:chiudiVista", (_e, vista) => {
  const t = String(vista || "").toLowerCase().trim();
  const tutto = !t || t === "tutto" || t === "tutti";
  for (const f of [...finestreViste]) {
    if (tutto || f.tipo === t) {
      try {
        f.win.close();
      } catch {
        /* già chiusa */
      }
    }
  }
});

app.whenReady().then(() => {
  creaFinestra();
  // Pre-carica (e scarica, la prima volta) il modello vocale in background, così
  // quando l'utente parla è già pronto. Non blocca l'avvio.
  whisper
    .getTranscriber()
    .then(() => console.log("[main] STT pronto"))
    .catch((e) => console.error("[main] STT pre-carico fallito:", e && e.message ? e.message : e));
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) creaFinestra();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── Ricerca voci (file/cartelle): scansione superficiale delle cartelle utente ──
function trovaVoci(query, { file = true, cartelle = true, limite = 1 } = {}) {
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
      const match = v.name.toLowerCase().includes(q);
      if (v.isDirectory()) {
        if (cartelle && match) trovati.push(p);
        if (!["node_modules", "Library"].includes(v.name)) scava(p, profondita + 1);
      } else if (v.isFile() && file && match) {
        trovati.push(p);
      }
    }
  };

  for (const base of CARTELLE) {
    if (trovati.length >= limite) break;
    scava(base, 0);
  }
  return trovati;
}

const cercaFile = (q, limite = 1) => trovaVoci(q, { cartelle: false, limite });

// Risolve "dove" creare qualcosa: parole note (scrivania/documenti…) o una cartella per nome.
function cartellaBase(posizione) {
  const p = String(posizione || "").toLowerCase().trim();
  if (!p || /scrivania|desktop/.test(p)) return path.join(os.homedir(), "Desktop");
  if (/documenti|documents/.test(p)) return path.join(os.homedir(), "Documents");
  if (/download/.test(p)) return path.join(os.homedir(), "Downloads");
  if (/immagini|pictures|foto/.test(p)) return path.join(os.homedir(), "Pictures");
  if (/home|utente|principale/.test(p)) return os.homedir();
  const [cartella] = trovaVoci(p, { file: false, limite: 1 });
  return cartella || path.join(os.homedir(), "Desktop");
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

// Chiude (esce da) un'app per nome.
ipcMain.handle("os:chiudiApp", async (_e, nome) => {
  const n = String(nome || "").trim();
  if (!n) return { ok: false, errore: "nome mancante" };
  try {
    if (process.platform === "darwin") {
      spawn("osascript", ["-e", `quit app "${n.replace(/"/g, "")}"`], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "win32") {
      spawn("taskkill", ["/IM", `${n}.exe`, "/F"], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("pkill", ["-i", n], { detached: true, stdio: "ignore" }).unref();
    }
    return { ok: true, app: n };
  } catch (err) {
    return { ok: false, errore: String(err) };
  }
});

// Crea un file o una cartella (con un nome) nella posizione indicata.
ipcMain.handle("os:crea", async (_e, dati) => {
  const nome = String((dati && dati.nome) || "").replace(/[/\\]/g, "").trim();
  if (!nome) return { ok: false, errore: "nome mancante" };
  const cartella = dati && /cartell|folder/i.test(String(dati.tipo || "")) ? true : false;
  const base = cartellaBase(dati && dati.posizione);
  const dest = path.join(base, nome);
  try {
    if (cartella) {
      fs.mkdirSync(dest, { recursive: true });
    } else {
      if (fs.existsSync(dest)) return { ok: false, errore: "esiste già" };
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, "");
    }
    return { ok: true, percorso: dest, nome, cartella: path.basename(base), tipo: cartella ? "cartella" : "file" };
  } catch (err) {
    return { ok: false, errore: String(err) };
  }
});

// Rinomina un file o una cartella (trovato per nome) in un nuovo nome.
ipcMain.handle("os:rinomina", async (_e, dati) => {
  const da = String((dati && dati.da) || "").trim();
  const a = String((dati && dati.a) || "").replace(/[/\\]/g, "").trim();
  if (!da || !a) return { ok: false, errore: "servono vecchio e nuovo nome" };
  const [trovato] = trovaVoci(da, { limite: 1 });
  if (!trovato) return { ok: false, errore: "non trovato" };
  const nuovo = path.join(path.dirname(trovato), a);
  if (fs.existsSync(nuovo)) return { ok: false, errore: "esiste già un elemento con quel nome" };
  try {
    fs.renameSync(trovato, nuovo);
    return { ok: true, da: path.basename(trovato), a };
  } catch (err) {
    return { ok: false, errore: String(err) };
  }
});

// Riporta in primo piano la finestra principale (doppio battito di mani da ridotta a icona).
ipcMain.on("os:mostraFinestra", () => {
  mostraFinestraPrincipale();
});
