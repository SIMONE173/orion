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

    // Uno schiocco si distingue dalla VOCE per 3 cose insieme:
    //  1) PICCO secco (ampiezza alta e improvvisa)
    //  2) preceduto da un attimo di QUIETE (la voce è continua → niente quiete)
    //  3) ricco di ALTE FREQUENZE (è un "click" acuto; la voce è grave)
    // Devono valere tutte e tre → quasi mai falsi positivi mentre si parla.
    const PICCO = 0.3; // ampiezza del transiente
    const QUIETE = 0.12; // i ~150ms precedenti devono stare sotto questo
    const ALTE = 0.35; // quota di energia nelle alte frequenze (0..1)
    const COOLDOWN = 1000; // ms tra uno schiocco e l'altro
    const STORIA = 9; // ~150ms di frame precedenti
    let ultimoSnap = 0;
    const storia: number[] = [];

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
        const td = new Uint8Array(analyser.fftSize); // dominio del tempo
        const fd = new Uint8Array(analyser.frequencyBinCount); // spettro
        const sogliaBin = Math.floor(analyser.frequencyBinCount * 0.45); // ~oltre 5kHz = "alte"

        const tick = () => {
          // 1) Picco (ampiezza)
          analyser.getByteTimeDomainData(td);
          let picco = 0;
          for (let i = 0; i < td.length; i++) {
            const v = Math.abs(td[i] - 128) / 128;
            if (v > picco) picco = v;
          }
          // 3) Quota di alte frequenze
          analyser.getByteFrequencyData(fd);
          let tot = 0;
          let alti = 0;
          for (let i = 0; i < fd.length; i++) {
            tot += fd[i];
            if (i >= sogliaBin) alti += fd[i];
          }
          const quotaAlte = tot > 0 ? alti / tot : 0;

          const ora = performance.now();
          const quietePrima = storia.length ? Math.max(...storia) : 0; // 2) quiete precedente
          if (
            picco > PICCO &&
            quietePrima < QUIETE &&
            quotaAlte > ALTE &&
            ora - ultimoSnap > COOLDOWN
          ) {
            ultimoSnap = ora;
            cbRef.current();
          }
          storia.push(picco);
          if (storia.length > STORIA) storia.shift();
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
