"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { IconClose } from "./icons";

// MODALITÀ VISIONE: telecamera dal vivo con cui ORION assiste un'attività pratica.
// Loop continuo (una richiesta in volo) verso /api/visione → voce + overlay sopra
// l'inquadratura. Opt-in: parte solo quando l'utente avvia e si ferma quando vuole.
// Nessun fotogramma viene salvato.

export type VisioneHandle = { chiedi: (testo: string) => void };

type Evidenzia = { etichetta: string; forma: string; x: number; y: number; w?: number; h?: number };

const FLOOR_MS = 700; // pausa minima tra un'analisi e la successiva
const DIFF_SOGLIA = 7; // sotto questa differenza media il fotogramma è "fermo" → salta

export const VisioneMode = forwardRef<VisioneHandle, { onClose: () => void; parla: (t: string) => void }>(
  function VisioneMode({ onClose, parla }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [dispositivi, setDispositivi] = useState<MediaDeviceInfo[]>([]);
    const [deviceId, setDeviceId] = useState<string>("");
    const [attiva, setAttiva] = useState(false);
    const [stato, setStato] = useState<"ferma" | "guardo" | "analizzo">("ferma");
    const [errore, setErrore] = useState<string | null>(null);

    const attivaRef = useRef(false);
    const inFlightRef = useRef(false);
    const pendingRef = useRef<string | null>(null);
    const lastThumbRef = useRef<Uint8ClampedArray | null>(null);
    const storiaRef = useRef<string[]>([]);
    const lastParlaRef = useRef("");
    const overlayRef = useRef<Evidenzia[]>([]);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Cattura fotogramma (ridotto) + miniatura grigia per il frame-diff ──────
    const catturaFrame = useCallback((): { dataUrl: string; thumb: Uint8ClampedArray } | null => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return null;
      const max = 768;
      const scala = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(v.videoWidth * scala);
      c.height = Math.round(v.videoHeight * scala);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", 0.7);
      // miniatura 32x24 grayscale
      const tc = document.createElement("canvas");
      tc.width = 32;
      tc.height = 24;
      const tctx = tc.getContext("2d")!;
      tctx.drawImage(v, 0, 0, 32, 24);
      const px = tctx.getImageData(0, 0, 32, 24).data;
      const thumb = new Uint8ClampedArray(32 * 24);
      for (let i = 0; i < thumb.length; i++) {
        thumb[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
      }
      return { dataUrl, thumb };
    }, []);

    const diffPiccolo = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => {
      let somma = 0;
      for (let i = 0; i < a.length; i++) somma += Math.abs(a[i] - b[i]);
      return somma / a.length < DIFF_SOGLIA;
    };

    // ── Overlay: mappa le coordinate normalizzate sul video (object-contain) ───
    const disegnaOverlay = useCallback(() => {
      const v = videoRef.current;
      const cv = canvasRef.current;
      if (!v || !cv) return;
      const cw = v.clientWidth;
      const ch = v.clientHeight;
      cv.width = cw;
      cv.height = ch;
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, cw, ch);
      if (!v.videoWidth) return;
      const scala = Math.min(cw / v.videoWidth, ch / v.videoHeight);
      const dw = v.videoWidth * scala;
      const dh = v.videoHeight * scala;
      const ox = (cw - dw) / 2;
      const oy = (ch - dh) / 2;
      const px = (x: number) => ox + x * dw;
      const py = (y: number) => oy + y * dh;
      for (const e of overlayRef.current) {
        const allerta = e.forma === "attenzione";
        const colore = allerta ? "#fbbf24" : "#22d3ee";
        ctx.strokeStyle = colore;
        ctx.fillStyle = colore;
        ctx.lineWidth = 3;
        const x = px(e.x);
        const y = py(e.y);
        if (e.forma === "box" && e.w != null && e.h != null) {
          ctx.strokeRect(x, y, e.w * dw, e.h * dh);
        } else if (e.forma === "freccia") {
          ctx.beginPath();
          ctx.moveTo(x - 36, y - 36);
          ctx.lineTo(x, y);
          ctx.lineTo(x - 12, y - 6);
          ctx.moveTo(x, y);
          ctx.lineTo(x - 6, y - 12);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (e.etichetta) {
          ctx.font = "600 14px system-ui, sans-serif";
          const tw = ctx.measureText(e.etichetta).width;
          const lx = e.forma === "box" ? x : x + 18;
          const ly = e.forma === "box" ? y - 8 : y;
          ctx.fillStyle = "rgba(0,0,0,0.65)";
          ctx.fillRect(lx - 4, ly - 16, tw + 8, 20);
          ctx.fillStyle = colore;
          ctx.fillText(e.etichetta, lx, ly);
        }
      }
    }, []);

    // ── Loop di analisi ────────────────────────────────────────────────────────
    const programma = useCallback((fn: () => void) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (attivaRef.current) timerRef.current = setTimeout(fn, FLOOR_MS);
    }, []);

    const analizza = useCallback(async () => {
      if (!attivaRef.current || inFlightRef.current) return;
      const frame = catturaFrame();
      if (!frame) {
        programma(analizza);
        return;
      }
      const domanda = pendingRef.current;
      pendingRef.current = null;
      // Scena ferma e nessuna domanda → salta (resta "live" senza sprecare chiamate).
      if (!domanda && lastThumbRef.current && diffPiccolo(frame.thumb, lastThumbRef.current)) {
        programma(analizza);
        return;
      }
      lastThumbRef.current = frame.thumb;
      inFlightRef.current = true;
      setStato("analizzo");
      try {
        const res = await fetch("/api/visione", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frame: frame.dataUrl,
            modo: domanda ? "domanda" : "osserva",
            domanda: domanda ?? undefined,
            storia: storiaRef.current,
          }),
        });
        const d = (await res.json()) as { parla?: string; evidenzia?: Evidenzia[] };
        overlayRef.current = Array.isArray(d.evidenzia) ? d.evidenzia : [];
        disegnaOverlay();
        const dire = (d.parla ?? "").trim();
        if (dire && dire !== lastParlaRef.current) {
          lastParlaRef.current = dire;
          storiaRef.current = [...storiaRef.current, dire].slice(-4);
          parla(dire);
        }
      } catch {
        /* un colpo a vuoto non interrompe il flusso */
      }
      inFlightRef.current = false;
      setStato(attivaRef.current ? "guardo" : "ferma");
      programma(analizza);
    }, [catturaFrame, disegnaOverlay, parla, programma]);

    // Domanda prioritaria dall'esterno (voce o pulsante).
    useImperativeHandle(ref, () => ({
      chiedi: (testo: string) => {
        const t = (testo ?? "").trim();
        if (!t) return;
        pendingRef.current = t;
        if (!inFlightRef.current) {
          if (timerRef.current) clearTimeout(timerRef.current);
          analizza();
        }
      },
    }));

    // ── Avvio / stop telecamera ──────────────────────────────────────────────
    const ferma = useCallback(() => {
      attivaRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      lastThumbRef.current = null;
      overlayRef.current = [];
      disegnaOverlay();
      setAttiva(false);
      setStato("ferma");
    }, [disegnaOverlay]);

    const avvia = useCallback(
      async (id?: string) => {
        setErrore(null);
        try {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          const stream = await navigator.mediaDevices.getUserMedia({
            video: id ? { deviceId: { exact: id } } : { facingMode: "environment" },
            audio: false,
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          // Ora che c'è il permesso, le etichette dei dispositivi sono leggibili.
          const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
          setDispositivi(devs);
          if (!id && devs[0]) setDeviceId(devs[0].deviceId);
          attivaRef.current = true;
          setAttiva(true);
          setStato("guardo");
          lastParlaRef.current = "";
          if (timerRef.current) clearTimeout(timerRef.current);
          analizza();
        } catch {
          setErrore("Telecamera non disponibile o permesso negato. Controlla i permessi della fotocamera.");
          setAttiva(false);
        }
      },
      [analizza]
    );

    // Cleanup all'uscita.
    useEffect(() => {
      return () => {
        attivaRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
    }, []);

    const cambiaDispositivo = (id: string) => {
      setDeviceId(id);
      if (attivaRef.current) avvia(id);
    };

    const etichetta = stato === "analizzo" ? "Analizzo…" : stato === "guardo" ? "Ti guardo" : "In pausa";

    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-black/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${attiva ? "bg-cyan-400 animate-pulse" : "bg-slate-600"}`} />
            <h3 className="font-semibold text-slate-100">Modalità visione</h3>
            <span className="text-sm text-slate-400">{etichetta}</span>
          </div>
          <button
            onClick={() => {
              ferma();
              onClose();
            }}
            className="grid size-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10"
            aria-label="Chiudi"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mx-auto flex w-full max-w-5xl flex-1 items-center justify-center overflow-hidden px-5">
          <div className="relative h-full max-h-[72vh] w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video ref={videoRef} className="h-full w-full object-contain" muted playsInline />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            {!attiva && !errore && (
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="mb-4 max-w-md text-sm text-slate-400">
                    Avvia la telecamera e mostrami cosa stai facendo: ti guiderò passo passo, con
                    evidenziazioni sull&apos;inquadratura.
                  </p>
                  <button
                    onClick={() => avvia(deviceId || undefined)}
                    className="rounded-xl bg-cyan-500/90 px-6 py-3 font-medium text-slate-900 hover:bg-cyan-400"
                  >
                    ▶ Avvia telecamera
                  </button>
                </div>
              </div>
            )}
            {errore && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center">
                <p className="max-w-md text-sm text-amber-200">{errore}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 px-5 py-4">
          {attiva ? (
            <button
              onClick={ferma}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-slate-100 hover:bg-white/10"
            >
              ⏹ Ferma
            </button>
          ) : (
            <button
              onClick={() => avvia(deviceId || undefined)}
              className="rounded-xl bg-cyan-500/90 px-5 py-2.5 font-medium text-slate-900 hover:bg-cyan-400"
            >
              ▶ Avvia
            </button>
          )}
          {dispositivi.length > 1 && (
            <select
              value={deviceId}
              onChange={(e) => cambiaDispositivo(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-200 outline-none"
            >
              {dispositivi.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId} className="bg-slate-900">
                  {d.label || `Telecamera ${i + 1}`}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-slate-500">Parla per chiedere: &quot;cosa sto facendo?&quot;, &quot;errori?&quot;, &quot;prossimo passo?&quot;</span>
        </div>
      </div>
    );
  }
);
