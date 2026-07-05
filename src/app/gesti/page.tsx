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

// Una finestra manovrabile: pannello di ORION (via veloce Electron) oppure
// finestra di QUALUNQUE app (via Accessibility, se l'app desktop la supporta).
type Finestra = {
  id: string;
  esterna: boolean;
  tipo?: string; // pannelli ORION
  app?: string; // finestre di altre app
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
    let grab: { id: string; offX: number; offY: number } | null = null;
    let resize: { id: string; dist0: number; w0: number; h0: number; cx: number; cy: number } | null = null;
    let selezionata: string | null = null; // finestra sotto il cursore (pallino che pulsa)
    // Comandi alle finestre esterne: UNO in volo per volta, l'ultimo vince
    // (System Events è più lento di Electron: così il drag resta fluido).
    let esternaInVolo = false;
    let esternaCoda: { op: string; f: Finestra; x?: number; y?: number; w?: number; h?: number } | null = null;
    const eseguiEsterna = (op: string, f: Finestra, v: { x?: number; y?: number; w?: number; h?: number } = {}) => {
      if (!od.gestiEsterna) return;
      if (esternaInVolo) {
        esternaCoda = { op, f, ...v };
        return;
      }
      esternaInVolo = true;
      od.gestiEsterna({ op, app: f.app, indice: f.indice, ...v })
        .catch(() => {})
        .finally(() => {
          esternaInVolo = false;
          if (esternaCoda) {
            const c = esternaCoda;
            esternaCoda = null;
            eseguiEsterna(c.op, c.f, c);
          }
        });
    };

    if (!od?.gestiFinestre) {
      return () => {
        document.documentElement.style.background = htmlBg;
        document.body.style.background = bodyBg;
      };
    }

    const aggiornaBounds = async () => {
      try {
        const r = await od.gestiFinestre();
        // Mentre si trascina/ridimensiona, la posizione "ottimistica" locale
        // comanda: niente refresh che farebbe saltare la finestra.
        if (grab || resize) return;
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

    // Operazioni unificate: pannelli ORION via Electron, altre app via Accessibility.
    const portaAvanti = (f: Finestra) => {
      if (f.esterna) eseguiEsterna("avanti", f);
      else od.gestiAvanti({ tipo: f.tipo });
    };
    const sposta = (f: Finestra, x: number, y: number) => {
      f.x = x;
      f.y = y; // ottimistico: il pallino e l'hit-test seguono subito la mano
      if (f.esterna) eseguiEsterna("sposta", f, { x, y });
      else od.gestiSposta({ tipo: f.tipo, x, y });
    };
    const ridimensiona = (f: Finestra, w: number, h: number, cx: number, cy: number) => {
      f.w = w;
      f.h = h;
      if (f.esterna) {
        // Le app esterne restano ancorate all'angolo in alto a sinistra
        // (un solo comando per aggiornamento: più fluido).
        eseguiEsterna("ridimensiona", f, { w, h });
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
          // Ciano = pannello ORION · bianco = finestra di un'altra app.
          const colore = f.esterna ? "#e2e8f0" : "#22d3ee";
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.fillStyle = colore;
          ctx.shadowColor = colore;
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
      const cursore = pin[0] ?? mani[0] ?? null;
      // Pallino di selezione: la finestra sotto il cursore (quella che pinchando agganci).
      if (cursore) {
        const f = sotto(cursore.sx, cursore.sy);
        if (f) selezionata = f.id;
      }

      if (pin.length >= 2) {
        // DUE MANI (allarga/restringi) → ridimensiona.
        const [a, b] = pin;
        const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
        if (!resize) {
          const f = grab ? rectDi(grab.id) : selezionata ? rectDi(selezionata) : sotto((a.sx + b.sx) / 2, (a.sy + b.sy) / 2);
          if (f) {
            resize = { id: f.id, dist0: dist || 1, w0: f.w, h0: f.h, cx: f.x + f.w / 2, cy: f.y + f.h / 2 };
            selezionata = f.id;
            portaAvanti(f);
          }
        } else {
          const f = rectDi(resize.id);
          if (f) {
            const s = Math.min(4, Math.max(0.3, dist / resize.dist0));
            ridimensiona(f, resize.w0 * s, resize.h0 * s, resize.cx, resize.cy);
          }
        }
        grab = null;
        return;
      }
      resize = null;

      if (pin.length === 1) {
        // PINCH (una mano) → aggancia e sposta liberamente la finestra
        // (pannello di ORION o finestra di qualunque app).
        const m = pin[0];
        if (!grab) {
          const f = sotto(m.sx, m.sy);
          if (f) {
            grab = { id: f.id, offX: m.sx - f.x, offY: m.sy - f.y };
            selezionata = f.id;
            portaAvanti(f);
          }
        } else {
          const f = rectDi(grab.id);
          if (f) sposta(f, m.sx - grab.offX, m.sy - grab.offY);
        }
      } else {
        grab = null;
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
