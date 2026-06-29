"use client";

import { useEffect, useRef } from "react";

// Contenuto dell'OVERLAY nativo della Gesture Mode (caricato solo dalla finestra
// trasparente di ORION Desktop). Traccia le mani in locale (MediaPipe) e manovra
// le FINESTRE-pannello reali via il bridge window.orionDesktop.gesti*. Disegna solo
// il cursore (sfondo trasparente). In un browser normale (senza bridge) è no-op.

const PINCH_ON = 0.05;
const PINCH_OFF = 0.09;
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

type Finestra = { tipo: string; x: number; y: number; w: number; h: number };
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
    let grab: { tipo: string; offX: number; offY: number } | null = null;
    let resize: { tipo: string; dist0: number; w0: number; h0: number; cx: number; cy: number } | null = null;
    let selezionata: string | null = null; // finestra "attiva" (bordo illuminato)
    let traccia: { x: number; y: number; t: number }[] = []; // storia cursore per gli swipe
    let swipeCooldown = 0;

    if (!od?.gestiFinestre) {
      return () => {
        document.documentElement.style.background = htmlBg;
        document.body.style.background = bodyBg;
      };
    }

    const aggiornaBounds = async () => {
      try {
        bounds = await od.gestiFinestre();
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
    const rectDi = (tipo: string) => bounds.finestre.find((f) => f.tipo === tipo) || null;
    // Aggancia una finestra a metà schermo (lato sinistro/destro).
    const snap = (tipo: string, lato: "sx" | "dx") => {
      const o = bounds.origin;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const top = 30; // sotto la barra dei menu
      const bot = 12;
      const w = Math.round(W / 2);
      const h = H - top - bot;
      const x = lato === "sx" ? o.x : o.x + (W - w);
      od.gestiRidimensiona({ tipo, w, h });
      od.gestiSposta({ tipo, x, y: o.y + top });
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

    const gestisci = (mani: Mano[], now: number) => {
      const pin = mani.filter((m) => m.pinch);
      const cursore = pin[0] ?? mani[0] ?? null;
      // SELEZIONE (sticky): la finestra sotto il cursore diventa "attiva" (bordo illuminato).
      if (cursore) {
        const f = sotto(cursore.sx, cursore.sy);
        if (f) selezionata = f.tipo;
      }

      if (pin.length >= 2) {
        // DUE MANI → ridimensiona (ancorato al centro).
        const [a, b] = pin;
        const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
        if (!resize) {
          const f = grab ? rectDi(grab.tipo) : selezionata ? rectDi(selezionata) : sotto((a.sx + b.sx) / 2, (a.sy + b.sy) / 2);
          if (f) {
            resize = { tipo: f.tipo, dist0: dist || 1, w0: f.w, h0: f.h, cx: f.x + f.w / 2, cy: f.y + f.h / 2 };
            selezionata = f.tipo;
            od.gestiAvanti({ tipo: f.tipo });
          }
        } else {
          const s = Math.min(4, Math.max(0.3, dist / resize.dist0));
          const w = resize.w0 * s;
          const h = resize.h0 * s;
          od.gestiRidimensiona({ tipo: resize.tipo, w, h });
          od.gestiSposta({ tipo: resize.tipo, x: resize.cx - w / 2, y: resize.cy - h / 2 });
        }
        grab = null;
        traccia = [];
        return;
      }
      resize = null;

      if (pin.length === 1) {
        // PINCH → aggancia e sposta liberamente la finestra.
        const m = pin[0];
        if (!grab) {
          const f = sotto(m.sx, m.sy);
          if (f) {
            grab = { tipo: f.tipo, offX: m.sx - f.x, offY: m.sy - f.y };
            selezionata = f.tipo;
            od.gestiAvanti({ tipo: f.tipo });
          }
        } else {
          od.gestiSposta({ tipo: grab.tipo, x: m.sx - grab.offX, y: m.sy - grab.offY });
        }
        traccia = [];
        swipeCooldown = now + 300; // grazia dopo aver lasciato il pinch
      } else {
        grab = null;
        // MANO APERTA → swipe sulla finestra SELEZIONATA: sx/dx = aggancia a metà, giù = chiudi.
        if (cursore) {
          traccia.push({ x: cursore.cx, y: cursore.cy, t: now });
          while (traccia.length && now - traccia[0].t > 220) traccia.shift();
          if (now >= swipeCooldown && traccia.length >= 3 && selezionata) {
            const a = traccia[0];
            const b = traccia[traccia.length - 1];
            const dt = b.t - a.t;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            if (dt > 0 && dist > 240 && dist / dt > 1.3) {
              if (Math.abs(dx) > Math.abs(dy) * 1.3) {
                snap(selezionata, dx < 0 ? "sx" : "dx");
                swipeCooldown = now + 900;
                traccia = [];
              } else if (dy > Math.abs(dx) * 1.1) {
                od.gestiChiudi({ tipo: selezionata });
                selezionata = null;
                swipeCooldown = now + 900;
                traccia = [];
              }
            }
          }
        }
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
        const dist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
        const era = pinchStato[i];
        const ora = era ? dist < PINCH_OFF : dist < PINCH_ON;
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
      gestisci(mani, t);
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
      <video ref={videoRef} muted playsInline style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none" }} />
    </div>
  );
}
