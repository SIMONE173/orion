"use client";

import { useEffect, useRef, useState } from "react";
import { IconClose } from "./icons";

// Cattura un'immagine dalla fotocamera (o da file) e la restituisce come data URL JPEG.
export function CameraCapture({
  onCapture,
  onClose,
  modo = "documento",
  scattaTick = 0,
}: {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
  modo?: "documento" | "descrizione";
  scattaTick?: number;
}) {
  const titolo = modo === "descrizione" ? "Inquadra la foto da descrivere" : "Digitalizza un documento";
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let attivo = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!attivo) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setPronto(true);
        }
      } catch {
        setErrore("Fotocamera non disponibile. Carica un'immagine dal dispositivo.");
      }
    })();
    return () => {
      attivo = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const ridimensiona = (
    src: HTMLVideoElement | HTMLImageElement,
    w: number,
    h: number
  ): string => {
    const max = 1400;
    const scala = Math.min(1, max / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scala);
    canvas.height = Math.round(h * scala);
    canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  };

  const scatta = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    onCapture(ridimensiona(v, v.videoWidth, v.videoHeight));
  };

  // Scatto comandato a voce ("scatta"): page.tsx incrementa scattaTick. Memorizzo il
  // valore al mount così uno scatto vecchio non fa partire la foto alla riapertura.
  const tickIniziale = useRef(scattaTick);
  useEffect(() => {
    if (scattaTick > tickIniziale.current && pronto && videoRef.current?.videoWidth) {
      onCapture(ridimensiona(videoRef.current, videoRef.current.videoWidth, videoRef.current.videoHeight));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scattaTick]);

  const daFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => onCapture(ridimensiona(img, img.naturalWidth, img.naturalHeight));
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="glass relative w-full max-w-3xl rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-100">{titolo}</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {errore ? (
          <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            {errore}
          </div>
        ) : (
          <div className="relative mb-3 grid aspect-[4/3] max-h-[65vh] w-full place-items-center overflow-hidden rounded-xl border border-white/10 bg-black">
            {/* object-contain: si vede TUTTO il foglio, senza tagliare in alto/basso */}
            <video ref={videoRef} className="h-full w-full object-contain" muted playsInline />
            {!pronto && (
              <div className="absolute inset-0 grid place-items-center text-sm text-slate-400">Avvio fotocamera…</div>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          {!errore && (
            <button
              onClick={scatta}
              disabled={!pronto}
              className="rounded-xl bg-cyan-500/90 px-6 py-3 font-medium text-slate-900 hover:bg-cyan-400 disabled:opacity-50"
            >
              ◉ Scatta
            </button>
          )}
          <label className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-slate-200 hover:bg-white/10">
            Carica immagine
            <input type="file" accept="image/*" className="hidden" onChange={daFile} />
          </label>
        </div>
        {!errore && (
          <p className="mt-3 text-center text-xs text-slate-500">
            Inquadra tutto il foglio, poi premi Scatta o di&apos; <span className="text-cyan-300/80">“scatta”</span> a voce.
          </p>
        )}
      </div>
    </div>
  );
}
