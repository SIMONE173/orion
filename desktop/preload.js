const { contextBridge, ipcRenderer } = require("electron");

// Bufferizza la vista in arrivo: l'IPC può arrivare PRIMA che la pagina /pannello
// registri onVista (race con l'idratazione React). Così non si perde.
let vistaInArrivo = null;
let vistaCallback = null;
ipcRenderer.on("orion:vista", (_e, vista) => {
  vistaInArrivo = vista;
  if (vistaCallback) vistaCallback(vista);
});

// Espone alla pagina ORION SOLO queste funzioni sicure. La pagina rileva di
// essere nel desktop controllando `window.orionDesktop`.
contextBridge.exposeInMainWorld("orionDesktop", {
  versione: "1.0.0",
  piattaforma: process.platform,
  apriFile: (query) => ipcRenderer.invoke("os:apriFile", query),
  cestina: (query) => ipcRenderer.invoke("os:cestina", query),
  apriApp: (nome) => ipcRenderer.invoke("os:apriApp", nome),
  chiudiApp: (nome) => ipcRenderer.invoke("os:chiudiApp", nome),
  crea: (dati) => ipcRenderer.invoke("os:crea", dati),
  rinomina: (dati) => ipcRenderer.invoke("os:rinomina", dati),
  // Creative Workspace: lavorare DENTRO i software (terminale + file).
  esegui: (dati) => ipcRenderer.invoke("os:esegui", dati),
  scriviFile: (dati) => ipcRenderer.invoke("os:scriviFile", dati),
  leggiFile: (dati) => ipcRenderer.invoke("os:leggiFile", dati),
  // Riporta in primo piano la finestra (doppio battito di mani da ridotta a icona).
  mostraFinestra: () => ipcRenderer.send("os:mostraFinestra"),
  onFinestra: (cb) => ipcRenderer.on("orion:finestra", (_e, stato) => cb(stato)),
  // Riconoscimento vocale offline:
  sttPronto: () => ipcRenderer.invoke("os:sttPronto"),
  trascrivi: (pcm) => ipcRenderer.invoke("os:trascrivi", pcm),
  // Apre una vista (pannello) in una finestra separata.
  apriVista: (vista) => ipcRenderer.send("os:apriVista", vista),
  // Chiude le finestre-pannello (per tipo, o "tutto").
  chiudiVista: (vista) => ipcRenderer.send("os:chiudiVista", vista),
  // La pagina /pannello riceve la vista da mostrare (con buffer anti-race).
  onVista: (cb) => {
    vistaCallback = cb;
    if (vistaInArrivo) cb(vistaInArrivo);
  },
});
