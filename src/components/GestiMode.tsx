"use client";

import { useEffect, useRef, useState } from "react";

// GESTURE MODE spaziale: traccia le mani via telecamera (MediaPipe HandLandmarker,
// tutto in LOCALE: nessun fotogramma esce, nessuna chiamata AI) e manipola i
// pannelli fluttuanti di ORION. Pinch (pollice+indice) per agganciare e spostare,
// due mani per ridimensionare, rilascio sulla × o in alto per chiudere. Tocca SOLO
// i pannelli di ORION (sono <div> nella finestra), mai il sistema operativo.

type Mano = { x: number; y: number; pinch: boolean };

// One-Euro filter: smussa il jitter del tracciamento mantenendo la reattività.
class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  // minCutoff basso = movimento molto più fluido a riposo (meno tremolii); beta
  // tiene la reattività quando la mano si muove in fretta.
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

// Pinch come RAPPORTO (dist pollice-indice / dimensione mano): indipendente dalla
// distanza dalla camera → una mano aperta non viene scambiata per pinch. Isteresi.
const PINCH_ON = 0.4; // sotto = pinch
const PINCH_OFF = 0.62; // sopra = mano aperta
// Sensibilità del movimento: solo una zona CENTRALE dell'inquadratura copre tutto
// lo schermo, così il dito non deve mai uscire dall'obiettivo per raggiungere i bordi.
const SENSIBILITA = 2.4;
const VERSIONE_WASM = "0.10.35";

export function GestiMode({
  onSposta,
  onRidimensiona,
  onPortaAvanti,
  onChiudi,
  onSnapHint,
  onSnapApplica,
}: {
  onSposta: (tipo: string, x: number, y: number) => void;
  onRidimensiona: (tipo: string, w: number, h: number) => void;
  onPortaAvanti: (tipo: string) => void;
  onChiudi: (tipo: string) => void;
  onSnapHint: (x: number, y: number) => void;
  onSnapApplica: (tipo: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [stato, setStato] = useState<"carico" | "pronto" | "errore">("carico");

  // Stato dei gesti (in ref: aggiornato nel loop, non causa render).
  const filtri = useRef<OneEuro[]>([]);
  const pinchStato = useRef<boolean[]>([false, false]);
  const grab = useRef<{ tipo: string; offX: number; offY: number } | null>(null);
  const resize = useRef<{ tipo: string; dist0: number; w0: number; h0: number; cx: number; cy: number } | null>(null);
  const ultimoPunto = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks?: { x: number; y: number }[][] }; close: () => void } | null = null;

    const stageRect = () => document.querySelector("[data-gesti-stage]")?.getBoundingClientRect() ?? null;
    const pannelloSotto = (x: number, y: number): string | null => {
      for (const el of document.elementsFromPoint(x, y)) {
        const t = (el as HTMLElement).closest?.("[data-gesti]")?.getAttribute("data-gesti");
        if (t) return t;
      }
      return null;
    };
    const rectDi = (tipo: string) => {
      const el = document.querySelector(`[data-gesti="${tipo}"]`);
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
    };
    const sopraChiusura = (x: number, y: number, tipo: string): boolean => {
      for (const el of document.elementsFromPoint(x, y)) {
        if ((el as HTMLElement).getAttribute?.("data-gesti-close") === tipo) return true;
      }
      const sr = stageRect();
      return !!sr && y < sr.top + 64; // fascia di chiusura in alto
    };

    const disegnaCursori = (mani: Mano[]) => {
      const cv = overlayRef.current;
      if (!cv) return;
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const m of mani) {
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.pinch ? 10 : 16, 0, Math.PI * 2);
        ctx.strokeStyle = m.pinch ? "#22d3ee" : "rgba(34,211,238,0.5)";
        ctx.lineWidth = m.pinch ? 4 : 2;
        ctx.stroke();
        if (m.pinch) {
          ctx.fillStyle = "rgba(34,211,238,0.35)";
          ctx.fill();
        }
      }
    };

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
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
        const pollice = lm[4];
        const indice = lm[8];
        // rapporto pinch = dist pollice-indice / dimensione mano (polso 0 → nocca media 9)
        const ref = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.0001;
        const ratio = Math.hypot(pollice.x - indice.x, pollice.y - indice.y) / ref;
        // isteresi
        const era = pinchStato.current[i];
        const ora = era ? ratio < PINCH_OFF : ratio < PINCH_ON;
        pinchStato.current[i] = ora;
        // punto = midpoint, AMPLIFICATO attorno al centro (sensibilità), specchiato.
        const cx = 0.5 + ((pollice.x + indice.x) / 2 - 0.5) * SENSIBILITA;
        const cy = 0.5 + ((pollice.y + indice.y) / 2 - 0.5) * SENSIBILITA;
        const nx = 1 - cx;
        const ny = cy;
        if (!filtri.current[i * 2]) {
          filtri.current[i * 2] = new OneEuro();
          filtri.current[i * 2 + 1] = new OneEuro();
        }
        // Filtra (anti-tremolio) e blocca ai bordi dello schermo.
        const x = Math.max(0, Math.min(window.innerWidth, filtri.current[i * 2].filtra(nx * window.innerWidth, t)));
        const y = Math.max(0, Math.min(window.innerHeight, filtri.current[i * 2 + 1].filtra(ny * window.innerHeight, t)));
        mani.push({ x, y, pinch: ora });
      }
      disegnaCursori(mani);
      gestisci(mani);
    };

    const gestisci = (mani: Mano[]) => {
      const pinching = mani.filter((m) => m.pinch);
      if (pinching.length >= 2) {
        // RIDIMENSIONA con due mani (ancorato al centro).
        const [a, b] = pinching;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (!resize.current) {
          const tipo = grab.current?.tipo ?? pannelloSotto((a.x + b.x) / 2, (a.y + b.y) / 2);
          const r = tipo ? rectDi(tipo) : null;
          if (tipo && r) {
            resize.current = { tipo, dist0: dist || 1, w0: r.w, h0: r.h, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
            onPortaAvanti(tipo);
          }
        } else {
          const s = Math.min(4, Math.max(0.3, dist / resize.current.dist0));
          const w = resize.current.w0 * s;
          const h = resize.current.h0 * s;
          onRidimensiona(resize.current.tipo, w, h);
          onSposta(resize.current.tipo, resize.current.cx - w / 2, resize.current.cy - h / 2);
        }
        grab.current = null;
        return;
      }
      resize.current = null;

      if (pinching.length === 1) {
        const m = pinching[0];
        ultimoPunto.current = { x: m.x, y: m.y };
        if (!grab.current) {
          const tipo = pannelloSotto(m.x, m.y);
          const r = tipo ? rectDi(tipo) : null;
          if (tipo && r) {
            grab.current = { tipo, offX: m.x - r.x, offY: m.y - r.y };
            onPortaAvanti(tipo);
          }
        } else {
          onSposta(grab.current.tipo, m.x - grab.current.offX, m.y - grab.current.offY);
          onSnapHint(m.x, m.y); // anteprima della zona di snap
        }
      } else {
        // nessun pinch → rilascio: CHIUSURA se sopra la zona, altrimenti SNAP.
        if (grab.current && ultimoPunto.current) {
          const { x, y } = ultimoPunto.current;
          if (sopraChiusura(x, y, grab.current.tipo)) onChiudi(grab.current.tipo);
          else onSnapApplica(grab.current.tipo);
        }
        grab.current = null;
      }
    };

    // Avvio: camera + caricamento del modello, poi parte il loop.
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (!vivo) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(
          `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSIONE_WASM}/wasm`
        );
        landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
        if (!vivo) return;
        setStato("pronto");
        loop();
      } catch (e) {
        console.error("[GestiMode]", e);
        if (vivo) setStato("errore");
      }
    })();

    return () => {
      vivo = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        landmarker?.close();
      } catch {
        /* noop */
      }
    };
  }, [onSposta, onRidimensiona, onPortaAvanti, onChiudi, onSnapHint, onSnapApplica]);

  return (
    <>
      {/* La telecamera serve SOLO al tracciamento delle mani → resta INVISIBILE
          (non si vede in modalità gesti). Si vede solo per scansione documenti
          e per la modalità visione/assistenza. */}
      <video ref={videoRef} muted playsInline className="pointer-events-none fixed bottom-0 left-0 h-px w-px opacity-0" />
      {/* Solo il cursore della mano (non l'immagine della camera) per mirare. */}
      <canvas ref={overlayRef} className="pointer-events-none fixed inset-0 z-[56]" />
      {stato !== "pronto" && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-[57] rounded-lg bg-black/60 px-3 py-1.5 text-xs text-slate-300">
          {stato === "carico" ? "Avvio del controllo a gesti…" : "Telecamera non disponibile: usa il mouse."}
        </div>
      )}
    </>
  );
}
