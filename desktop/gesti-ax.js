// Daemon JXA (lanciato con: osascript -l JavaScript gesti-ax.js).
// Serve alla CHIUSURA A VOCE di finestre e schede via System Events (richiede
// il permesso Accessibilità per ORION). Protocollo a righe su stdin/stdout,
// una risposta JSON per ogni comando:
//   CLOSE|app|indice         → { ok }        (pulsante rosso della finestra)
//   TAB|app                  → { ok }        (Cmd+W: chiude la scheda attiva)
//   ATTIVA                   → { ok, app }   (app in primo piano)
ObjC.import("Foundation");

function run() {
  const se = Application("System Events");
  const out = $.NSFileHandle.fileHandleWithStandardOutput;
  const inp = $.NSFileHandle.fileHandleWithStandardInput;
  const scrivi = (o) => {
    const s = JSON.stringify(o) + "\n";
    out.writeData($(s).dataUsingEncoding($.NSUTF8StringEncoding));
  };
  // Nome esatto, altrimenti il primo processo visibile che lo contiene
  // (l'utente dice "Chrome", il processo si chiama "Google Chrome").
  function trovaProcesso(q) {
    try {
      const p = se.processes.byName(q);
      p.name();
      return p;
    } catch (e) {
      /* non esiste con questo nome esatto */
    }
    const ql = String(q).toLowerCase();
    const ps = se.processes.whose({ visible: true })();
    for (const proc of ps) {
      try {
        if (proc.name().toLowerCase().indexOf(ql) >= 0) return proc;
      } catch (e) {}
    }
    return null;
  }
  function finestra(nomeApp, indice) {
    const p = trovaProcesso(nomeApp);
    if (!p) return null;
    return p.windows.at(Math.max(0, (Number(indice) || 1) - 1));
  }

  function esegui(riga) {
    const p = riga.split("|");
    const cmd = p[0];
    try {
      if (cmd === "CLOSE") {
        const w = finestra(p[1], p[2]);
        if (!w) return { ok: false, errore: "finestra non trovata" };
        const btn = w.buttons.whose({ subrole: "AXCloseButton" })();
        if (btn.length) {
          btn[0].click();
          return { ok: true };
        }
        return { ok: false, errore: "la finestra non ha il pulsante di chiusura" };
      }
      if (cmd === "TAB") {
        const proc = trovaProcesso(p[1]);
        if (!proc) return { ok: false, errore: "app non trovata" };
        proc.frontmost = true;
        delay(0.15); // il focus deve assestarsi prima del Cmd+W
        se.keystroke("w", { using: ["command down"] });
        return { ok: true };
      }
      if (cmd === "ATTIVA") {
        const f = se.processes.whose({ frontmost: true })();
        return { ok: true, app: f.length ? f[0].name() : null };
      }
      return { ok: false, errore: "comando sconosciuto" };
    } catch (e) {
      return { ok: false, errore: String(e && e.message ? e.message : e) };
    }
  }

  let buf = "";
  for (;;) {
    const data = inp.availableData;
    // Attenzione JXA: length arriva come STRINGA → va convertita, o il loop
    // non vede mai la fine dello stdin e gira a vuoto.
    if (!data || Number(data.length) === 0) break; // stdin chiuso → esci
    buf += $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const riga = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (riga) scrivi(esegui(riga));
    }
  }
}
run();
