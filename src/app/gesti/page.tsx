"use client";

import { useEffect, useRef } from "react";

// Contenuto dell'OVERLAY nativo della Gesture Mode (caricato solo dalla finestra
// trasparente di ORION Desktop). Traccia le mani in locale (MediaPipe) e manovra
// le FINESTRE-pannello reali via il bridge window.orionDesktop.gesti*. Disegna solo
// il cursore (sfondo trasparente). In un browser normale (senza bridge) è no-op.

// Pinch misurato come RAPPORTO (distanza pollice-indice / dimensione della mano):
// così è indipendente da quanto la mano è lontana/piccola nell'inquadratura → una
// mano aperta non viene più scambiata per un pinch. Isteresi per stabilità.
const PINCH_ON = 0.4; // sotto questo rapporto = pinch
const PINCH_OFF = 0.62; // sopra = mano aperta
const SENSIBILITA = 2.4; // zona centrale della camera → tutto lo schermo
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
type Mano = { cx: number; cy: number; sx: number; sy: number; pinch: boolean };

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
    const pinchStato = [false, false];
    let bounds: { origin: { x: number; y: number }; finestre: Finestra[] } = { origin: { x: 0, y: 0 }, finestre: [] };
    let resize: { id: string; dist0: number; w0: number; h0: number; cx: number; cy: number } | null = null;
    let selezionata: string | null = null; // finestra sotto il cursore (pallino che pulsa)
    let mouseGiu = false; // il tasto virtuale è premuto (pinch tenuto)
    let ultimaPos = { sx: 0, sy: 0 };

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
    const mouse = (op: "punta" | "giu" | "trascina" | "su", sx: number, sy: number) => {
      const x = Math.round(sx);
      const y = Math.round(sy);
      if (op === "giu" || op === "su") {
        movePending = null; // scarta un movimento in coda a cavallo della transizione
        transizioni.push({ op, x, y });
      } else {
        movePending = { op, x, y };
      }
      pompaMouse();
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
      for (const m of mani) {
        ctx.beginPath();
        ctx.arc(m.cx, m.cy, m.pinch ? 11 : 17, 0, Math.PI * 2);
        ctx.strokeStyle = m.pinch ? "#22d3ee" : "rgba(34,211,238,0.55)";
        ctx.lineWidth = m.pinch ? 4 : 2;
        ctx.stroke();
        if (m.pinch) {
          ctx.fillStyle = "rgba(34,211,238,0.35)";
          ctx.fill();
        }
      }
    };

    const gestisci = (mani: Mano[]) => {
      const pin = mani.filter((m) => m.pinch);
      const cursore = mani[0] ?? null;
      if (cursore) {
        const f = sotto(cursore.sx, cursore.sy);
        selezionata = f ? f.id : null;
        ultimaPos = { sx: cursore.sx, sy: cursore.sy };
      }

      // DUE MANI in pinch → RESIZE della finestra sotto (pannello ORION o qualsiasi app).
      if (pin.length >= 2) {
        if (mouseGiu) {
          mouse("su", ultimaPos.sx, ultimaPos.sy); // chiudi un eventuale trascinamento
          mouseGiu = false;
        }
        const [a, b] = pin;
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

      // UNA MANO (o zero) → MOUSE VIRTUALE su tutto lo schermo.
      const m = mani[0];
      if (!m) {
        if (mouseGiu) {
          mouse("su", ultimaPos.sx, ultimaPos.sy); // la mano è sparita: non lasciare il tasto premuto
          mouseGiu = false;
        }
        return;
      }
      if (m.pinch && !mouseGiu) {
        mouse("giu", m.sx, m.sy); // pinch = tasto giù (click/doppio/trascina lo decide il tempo)
        mouseGiu = true;
      } else if (!m.pinch && mouseGiu) {
        mouse("su", m.sx, m.sy);
        mouseGiu = false;
      } else if (m.pinch) {
        mouse("trascina", m.sx, m.sy);
      } else {
        mouse("punta", m.sx, m.sy);
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
        // rapporto pinch = distanza pollice(4)-indice(8) / dimensione mano (polso 0 → nocca media 9)
        const ref = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.0001;
        const ratio = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / ref;
        const era = pinchStato[i];
        const ora = era ? ratio < PINCH_OFF : ratio < PINCH_ON;
        pinchStato[i] = ora;
        const ax = 0.5 + ((lm[4].x + lm[8].x) / 2 - 0.5) * SENSIBILITA;
        const ay = 0.5 + ((lm[4].y + lm[8].y) / 2 - 0.5) * SENSIBILITA;
        if (!filtri[i * 2]) {
          filtri[i * 2] = new OneEuro();
          filtri[i * 2 + 1] = new OneEuro();
        }
        const cx = Math.max(0, Math.min(window.innerWidth, filtri[i * 2].filtra((1 - ax) * window.innerWidth, t)));
        const cy = Math.max(0, Math.min(window.innerHeight, filtri[i * 2 + 1].filtra(ay * window.innerHeight, t)));
        mani.push({ cx, cy, sx: bounds.origin.x + cx, sy: bounds.origin.y + cy, pinch: ora });
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
