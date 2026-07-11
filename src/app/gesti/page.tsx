"use client";

import { useEffect, useRef } from "react";

// Contenuto dell'OVERLAY nativo della Gesture Mode (caricato solo dalla finestra
// trasparente di ORION Desktop). Traccia le mani in locale (MediaPipe) e manovra
// le FINESTRE-pannello reali via il bridge window.orionDesktop.gesti*. Disegna solo
// il cursore (sfondo trasparente). In un browser normale (senza bridge) è no-op.

// Pinch misurato come RAPPORTO (distanza pollice-indice / dimensione della mano):
// così è indipendente da quanto la mano è lontana/piccola nell'inquadratura → una
// mano aperta non viene più scambiata per un pinch. Isteresi per stabilità.
// Modello a MOUSE:
// · puntamento = punta dell'indice (un pallino)
// · CLICK SINISTRO = "cenno" dell'indice: lo pieghi (tap nell'aria) e torni su
// · TRASCINA = pollice+indice uniti (due cerchietti) → sposti finestre/file/app
// · TASTO DESTRO = pollice+medio uniti
const DRAG_ON = 0.26; // pollice+indice uniti = trascina (soglia rapporto)
const DRAG_OFF = 0.42;
const RCLICK_ON = 0.26; // pollice+MEDIO uniti = tasto destro
const RCLICK_OFF = 0.42;
const TAP_ARMA = 0.68; // indice ESTESO → pronto a cliccare (rapporto lunghezza/mano)
const TAP_SCATTA = 0.5; // indice che si PIEGA (cenno) → scatta il click sinistro
const SENSIBILITA = 1.9; // pallino un pelo più lento e preciso da guidare
const VERSIONE_WASM = "0.10.35";

class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  constructor(private minCutoff = 0.4, private beta = 0.02, private dCutoff = 1.0) {}
  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filtra(x: number, t: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = t;
      return x;
    }
    const dt = Math.max(1e-3, (t - this.tPrev) / 1000);
    this.tPrev = t;
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    this.dxPrev = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const a = this.alpha(cutoff, dt);
    const xf = a * x + (1 - a) * this.xPrev;
    this.xPrev = xf;
    return xf;
  }
}

// Una finestra manovrabile: pannello di ORION (via veloce Electron) o finestra di
// QUALUNQUE app (via Accessibility). Serve solo al RESIZE e al pallino di selezione;
// i click veri li fa il mouse virtuale sull'app reale sotto l'overlay.
type Finestra = {
  id: string;
  esterna: boolean;
  tipo?: string;
  app?: string;
  indice?: number;
  x: number;
  y: number;
  w: number;
  h: number;
};
type Mano = {
  cx: number; cy: number; sx: number; sy: number; // puntatore = punta dell'indice
  tcx: number; tcy: number; // punta del pollice (per i due cerchietti del trascinamento)
  drag: boolean; // pollice+indice uniti → trascina
  destro: boolean; // pollice+medio uniti → tasto destro
  curl: number; // estensione dell'indice (per il cenno del click)
};

export default function GestiOverlay() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Sfondo trasparente SOLO in questa route (finestra overlay).
    const htmlBg = document.documentElement.style.background;
    const bodyBg = document.body.style.background;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const od = (window as any).orionDesktop;
    let vivo = true;
    let raf = 0;
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks?: { x: number; y: number }[][] }; close: () => void } | null = null;
    let stream: MediaStream | null = null;
    const filtri: OneEuro[] = [];
    const dragStato = [false, false]; // isteresi pollice+indice (trascina)
    const rclickStato = [false, false]; // isteresi pollice+medio (tasto destro)
    let bounds: { origin: { x: number; y: number }; finestre: Finestra[] } = { origin: { x: 0, y: 0 }, finestre: [] };
    let resize: { id: string; dist0: number; w0: number; h0: number; cx: number; cy: number } | null = null;
    let selezionata: string | null = null; // finestra sotto il puntatore (pallino che pulsa)
    let mouseGiu = false; // il tasto sinistro è premuto (trascinamento in corso)
    let ultimaPos = { sx: 0, sy: 0 };
    let tapArmato = false; // indice esteso → pronto a far scattare un click col cenno
    let tapPos = { sx: 0, sy: 0, cx: 0, cy: 0 }; // dove parte il click (congelato a dito esteso)
    let rclickArmato = false; // evita ripetizioni del tasto destro finché il pinch resta chiuso
    let flashT = -1000; // istante dell'ultimo click, per il cerchietto-feedback
    let flashPos = { cx: 0, cy: 0 };

    if (!od?.gestiFinestre) {
      return () => {
        document.documentElement.style.background = htmlBg;
        document.body.style.background = bodyBg;
      };
    }

    // ── MOUSE VIRTUALE: pump one-in-flight ────────────────────────────────────
    // Le TRANSIZIONI (giu/su) non si perdono MAI e restano in ordine → i click
    // sono affidabili; i MOVIMENTI (punta/trascina) si accavallano (l'ultimo
    // vince) → il puntamento resta fluido anche se il daemon è più lento.
    let mouseInVolo = false;
    let movePending: { op: string; x: number; y: number } | null = null;
    const transizioni: { op: string; x: number; y: number }[] = [];
    const pompaMouse = () => {
      if (mouseInVolo || !od.gestiMouse) return;
      const next = transizioni.shift() ?? movePending;
      if (!next) return;
      if (next === movePending) movePending = null;
      mouseInVolo = true;
      od.gestiMouse(next).catch(() => {}).finally(() => {
        mouseInVolo = false;
        pompaMouse();
      });
    };
    const mouse = (op: "punta" | "giu" | "trascina" | "su" | "destro", sx: number, sy: number) => {
      const x = Math.round(sx);
      const y = Math.round(sy);
      if (op === "punta" || op === "trascina") {
        movePending = { op, x, y };
      } else {
        movePending = null; // le transizioni (giu/su/destro) non si perdono e restano in ordine
        transizioni.push({ op, x, y });
      }
      pompaMouse();
    };
    const flash = (cx: number, cy: number) => {
      flashT = performance.now();
      flashPos = { cx, cy };
    };

    // Resize delle finestre di ALTRE app: one-in-flight, l'ultimo vince.
    let resizeInVolo = false;
    let resizePending: { op: string; app?: string; indice?: number; w: number; h: number } | null = null;
    const ridimensionaEsterna = (f: Finestra, w: number, h: number) => {
      if (!od.gestiEsterna) return;
      resizePending = { op: "ridimensiona", app: f.app, indice: f.indice, w, h };
      if (resizeInVolo) return;
      const go = () => {
        if (!resizePending) return;
        const p = resizePending;
        resizePending = null;
        resizeInVolo = true;
        od.gestiEsterna(p).catch(() => {}).finally(() => {
          resizeInVolo = false;
          go();
        });
      };
      go();
    };

    const aggiornaBounds = async () => {
      try {
        const r = await od.gestiFinestre();
        if (resize) return; // durante il resize la posizione ottimistica comanda
        const orion: Finestra[] = (r.finestre ?? []).map((f: { tipo: string; x: number; y: number; w: number; h: number }) => ({
          id: `orion:${f.tipo}`,
          esterna: false,
          tipo: f.tipo,
          x: f.x, y: f.y, w: f.w, h: f.h,
        }));
        const esterne: Finestra[] = (r.esterne ?? []).map(
          (f: { app: string; indice: number; x: number; y: number; w: number; h: number }) => ({
            id: `app:${f.app}#${f.indice}`,
            esterna: true,
            app: f.app,
            indice: f.indice,
            x: f.x, y: f.y, w: f.w, h: f.h,
          })
        );
        // ORION per ultimo: a parità di punto, il pannello vince sull'app sotto.
        bounds = { origin: r.origin, finestre: [...esterne, ...orion] };
      } catch {
        /* noop */
      }
    };
    aggiornaBounds();
    const tBounds = setInterval(aggiornaBounds, 250);

    const sotto = (sx: number, sy: number): Finestra | null => {
      let found: Finestra | null = null;
      for (const f of bounds.finestre) {
        if (sx >= f.x && sx <= f.x + f.w && sy >= f.y && sy <= f.y + f.h) found = f; // ultima = "sopra"
      }
      return found;
    };
    const rectDi = (id: string) => bounds.finestre.find((f) => f.id === id) || null;

    const ridimensiona = (f: Finestra, w: number, h: number, cx: number, cy: number) => {
      f.w = w;
      f.h = h;
      if (f.esterna) {
        ridimensionaEsterna(f, w, h); // le app esterne restano ancorate in alto a sinistra
      } else {
        od.gestiRidimensiona({ tipo: f.tipo, w, h });
        od.gestiSposta({ tipo: f.tipo, x: cx - w / 2, y: cy - h / 2 });
        f.x = cx - w / 2;
        f.y = cy - h / 2;
      }
    };

    const disegna = (mani: Mano[]) => {
      const cv = canvasRef.current;
      if (!cv) return;
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, cv.width, cv.height);
      // PALLINO che pulsa (si illumina e si spegne) nell'angolo della finestra
      // SELEZIONATA: indica quale pannello riceve gli swipe, senza bordi invadenti.
      if (selezionata) {
        const f = rectDi(selezionata);
        if (f) {
          const x = f.x - bounds.origin.x + f.w - 16;
          const y = f.y - bounds.origin.y + 16;
          const pulse = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(performance.now() / 280));
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.fillStyle = "#22d3ee";
          ctx.shadowColor = "#22d3ee";
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      // Flash del click: un cerchietto che si espande e svanisce.
      const now = performance.now();
      if (now - flashT < 220) {
        const k = (now - flashT) / 220;
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#22d3ee";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(flashPos.cx, flashPos.cy, 8 + k * 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (const m of mani) {
        if (m.drag) {
          // TRASCINAMENTO: due cerchietti (indice + pollice) uniti da una linea.
          ctx.save();
          ctx.strokeStyle = "#22d3ee";
          ctx.shadowColor = "#22d3ee";
          ctx.shadowBlur = 10;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(m.cx, m.cy);
          ctx.lineTo(m.tcx, m.tcy);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.lineWidth = 3;
          for (const [px, py] of [[m.cx, m.cy], [m.tcx, m.tcy]] as const) {
            ctx.beginPath();
            ctx.arc(px, py, 9, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(34,211,238,0.30)";
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        } else {
          // PUNTATORE: anello + centro preciso (il pallino celeste).
          ctx.save();
          ctx.shadowColor = "#22d3ee";
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(m.cx, m.cy, 15, 0, Math.PI * 2);
          ctx.strokeStyle = m.destro ? "#a78bfa" : "rgba(34,211,238,0.6)";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(m.cx, m.cy, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = m.destro ? "#a78bfa" : "#22d3ee";
          ctx.fill();
          ctx.restore();
        }
      }
    };

    const gestisci = (mani: Mano[]) => {
      const dragMani = mani.filter((m) => m.drag);
      const m = mani[0] ?? null;
      if (m) {
        const f = sotto(m.sx, m.sy);
        selezionata = f ? f.id : null;
        ultimaPos = { sx: m.sx, sy: m.sy };
      }

      // DUE MANI in pinch pollice-indice → RESIZE della finestra sotto (ORION o qualsiasi app).
      if (dragMani.length >= 2) {
        if (mouseGiu) {
          mouse("su", ultimaPos.sx, ultimaPos.sy);
          mouseGiu = false;
        }
        tapArmato = false;
        const [a, b] = dragMani;
        const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
        if (!resize) {
          const f = selezionata ? rectDi(selezionata) : sotto((a.sx + b.sx) / 2, (a.sy + b.sy) / 2);
          if (f) {
            resize = { id: f.id, dist0: dist || 1, w0: f.w, h0: f.h, cx: f.x + f.w / 2, cy: f.y + f.h / 2 };
            selezionata = f.id;
            if (!f.esterna) od.gestiAvanti({ tipo: f.tipo });
          }
        } else {
          const f = rectDi(resize.id);
          if (f) {
            const s = Math.min(4, Math.max(0.3, dist / resize.dist0));
            ridimensiona(f, resize.w0 * s, resize.h0 * s, resize.cx, resize.cy);
          }
        }
        return;
      }
      resize = null;

      if (!m) {
        if (mouseGiu) {
          mouse("su", ultimaPos.sx, ultimaPos.sy); // mano sparita: non lasciare il tasto premuto
          mouseGiu = false;
        }
        tapArmato = false;
        return;
      }

      // TRASCINAMENTO (pollice+indice): tasto sinistro tenuto giù + movimento.
      if (m.drag) {
        if (!mouseGiu) {
          mouse("giu", m.sx, m.sy);
          mouseGiu = true;
        } else {
          mouse("trascina", m.sx, m.sy);
        }
        tapArmato = false;
        return;
      }
      if (mouseGiu) {
        mouse("su", m.sx, m.sy);
        mouseGiu = false;
      }

      // TASTO DESTRO (pollice+medio): uno scatto per gesto.
      if (m.destro) {
        if (!rclickArmato) {
          mouse("destro", m.sx, m.sy);
          flash(m.cx, m.cy);
          rclickArmato = true;
        }
        return; // niente click sinistro mentre fai il destro
      }
      rclickArmato = false;

      // CLICK SINISTRO = CENNO dell'indice: si arma a dito esteso (memorizzando il
      // punto), scatta quando l'indice si piega. Il puntatore NON si sposta durante
      // il cenno perché il click parte dal punto congelato.
      if (m.curl > TAP_ARMA) {
        tapArmato = true;
        tapPos = { sx: m.sx, sy: m.sy, cx: m.cx, cy: m.cy };
      } else if (tapArmato && m.curl < TAP_SCATTA) {
        mouse("giu", tapPos.sx, tapPos.sy);
        mouse("su", tapPos.sx, tapPos.sy); // due tap ravvicinati = doppio click (lo rileva il daemon)
        flash(tapPos.cx, tapPos.cy);
        tapArmato = false;
      }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const v = videoRef.current;
      if (!landmarker || !v || !v.videoWidth) return;
      let res;
      try {
        res = landmarker.detectForVideo(v, performance.now());
      } catch {
        return;
      }
      const t = performance.now();
      const mani: Mano[] = [];
      const lms = res.landmarks ?? [];
      for (let i = 0; i < Math.min(2, lms.length); i++) {
        const lm = lms[i];
        // Riferimento = dimensione mano (polso 0 → nocca media 9): rende tutto
        // indipendente da quanto la mano è lontana dalla telecamera.
        const ref = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.0001;
        const dragRatio = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / ref; // pollice-indice
        const rclickRatio = Math.hypot(lm[4].x - lm[12].x, lm[4].y - lm[12].y) / ref; // pollice-medio
        const curl = Math.hypot(lm[8].x - lm[5].x, lm[8].y - lm[5].y) / ref; // estensione indice (tip 8 → nocca 5)
        const drag = dragStato[i] ? dragRatio < DRAG_OFF : dragRatio < DRAG_ON;
        dragStato[i] = drag;
        // Il tasto destro non deve scattare mentre trascini: se sei in drag, ignora.
        const destro = !drag && (rclickStato[i] ? rclickRatio < RCLICK_OFF : rclickRatio < RCLICK_ON);
        rclickStato[i] = destro;
        // Puntatore = punta dell'INDICE (landmark 8).
        const ax = 0.5 + (lm[8].x - 0.5) * SENSIBILITA;
        const ay = 0.5 + (lm[8].y - 0.5) * SENSIBILITA;
        if (!filtri[i * 2]) {
          filtri[i * 2] = new OneEuro();
          filtri[i * 2 + 1] = new OneEuro();
        }
        const cx = Math.max(0, Math.min(window.innerWidth, filtri[i * 2].filtra((1 - ax) * window.innerWidth, t)));
        const cy = Math.max(0, Math.min(window.innerHeight, filtri[i * 2 + 1].filtra(ay * window.innerHeight, t)));
        // Punta del pollice (per i due cerchietti del trascinamento), stessa mappatura.
        const atx = 0.5 + (lm[4].x - 0.5) * SENSIBILITA;
        const aty = 0.5 + (lm[4].y - 0.5) * SENSIBILITA;
        const tcx = Math.max(0, Math.min(window.innerWidth, (1 - atx) * window.innerWidth));
        const tcy = Math.max(0, Math.min(window.innerHeight, aty * window.innerHeight));
        mani.push({ cx, cy, sx: bounds.origin.x + cx, sy: bounds.origin.y + cy, tcx, tcy, drag, destro, curl });
      }
      disegna(mani);
      gestisci(mani);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (!vivo) {
          stream.getTracks().forEach((tk) => tk.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSIONE_WASM}/wasm`);
        landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
        if (!vivo) return;
        loop();
      } catch (e) {
        console.error("[gesti-overlay]", e);
      }
    })();

    return () => {
      vivo = false;
      cancelAnimationFrame(raf);
      clearInterval(tBounds);
      stream?.getTracks().forEach((tk) => tk.stop());
      try {
        landmarker?.close();
      } catch {
        /* noop */
      }
      document.documentElement.style.background = htmlBg;
      document.body.style.background = bodyBg;
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "transparent" }}>
      {/* Trasparenza garantita dal PRIMO paint (SSR): l'overlay nativo non mostra
          mai il velo scuro di globals.css prima che parta l'effetto. */}
      <style>{`html,body{background:transparent !important;overflow:hidden}`}</style>
      <video ref={videoRef} muted playsInline style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none" }} />
    </div>
  );
}
