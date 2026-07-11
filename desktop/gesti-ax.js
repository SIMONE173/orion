// Daemon JXA (lanciato con: osascript -l JavaScript gesti-ax.js).
// Due mestieri, stesso protocollo a righe su stdin/stdout (una risposta JSON per
// ogni comando; richiede il permesso Accessibilità per ORION):
//
// 1) CHIUSURA A VOCE di finestre e schede (System Events):
//   CLOSE|app|indice         → { ok }        (pulsante rosso della finestra)
//   TAB|app                  → { ok }        (Cmd+W: chiude la scheda attiva)
//   ATTIVA                   → { ok, app }   (app in primo piano)
//
// 2) GESTI = MOUSE VIRTUALE su tutto il computer:
//   PUNTA|x|y                → { ok }        (muove il cursore vero)
//   GIU|x|y                  → { ok }        (tasto sinistro giù; doppio click
//                                             automatico se ravvicinato)
//   TRASCINA|x|y             → { ok }        (movimento col tasto premuto)
//   SU|x|y                   → { ok }        (tasto sinistro su)
//   LIST                     → { ok, finestre:[{app,indice,titolo,x,y,w,h}] }
//   SIZE|app|indice|w|h      → { ok }        (ridimensiona una finestra)
ObjC.import("Foundation");
ObjC.import("CoreGraphics");

function run() {
  const se = Application("System Events");
  const out = $.NSFileHandle.fileHandleWithStandardOutput;
  const inp = $.NSFileHandle.fileHandleWithStandardInput;
  const scrivi = (o) => {
    const s = JSON.stringify(o) + "\n";
    out.writeData($(s).dataUsingEncoding($.NSUTF8StringEncoding));
  };
  // Le finestre di ORION le manovra già Electron (via veloce): fuori dalla LIST.
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

  // ── Mouse virtuale: eventi CG REALI (click e trascinamenti veri) ───────────
  // Il doppio click nasce da solo: un GIU entro 450ms/14px dall'ultimo SU viene
  // marcato clickState=2 (è quello che Finder/Dock vogliono per "aprire").
  let ultimoSu = { t: 0, x: 0, y: 0 };
  let statoClick = 1;
  function eventoMouse(tipo, x, y, conStato) {
    const e = $.CGEventCreateMouseEvent($(), tipo, { x: x, y: y }, $.kCGMouseButtonLeft);
    if (conStato) $.CGEventSetIntegerValueField(e, $.kCGMouseEventClickState, statoClick);
    $.CGEventPost($.kCGHIDEventTap, e);
  }

  function esegui(riga) {
    const p = riga.split("|");
    const cmd = p[0];
    try {
      if (cmd === "PUNTA") {
        eventoMouse($.kCGEventMouseMoved, Number(p[1]), Number(p[2]), false);
        return { ok: true };
      }
      if (cmd === "GIU") {
        const x = Number(p[1]);
        const y = Number(p[2]);
        const ora = Date.now();
        statoClick = ora - ultimoSu.t < 450 && Math.hypot(x - ultimoSu.x, y - ultimoSu.y) < 14 ? 2 : 1;
        eventoMouse($.kCGEventLeftMouseDown, x, y, true);
        return { ok: true };
      }
      if (cmd === "TRASCINA") {
        eventoMouse($.kCGEventLeftMouseDragged, Number(p[1]), Number(p[2]), true);
        return { ok: true };
      }
      if (cmd === "SU") {
        const x = Number(p[1]);
        const y = Number(p[2]);
        eventoMouse($.kCGEventLeftMouseUp, x, y, true);
        ultimoSu = { t: Date.now(), x: x, y: y };
        return { ok: true };
      }
      if (cmd === "DESTRO") {
        const x = Number(p[1]);
        const y = Number(p[2]);
        const giu = $.CGEventCreateMouseEvent($(), $.kCGEventRightMouseDown, { x: x, y: y }, $.kCGMouseButtonRight);
        $.CGEventPost($.kCGHIDEventTap, giu);
        const su = $.CGEventCreateMouseEvent($(), $.kCGEventRightMouseUp, { x: x, y: y }, $.kCGMouseButtonRight);
        $.CGEventPost($.kCGHIDEventTap, su);
        return { ok: true };
      }
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
      if (cmd === "SIZE") {
        const w = finestra(p[1], p[2]);
        if (!w) return { ok: false, errore: "finestra non trovata" };
        w.size = [Number(p[3]), Number(p[4])];
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
