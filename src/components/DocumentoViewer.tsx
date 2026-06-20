"use client";

import { useEffect, useMemo, useRef } from "react";
import { IconClose } from "@/components/icons";

export type DocVisore = {
  titolo: string;
  tipo?: string;
  cliente_nome?: string | null;
  immagine?: string | null;
  testo?: string | null;
};

// Spezza il testo evidenziando le occorrenze della ricerca.
function evidenzia(testo: string, cerca: string) {
  if (!cerca.trim()) return [{ t: testo, hit: false }];
  const parts: { t: string; hit: boolean }[] = [];
  const low = testo.toLowerCase();
  const q = cerca.toLowerCase();
  let i = 0;
  while (i < testo.length) {
    const idx = low.indexOf(q, i);
    if (idx === -1) {
      parts.push({ t: testo.slice(i), hit: false });
      break;
    }
    if (idx > i) parts.push({ t: testo.slice(i, idx), hit: false });
    parts.push({ t: testo.slice(idx, idx + q.length), hit: true });
    i = idx + q.length;
  }
  return parts;
}

export function DocumentoViewer({
  documento,
  zoom,
  cerca,
  onZoom,
  onCerca,
  onClose,
}: {
  documento: DocVisore;
  zoom: number;
  cerca: string;
  onZoom: (verso: "avvicina" | "allontana" | "reset") => void;
  onCerca: (t: string) => void;
  onClose: () => void;
}) {
  const primoHit = useRef<HTMLElement | null>(null);
  const parti = useMemo(() => evidenzia(documento.testo ?? "", cerca), [documento.testo, cerca]);

  // Scorri alla prima occorrenza quando cambia la ricerca.
  useEffect(() => {
    if (cerca.trim() && primoHit.current) {
      primoHit.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [cerca, parti]);

  let trovatoPrimo = false;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black/70 backdrop-blur-sm">
      <div className="glass mx-auto mt-8 flex h-[calc(100%-4rem)] w-full max-w-5xl flex-col rounded-2xl p-5">
        {/* Barra */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-100">{documento.titolo}</div>
            {documento.cliente_nome && (
              <div className="text-xs text-slate-400">{documento.cliente_nome}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onZoom("allontana")} className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-lg text-slate-200 hover:bg-white/10" title="Riduci">−</button>
            <span className="w-12 text-center text-xs text-slate-400">{Math.round(zoom * 100)}%</span>
            <button onClick={() => onZoom("avvicina")} className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-lg text-slate-200 hover:bg-white/10" title="Ingrandisci">+</button>
            <button onClick={() => onClose()} className="ml-2 grid size-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" title="Chiudi">
              <IconClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          {/* Immagine */}
          <div className="min-h-0 overflow-auto rounded-xl border border-white/10 bg-black/30 p-2">
            {documento.immagine ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={documento.immagine}
                alt={documento.titolo}
                style={{ width: `${zoom * 100}%` }}
                className="h-auto max-w-none rounded-lg"
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-slate-500">
                Nessuna immagine per questo documento.
              </div>
            )}
          </div>

          {/* Testo OCR con evidenziazione */}
          <div className="flex min-h-0 flex-col">
            <input
              value={cerca}
              onChange={(e) => onCerca(e.target.value)}
              placeholder="Cerca nel testo…"
              className="mb-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            />
            <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-white/5 p-4 text-[15px] leading-relaxed text-slate-200">
              {documento.testo ? (
                parti.map((p, i) => {
                  if (p.hit && !trovatoPrimo) {
                    trovatoPrimo = true;
                    return (
                      <mark key={i} ref={(el) => { primoHit.current = el; }} className="rounded bg-cyan-400/40 px-0.5 text-cyan-50">
                        {p.t}
                      </mark>
                    );
                  }
                  return p.hit ? (
                    <mark key={i} className="rounded bg-cyan-400/30 px-0.5 text-cyan-50">{p.t}</mark>
                  ) : (
                    <span key={i}>{p.t}</span>
                  );
                })
              ) : (
                <span className="text-slate-500">Nessun testo digitalizzato per questo documento.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
