"use client";

import { useEffect, useRef } from "react";

// Contenuto dell'OVERLAY nativo della Modalità Affiancamento: una finestra
// trasparente e click-through (aperta da ORION Desktop) che disegna le EVIDENZE
// sopra lo schermo reale — sopra il gestionale/sito del professionista. Riceve i
// riquadri da window.orionDesktop.onAffiancaDisegna. In un browser è no-op.

type Evidenza = { etichetta: string; forma: string; x: number; y: number; w?: number; h?: number };

export default function AffiancaOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const htmlBg = document.documentElement.style.background;
    const bodyBg = document.body.style.background;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const od = (window as any).orionDesktop;
    let evidenze: Evidenza[] = [];
    let apparse = 0; // istante di comparsa, per il fade-in
    let raf = 0;

    if (od?.onAffiancaDisegna) {
      od.onAffiancaDisegna((nuove: Evidenza[]) => {
        evidenze = Array.isArray(nuove) ? nuove : [];
        apparse = performance.now();
      });
    }

    const disegna = () => {
      raf = requestAnimationFrame(disegna);
      const cv = canvasRef.current;
      if (!cv) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      if (cv.width !== W) cv.width = W;
      if (cv.height !== H) cv.height = H;
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);
      if (!evidenze.length) return;

      const t = performance.now();
      const entrata = Math.min(1, (t - apparse) / 260); // fade-in morbido
      const pulse = 0.6 + 0.4 * Math.sin(t / 320); // respiro
      const px = (x: number) => x * W;
      const py = (y: number) => y * H;

      for (const e of evidenze) {
        const allerta = e.forma === "attenzione";
        const colore = allerta ? "#fbbf24" : "#22d3ee";
        ctx.save();
        ctx.globalAlpha = entrata;
        ctx.strokeStyle = colore;
        ctx.fillStyle = colore;
        ctx.lineWidth = 3;
        ctx.shadowColor = colore;
        ctx.shadowBlur = 14 * pulse;
        const x = px(e.x);
        const y = py(e.y);

        if (e.forma === "box" && e.w != null && e.h != null) {
          const w = e.w * W;
          const h = e.h * H;
          const r = 10;
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + w, y, x + w, y + h, r);
          ctx.arcTo(x + w, y + h, x, y + h, r);
          ctx.arcTo(x, y + h, x, y, r);
          ctx.arcTo(x, y, x + w, y, r);
          ctx.stroke();
        } else if (e.forma === "freccia") {
          ctx.beginPath();
          ctx.moveTo(x - 46, y - 46);
          ctx.lineTo(x, y);
          ctx.lineTo(x - 14, y - 7);
          ctx.moveTo(x, y);
          ctx.lineTo(x - 7, y - 14);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, 18, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (e.etichetta) {
          ctx.shadowBlur = 0;
          ctx.font = "600 15px system-ui, -apple-system, sans-serif";
          const tw = ctx.measureText(e.etichetta).width;
          const lx = e.forma === "box" ? x : x + 24;
          const ly = e.forma === "box" ? y - 10 : y - 2;
          ctx.fillStyle = "rgba(2,6,12,0.78)";
          ctx.beginPath();
          ctx.roundRect(lx - 6, ly - 18, tw + 12, 24, 6);
          ctx.fill();
          ctx.fillStyle = colore;
          ctx.fillText(e.etichetta, lx, ly);
        }
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(disegna);

    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.style.background = htmlBg;
      document.body.style.background = bodyBg;
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "transparent" }}>
      {/* Trasparenza garantita dal PRIMO paint (SSR): niente velo scuro. */}
      <style>{`html,body{background:transparent !important;overflow:hidden}`}</style>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none" }} />
    </div>
  );
}
