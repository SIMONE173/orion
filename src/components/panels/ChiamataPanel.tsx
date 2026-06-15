"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "chiamata" }>["dati"];

export function ChiamataPanel({ dati }: { dati: Dati }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <div className="relative grid size-32 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20" />
        <span className="absolute inset-2 rounded-full bg-emerald-400/10" />
        <span className="relative grid size-20 place-items-center rounded-full bg-emerald-500/25 text-3xl text-emerald-200">
          ✆
        </span>
      </div>
      <div>
        <div className="text-sm uppercase tracking-widest text-emerald-300/70">Chiamata in corso</div>
        <div className="mt-1 text-2xl font-semibold text-slate-100">{dati.nome}</div>
        {dati.numero && <div className="mt-1 font-mono text-slate-400">{dati.numero}</div>}
      </div>
      {dati.numero ? (
        <a
          href={`tel:${dati.numero.replace(/\s+/g, "")}`}
          className="rounded-xl border border-emerald-400/40 bg-emerald-400/15 px-6 py-3 font-medium text-emerald-100 hover:bg-emerald-400/25"
        >
          ✆ Chiama ora
        </a>
      ) : (
        <div className="text-sm text-slate-500">Numero non disponibile.</div>
      )}
      <div className="text-xs text-slate-600">
        Su dispositivo apre il telefono. Su desktop è dimostrativo.
      </div>
    </div>
  );
}
