const { app, BrowserWindow, ipcMain, shell, session, screen, globalShortcut, systemPreferences, desktopCapturer } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn, exec } = require("node:child_process");
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

  // Riuso della stessa finestra per i tipi che si AGGIORNANO invece di moltiplicarsi
  // (mappa; affiancamento = un'unica scheda che si aggiorna a ogni sguardo).
  if (tipo === "mappa" || tipo === "affianca") {
    const m = finestreViste.find((f) => f.tipo === tipo && !f.win.isDestroyed());
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
  disponiFinestreViste();
  win.on("closed", () => {
    const i = finestreViste.findIndex((f) => f.win === win);
    if (i >= 0) finestreViste.splice(i, 1);
    disponiFinestreViste();
  });
  win.loadURL(`${ORION_URL}/pannello`);
  // Mando la vista appena la pagina è pronta (il preload la bufferizza se arriva prima).
  win.webContents.on("did-finish-load", () => {
    win.webContents.send("orion:vista", vista);
  });
  return win;
}

// ── GESTURE MODE: overlay NATIVO a tutto schermo per manovrare le finestre ────
// Finestra trasparente, sempre sopra tutto e TRASPARENTE AI CLIC (i clic passano
// sotto → non blocca mai l'uso normale). Esiste solo a gesti accesi. Muove SOLO
// le finestre-pannello di ORION (finestreViste), mai altre app.
let finestraGesti = null;

function finestreVistePulite() {
  return finestreViste.filter((f) => f.win && !f.win.isDestroyed());
}

// AUTO-DISPOSIZIONE: dispone le schede aperte in una griglia ordinata sul monitor,
// mai ammucchiate. ORION le mette già comode: 1 grande, 2 affiancate, 3-4 a griglia…
// L'ultima riga incompleta viene centrata. Richiamata a ogni apertura/chiusura.
function disponiFinestreViste() {
  const finestre = finestreVistePulite()
    .map((f) => f.win)
    .filter((w) => !w.isMinimized());
  const n = finestre.length;
  if (n === 0) return;
  const wa = screen.getPrimaryDisplay().workArea; // esclude dock e barra dei menu
  const gap = 12;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = Math.floor((wa.width - gap * (cols + 1)) / cols);
  const cellH = Math.floor((wa.height - gap * (rows + 1)) / rows);
  finestre.forEach((win, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    // Centra le finestre dell'ultima riga se non riempiono tutte le colonne.
    const ultimaRiga = r === rows - 1;
    const nUltima = n - cols * (rows - 1);
    const centratura = ultimaRiga && nUltima < cols ? Math.floor(((cols - nUltima) * (cellW + gap)) / 2) : 0;
    const x = Math.round(wa.x + gap + c * (cellW + gap) + centratura);
    const y = Math.round(wa.y + gap + r * (cellH + gap));
    try {
      win.setBounds({ x, y, width: cellW, height: cellH }, false);
    } catch {
      /* finestra chiusa nel frattempo */
    }
  });
}
function finestraDiTipo(tipo) {
  const f = finestreVistePulite().find((x) => x.tipo === tipo);
  return f ? f.win : null;
}

function apriOverlayGesti() {
  if (finestraGesti && !finestraGesti.isDestroyed()) return;
  // Coi gesti il dito diventa il mouse e manovra qualunque app: serve il permesso
  // Accessibilità. Alla prima accensione lo chiediamo (no-op se già concesso).
  if (!accessibilitaOk(false)) accessibilitaOk(true);
  const b = screen.getPrimaryDisplay().bounds;
  finestraGesti = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    focusable: false, // non ruba mai il focus
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  finestraGesti.setAlwaysOnTop(true, "screen-saver");
  finestraGesti.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  finestraGesti.setIgnoreMouseEvents(true, { forward: true }); // i clic passano SEMPRE sotto
  finestraGesti.loadURL(`${ORION_URL}/gesti`);
  finestraGesti.on("closed", () => {
    finestraGesti = null;
  });
}

function chiudiOverlayGesti() {
  if (finestraGesti && !finestraGesti.isDestroyed()) {
    try {
      finestraGesti.close();
    } catch {
      /* già chiusa */
    }
  }
  finestraGesti = null;
}

// ── MODALITÀ AFFIANCAMENTO (copilota sullo schermo) ──────────────────────────
// ORION cattura ciò che è sullo schermo (il gestionale/sito che il pro già usa),
// lo fa leggere alla vista e DISEGNA le evidenze sopra, in una finestra trasparente
// click-through (come i gesti). Opt-in, desktop, richiede il permesso "Registrazione
// schermo" di macOS. Nessuno screenshot viene salvato su disco.
let finestraAffianca = null;

function permessoSchermo(prompt) {
  if (process.platform !== "darwin") return true;
  try {
    const stato = systemPreferences.getMediaAccessStatus("screen");
    if (stato !== "granted" && prompt) {
      // Non esiste un dialogo programmatico per lo schermo: si apre il pannello giusto.
      shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
    }
    return stato === "granted";
  } catch {
    return true; // in dubbio, prova: sarà lo screenshot vuoto a dirlo
  }
}

ipcMain.handle("os:catturaSchermo", async () => {
  if (!permessoSchermo(true)) {
    return { ok: false, errore: "permesso_schermo" };
  }
  try {
    const b = screen.getPrimaryDisplay().bounds;
    const larghezza = Math.min(1600, Math.round(b.width));
    const altezza = Math.max(1, Math.round(larghezza * (b.height / b.width)));
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: larghezza, height: altezza } });
    const primario = sources[0];
    if (!primario || primario.thumbnail.isEmpty()) return { ok: false, errore: "permesso_schermo" };
    return { ok: true, dataUrl: primario.thumbnail.toDataURL(), larghezza, altezza };
  } catch (e) {
    return { ok: false, errore: String(e && e.message ? e.message : e) };
  }
});

function apriOverlayAffianca() {
  if (finestraAffianca && !finestraAffianca.isDestroyed()) return;
  const b = screen.getPrimaryDisplay().bounds;
  finestraAffianca = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  finestraAffianca.setAlwaysOnTop(true, "screen-saver");
  finestraAffianca.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  finestraAffianca.setIgnoreMouseEvents(true, { forward: true }); // i clic passano sotto (al gestionale)
  finestraAffianca.loadURL(`${ORION_URL}/affianca`);
  finestraAffianca.on("closed", () => {
    finestraAffianca = null;
  });
}

function chiudiOverlayAffianca() {
  if (finestraAffianca && !finestraAffianca.isDestroyed()) {
    try {
      finestraAffianca.close();
    } catch {
      /* già chiusa */
    }
  }
  finestraAffianca = null;
}

ipcMain.on("os:affiancaOn", () => apriOverlayAffianca());
ipcMain.on("os:affiancaOff", () => chiudiOverlayAffianca());
ipcMain.on("os:affiancaDisegna", (_e, evidenze) => {
  if (finestraAffianca && !finestraAffianca.isDestroyed()) {
    finestraAffianca.webContents.send("affianca:disegna", evidenze);
    finestraAffianca.setAlwaysOnTop(true, "screen-saver");
  }
});

// ── FINESTRE DELLE ALTRE APP (Accessibility / System Events) ─────────────────
// Un piccolo daemon JXA (gesti-ax.js) resta in ascolto su stdin: serve alla
// CHIUSURA A VOCE di finestre e schede ("chiudi questa finestra", "chiudi la
// scheda"). Richiede il permesso Accessibilità (macOS lo chiede la prima volta).
// I gesti restano SOLO sui pannelli di ORION (scelta dell'utente).
// Nell'app impacchettata lo script vive FUORI dall'asar (asarUnpack):
// osascript è un processo esterno e non sa leggere dentro l'archivio.
const AX_SCRIPT = path.join(__dirname, "gesti-ax.js").replace(/\.asar([\\/])/, ".asar.unpacked$1");
let axProc = null;
let axCoda = []; // una risposta per comando, in ordine (FIFO)
let axBuf = "";

function accessibilitaOk(prompt) {
  if (process.platform !== "darwin") return false;
  try {
    return systemPreferences.isTrustedAccessibilityClient(!!prompt);
  } catch {
    return false;
  }
}

function axAvvia() {
  if (axProc && !axProc.killed) return true;
  try {
    axProc = spawn("osascript", ["-l", "JavaScript", AX_SCRIPT], { stdio: ["pipe", "pipe", "ignore"] });
    axBuf = "";
    axCoda = [];
    axProc.stdout.on("data", (d) => {
      axBuf += d.toString();
      let i;
      while ((i = axBuf.indexOf("\n")) >= 0) {
        const riga = axBuf.slice(0, i);
        axBuf = axBuf.slice(i + 1);
        const res = axCoda.shift();
        if (res) {
          try {
            res(JSON.parse(riga));
          } catch {
            res({ ok: false, errore: "risposta illeggibile" });
          }
        }
      }
    });
    axProc.on("exit", () => {
      for (const r of axCoda) r({ ok: false, errore: "daemon chiuso" });
      axCoda = [];
      axProc = null;
    });
    return true;
  } catch {
    axProc = null;
    return false;
  }
}

function axFerma() {
  if (axProc) {
    try {
      axProc.kill();
    } catch {
      /* noop */
    }
    axProc = null;
  }
}

function axComando(riga, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!accessibilitaOk(false)) return resolve({ ok: false, errore: "accessibilita" });
    if (!axAvvia()) return resolve({ ok: false, errore: "daemon non avviabile" });
    let fatto = false;
    let timer = null;
    const fine = (v) => {
      if (fatto) return;
      fatto = true;
      if (timer) clearTimeout(timer);
      resolve(v);
    };
    axCoda.push(fine);
    // Su timeout il daemon si riavvia: evita risposte disallineate coi comandi.
    timer = setTimeout(() => {
      fine({ ok: false, errore: "timeout" });
      axFerma();
    }, timeoutMs);
    try {
      axProc.stdin.write(riga + "\n");
    } catch {
      fine({ ok: false, errore: "daemon non scrivibile" });
    }
  });
}

const pulisciNomeApp = (v) => String(v || "").replace(/[|\n\r]/g, "").trim();

// Elenco delle finestre di TUTTE le app, con cache (~1.2s, una LIST in volo): il
// polling dei gesti resta leggero anche se System Events è lento.
let axCacheFin = { t: 0, finestre: [] };
let axListInVolo = false;
function finestreEsterne() {
  if (!accessibilitaOk(false)) return [];
  const ora = Date.now();
  if (ora - axCacheFin.t > 1200 && !axListInVolo) {
    axListInVolo = true;
    axComando("LIST").then((r) => {
      axListInVolo = false;
      if (r && r.ok && Array.isArray(r.finestre)) axCacheFin = { t: Date.now(), finestre: r.finestre };
    });
  }
  return axCacheFin.finestre;
}

ipcMain.on("os:gestiOn", () => apriOverlayGesti());
ipcMain.on("os:gestiOff", () => chiudiOverlayGesti());
ipcMain.handle("os:gestiFinestre", () => {
  const origin = screen.getPrimaryDisplay().bounds;
  return {
    origin: { x: origin.x, y: origin.y },
    finestre: finestreVistePulite().map((f) => {
      const r = f.win.getBounds();
      return { tipo: f.tipo, x: r.x, y: r.y, w: r.width, h: r.height };
    }),
    esterne: finestreEsterne(),
  };
});

// MOUSE VIRTUALE: il dito diventa il mouse vero del Mac. op = punta | giu |
// trascina | su. I clic passano SOTTO l'overlay (che è click-through) e colpiscono
// l'app reale. Timeout corto: dev'essere fluido.
ipcMain.handle("os:gestiMouse", (_e, d) => {
  if (!accessibilitaOk(false)) return Promise.resolve({ ok: false, errore: "accessibilita" });
  const x = Math.round((d && d.x) || 0);
  const y = Math.round((d && d.y) || 0);
  const cmd = { punta: "PUNTA", giu: "GIU", trascina: "TRASCINA", su: "SU", destro: "DESTRO" }[d && d.op];
  if (!cmd) return Promise.resolve({ ok: false, errore: "op sconosciuta" });
  return axComando(`${cmd}|${x}|${y}`, 2000);
});

// Ridimensiona una finestra di UN'ALTRA app (le finestre di ORION passano da
// os:gestiRidimensiona, via veloce Electron).
ipcMain.handle("os:gestiEsterna", (_e, d) => {
  if (!accessibilitaOk(false)) return Promise.resolve({ ok: false, errore: "accessibilita" });
  const appNome = pulisciNomeApp(d && d.app);
  const indice = Math.max(1, Number((d && d.indice) || 1));
  if (!appNome) return Promise.resolve({ ok: false, errore: "app mancante" });
  if (d && d.op === "ridimensiona")
    return axComando(`SIZE|${appNome}|${indice}|${Math.max(240, Math.round(d.w))}|${Math.max(160, Math.round(d.h))}`);
  return Promise.resolve({ ok: false, errore: "op sconosciuta" });
});

// Comando vocale: chiude una finestra (pulsante rosso) o la scheda del browser
// (Cmd+W). Senza app → quella in primo piano (mai ORION stesso).
ipcMain.handle("os:chiudiFinestra", async (_e, d) => {
  if (!accessibilitaOk(true)) return { ok: false, errore: "accessibilita" };
  const scheda = !!(d && d.scheda);
  let appNome = pulisciNomeApp(d && d.app);
  if (!appNome) {
    const r = await axComando("ATTIVA");
    appNome = r && r.ok && r.app ? String(r.app) : "";
    if (!appNome || appNome === "ORION" || appNome === "Electron") return { ok: false, errore: "quale_app" };
  }
  return axComando(scheda ? `TAB|${appNome}` : `CLOSE|${appNome}|1`);
});
ipcMain.on("os:gestiSposta", (_e, d) => {
  const w = finestraDiTipo(d && d.tipo);
  if (w) {
    try {
      w.setPosition(Math.round(d.x), Math.round(d.y));
    } catch {
      /* noop */
    }
  }
});
ipcMain.on("os:gestiRidimensiona", (_e, d) => {
  const w = finestraDiTipo(d && d.tipo);
  if (w) {
    try {
      w.setSize(Math.max(320, Math.round(d.w)), Math.max(220, Math.round(d.h)));
    } catch {
      /* noop */
    }
  }
});
ipcMain.on("os:gestiChiudi", (_e, d) => {
  const w = finestraDiTipo(d && d.tipo);
  if (w) {
    try {
      w.close();
    } catch {
      /* noop */
    }
  }
});
ipcMain.on("os:gestiAvanti", (_e, d) => {
  const w = finestraDiTipo(d && d.tipo);
  if (w) {
    try {
      w.moveTop();
      w.focus();
    } catch {
      /* noop */
    }
  }
  if (finestraGesti && !finestraGesti.isDestroyed()) finestraGesti.setAlwaysOnTop(true, "screen-saver");
});

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
  // Via di FUGA: chiude sempre l'overlay gesti, anche se desse problemi.
  try {
    globalShortcut.register("CommandOrControl+Shift+G", () => chiudiOverlayGesti());
  } catch {
    /* shortcut non registrabile */
  }
});

app.on("will-quit", () => {
  try {
    globalShortcut.unregisterAll();
  } catch {
    /* noop */
  }
  axFerma();
  chiudiOverlayAffianca();
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

// ── STAMPA: manda alla stampante di sistema (coda CUPS via lpr) ──────────────
// Due vie: un FILE del computer trovato per nome, oppure DATI PDF generati al
// volo da ORION (agenda, documenti, testi) scritti in un temporaneo e stampati.
function stampaConSistema(percorso) {
  return new Promise((resolve) => {
    const win32 = process.platform === "win32";
    const p = spawn(
      win32 ? "powershell" : "lpr",
      win32 ? ["-NoProfile", "-Command", `Start-Process -FilePath "${percorso}" -Verb Print`] : [percorso],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => resolve({ ok: false, errore: String(e && e.message ? e.message : e) }));
    p.on("exit", (code) => {
      if (code === 0) return resolve({ ok: true });
      const bassa = err.toLowerCase();
      resolve({
        ok: false,
        errore:
          bassa.includes("no default destination") || bassa.includes("scheduler") || bassa.includes("unable to")
            ? "nessuna_stampante"
            : err.trim() || `stampa fallita (codice ${code})`,
      });
    });
  });
}

// Stampa un PDF generato da ORION (base64 → file temporaneo → stampante).
ipcMain.handle("os:stampaDati", async (_e, d) => {
  try {
    const base64 = String((d && d.base64) || "").replace(/^data:[^;]+;base64,/, "");
    if (!base64) return { ok: false, errore: "dati mancanti" };
    const nome = String((d && d.nome) || "documento").replace(/[^\w.\-]+/g, "_").slice(0, 60);
    const percorso = path.join(os.tmpdir(), `orion-stampa-${Date.now()}-${nome}.pdf`);
    fs.writeFileSync(percorso, Buffer.from(base64, "base64"));
    const esito = await stampaConSistema(percorso);
    // Pulizia dopo lo spool (la coda di stampa legge il file subito).
    setTimeout(() => {
      try {
        fs.unlinkSync(percorso);
      } catch {
        /* già rimosso */
      }
    }, 60000);
    return esito.ok ? { ok: true, nome } : esito;
  } catch (err) {
    return { ok: false, errore: String(err && err.message ? err.message : err) };
  }
});

// Stampa un file del computer trovato per nome (PDF, immagini, testo).
ipcMain.handle("os:stampaFile", async (_e, query) => {
  const q = String(query || "").trim();
  if (!q) return { ok: false, errore: "nome mancante" };
  const [trovato] = cercaFile(q, 1);
  if (!trovato) return { ok: false, errore: "non trovato" };
  const esito = await stampaConSistema(trovato);
  return esito.ok ? { ok: true, percorso: trovato, nome: path.basename(trovato) } : esito;
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

// ── CREATIVE WORKSPACE: ORION lavora DENTRO i software (terminale + file) ─────
// Capacità potente: esecuzione di comandi e scrittura file sul Mac dell'utente.
// La CONFERMA per le azioni rischiose è gestita da ORION (prompt) PRIMA di
// emettere il comando; qui c'è solo un backstop minimo contro i pattern
// catastrofici, più timeout/limiti. Cartella di lavoro dedicata di default.

const WORKSPACE = path.join(os.homedir(), "Documents", "ORION Workspace");

function cartellaLavoro(cwd) {
  const c = String(cwd || "").trim();
  if (c && path.isAbsolute(c)) return c;
  if (c) return path.join(WORKSPACE, c);
  return WORKSPACE;
}

// Backstop di sicurezza: rifiuta i comandi palesemente distruttivi.
const COMANDI_VIETATI = [
  /rm\s+-rf?\s+(\/|~|\$HOME)(\s|$)/i,
  /\bmkfs\b/i,
  /\bdd\b[^|]*\bof=\/dev\//i,
  /:\(\)\s*\{.*\};:/, // fork bomb
  /\b(shutdown|reboot|halt)\b/i,
  />\s*\/dev\/sd[a-z]/i,
  /\bdiskutil\s+(erase|reformat)/i,
];

function comandoPericoloso(cmd) {
  return COMANDI_VIETATI.some((re) => re.test(cmd));
}

function tronca(s, max = 4000) {
  s = String(s || "");
  return s.length > max ? s.slice(0, max) + "\n…[output troncato]" : s;
}

// Esegue un comando di shell. Ritorna { ok, code, stdout, stderr }.
ipcMain.handle("os:esegui", async (_e, dati) => {
  const comando = String((dati && dati.comando) || "").trim();
  if (!comando) return { ok: false, errore: "comando mancante" };
  if (comandoPericoloso(comando)) {
    return { ok: false, errore: "comando bloccato per sicurezza", code: null, stdout: "", stderr: "Comando potenzialmente distruttivo: rifiutato." };
  }
  const cwd = cartellaLavoro(dati && dati.cwd);
  try {
    fs.mkdirSync(cwd, { recursive: true });
  } catch {
    /* ignora */
  }
  return new Promise((resolve) => {
    exec(comando, { cwd, timeout: 120000, maxBuffer: 8 * 1024 * 1024, shell: "/bin/bash" }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err && typeof err.code === "number" ? err.code : err ? 1 : 0,
        stdout: tronca(stdout),
        stderr: tronca(stderr || (err && err.killed ? "Comando interrotto (timeout)." : "")),
        cwd,
      });
    });
  });
});

// Scrive un file (crea le cartelle). Path relativo → sotto la workspace.
ipcMain.handle("os:scriviFile", async (_e, dati) => {
  const rel = String((dati && dati.percorso) || "").trim();
  if (!rel) return { ok: false, errore: "percorso mancante" };
  const dest = path.isAbsolute(rel) ? rel : path.join(WORKSPACE, rel);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, String((dati && dati.contenuto) || ""), "utf8");
    return { ok: true, percorso: dest };
  } catch (err) {
    return { ok: false, errore: String(err) };
  }
});

// Legge un file (capped) per far "vedere" a ORION il risultato.
ipcMain.handle("os:leggiFile", async (_e, dati) => {
  const rel = String((dati && dati.percorso) || "").trim();
  if (!rel) return { ok: false, errore: "percorso mancante" };
  const src = path.isAbsolute(rel) ? rel : path.join(WORKSPACE, rel);
  try {
    if (!fs.existsSync(src)) return { ok: false, errore: "non esiste" };
    return { ok: true, percorso: src, contenuto: tronca(fs.readFileSync(src, "utf8"), 12000) };
  } catch (err) {
    return { ok: false, errore: String(err) };
  }
});

// Riporta in primo piano la finestra principale (doppio battito di mani da ridotta a icona).
ipcMain.on("os:mostraFinestra", () => {
  mostraFinestraPrincipale();
});
