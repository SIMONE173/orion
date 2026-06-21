"use client";

import { useEffect, useRef } from "react";

// Rileva lo SCHIOCCO DI DITA e lo usa come interruttore hands-free del microfono
// (attiva/muta ORION) — e per risvegliarlo dallo standby. Tiene aperto un piccolo
// flusso audio dedicato e cerca un transiente secco e isolato (lo schiocco).
// Attivo quando `attivo` è true (es. utente loggato).
export function useSnapToggle(attivo: boolean, onSnap: () => void) {
  const cbRef = useRef(onSnap);
  cbRef.current = onSnap;

  useEffect(() => {
    if (!attivo || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let annullato = false;

    // Lo schiocco è un picco NETTO sopra il rumore di fondo. Rilevazione adattiva:
    // teniamo una linea di base (media lenta) e scattiamo quando il picco la supera
    // di molto ed è oltre una soglia minima. Così si adatta al microfono.
    const SOGLIA_MIN = 0.22; // picco minimo assoluto
    const FATTORE = 3; // quante volte sopra la base per essere uno "schiocco"
    const COOLDOWN = 500; // ms tra uno schiocco e l'altro (un solo toggle)
    let ultimoSnap = 0;
    let base = 0.02; // linea di base del rumore (si adatta)

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (annullato) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        await ctx.resume().catch(() => {}); // l'AudioContext può partire sospeso
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);

        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let picco = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = Math.abs(buf[i] - 128) / 128;
            if (v > picco) picco = v;
          }
          const ora = performance.now();
          // Schiocco = picco netto: oltre la soglia minima E molto sopra la base.
          if (picco > SOGLIA_MIN && picco > base * FATTORE && ora - ultimoSnap > COOLDOWN) {
            ultimoSnap = ora;
            cbRef.current();
          }
          // Aggiorna la linea di base solo coi suoni "normali" (non i picchi),
          // così resta una stima del rumore di fondo.
          if (picco < SOGLIA_MIN) base = base * 0.95 + picco * 0.05;
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        /* microfono negato: si potrà comunque usare il tasto */
      }
    })();

    return () => {
      annullato = true;
      if (raf) cancelAnimationFrame(raf);
      if (ctx) ctx.close().catch(() => {});
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [attivo]);
}
