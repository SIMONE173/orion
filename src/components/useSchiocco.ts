"use client";

import { useEffect, useRef } from "react";

// UNO SCHIOCCO DI DITA (o un colpo secco) mentre ORION sta parlando → la frase
// in corso si zittisce (il testo resta in chat, da leggere con calma).
// Attivo SOLO durante il parlato: ascolta il microfono e cerca UN picco secco.
// Soglia alta e piccolo riscaldamento iniziale: la voce di ORION dagli
// altoparlanti non deve auto-zittirlo.
export function useSchiocco(attivo: boolean, onSchiocco: () => void) {
  const cbRef = useRef(onSchiocco);
  cbRef.current = onSchiocco;

  useEffect(() => {
    if (!attivo || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let annullato = false;

    const SOGLIA = 0.62; // solo transienti davvero secchi (schiocco, battito)
    const RISCALDAMENTO = 450; // ms iniziali ignorati (attacco della voce)
    const avvio = performance.now();
    let scattato = false;

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
        await ctx.resume().catch(() => {});
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
          if (!scattato && picco > SOGLIA && ora - avvio > RISCALDAMENTO) {
            scattato = true; // una volta sola per frase
            cbRef.current();
            return; // il cleanup arriva con speaking=false
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        /* microfono negato: restano click sull'audio o sul nucleo */
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
