// Daemon JXA (lanciato con: osascript -l JavaScript gesti-ax.js).
// Manovra le finestre delle ALTRE app via System Events (richiede il permesso
// Accessibilità per ORION). Protocollo a righe su stdin/stdout, una risposta
// JSON per ogni comando:
//   LIST                     → { ok, finestre:[{app,indice,titolo,x,y,w,h}] }
//   MOVE|app|indice|x|y      → { ok }
//   SIZE|app|indice|w|h      → { ok }
//   FRONT|app|indice         → { ok }        (porta davanti)
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
  // Le finestre di ORION le manovra già Electron (via veloce): qui si escludono.
  const ESCLUDI = { ORION: 1, Electron: 1 };

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
      if (cmd === "LIST") {
        const lista = [];
        const ps = se.processes.whose({ visible: true })();
        for (const proc of ps) {
          let nome;
          try {
            nome = proc.name();
          } catch (e) {
            continue;
          }
          if (ESCLUDI[nome]) continue;
          let ws;
          try {
            ws = proc.windows();
          } catch (e) {
            continue;
          }
          for (let i = 0; i < ws.length; i++) {
            try {
              const pos = ws[i].position();
              const sz = ws[i].size();
              if (sz[0] < 160 || sz[1] < 120) continue; // palette e popup: fuori
              let titolo = "";
              try {
                titolo = ws[i].title() || "";
              } catch (e) {}
              lista.push({ app: nome, indice: i + 1, titolo: String(titolo).slice(0, 60), x: pos[0], y: pos[1], w: sz[0], h: sz[1] });
            } catch (e) {}
          }
        }
        return { ok: true, finestre: lista };
      }
      if (cmd === "MOVE") {
        const w = finestra(p[1], p[2]);
        if (!w) return { ok: false, errore: "finestra non trovata" };
        w.position = [Number(p[3]), Number(p[4])];
        return { ok: true };
      }
      if (cmd === "SIZE") {
        const w = finestra(p[1], p[2]);
        if (!w) return { ok: false, errore: "finestra non trovata" };
        w.size = [Number(p[3]), Number(p[4])];
        return { ok: true };
      }
      if (cmd === "FRONT") {
        const proc = trovaProcesso(p[1]);
        if (!proc) return { ok: false, errore: "app non trovata" };
        proc.frontmost = true;
        try {
          proc.windows.at(Math.max(0, (Number(p[2]) || 1) - 1)).actions.byName("AXRaise").perform();
        } catch (e) {}
        return { ok: true };
      }
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
