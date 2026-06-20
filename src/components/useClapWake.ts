"use client";

import { useEffect, useRef } from "react";

// Rileva il DOPPIO BATTITO DI MANI (alla Iron Man) per risvegliare ORION.
// Attivo solo quando `attivo` è true (durante lo standby): apre il microfono,
// analizza l'energia audio e cerca due picchi secchi ravvicinati.
export function useClapWake(attivo: boolean, onDoppioClap: () => void) {
  const cbRef = useRef(onDoppioClap);
  cbRef.current = onDoppioClap;

  useEffect(() => {
    if (!attivo || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let annullato = false;

    const battiti: number[] = [];
    let ultimoPicco = 0;
    const SOGLIA_ALTA = 0.45; // picco secco (clap)
    const COOLDOWN = 200; // ms tra un clap e l'altro
    const FINESTRA = 1400; // ms entro cui i due clap valgono come "doppio"

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (annullato) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
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
          if (picco > SOGLIA_ALTA && ora - ultimoPicco > COOLDOWN) {
            ultimoPicco = ora;
            battiti.push(ora);
            while (battiti.length && ora - battiti[0] > FINESTRA) battiti.shift();
            if (battiti.length >= 2) {
              battiti.length = 0;
              cbRef.current();
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        /* microfono negato: il risveglio resta possibile col tap */
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
