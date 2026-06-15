"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "proattiva" }>["dati"];

const icona: Record<string, string> = {
  non_confermati: "⏳",
  pagamenti: "€",
  inattivi: "👤",
  promemoria: "🔔",
  buchi: "🗓",
};

export function ProattivaPanel({ dati }: { dati: Dati }) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">Da gestire</h2>
      {dati.segnalazioni.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-400">
          <span className="text-3xl">✓</span>
          Tutto sotto controllo.
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-auto pr-1">
          {dati.segnalazioni.map((s, i) => (
            <div key={i} className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-lg">{icona[s.categoria] ?? "•"}</span>
                <span className="font-medium text-slate-100">{s.titolo}</span>
              </div>
              <div className="mb-2 text-sm text-slate-400">{s.dettaglio}</div>
              <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.06] px-3 py-1.5 text-sm text-cyan-100">
                → {s.azione}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
