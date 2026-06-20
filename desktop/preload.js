const { contextBridge, ipcRenderer } = require("electron");

// Espone alla pagina ORION SOLO queste funzioni sicure. La pagina rileva di
// essere nel desktop controllando `window.orionDesktop`.
contextBridge.exposeInMainWorld("orionDesktop", {
  versione: "1.0.0",
  piattaforma: process.platform,
  apriFile: (query) => ipcRenderer.invoke("os:apriFile", query),
  cestina: (query) => ipcRenderer.invoke("os:cestina", query),
  apriApp: (nome) => ipcRenderer.invoke("os:apriApp", nome),
});
