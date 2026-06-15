"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "attesa" }>["dati"];

export function AttesaPanel({ dati }: { dati: Dati }) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">Lista d&apos;attesa</h2>
      {dati.voci.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">
          Nessuno in lista d&apos;attesa.
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-auto pr-1">
          {dati.voci.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-100">{v.nome}</div>
                {v.motivo && <div className="truncate text-sm text-slate-400">{v.motivo}</div>}
              </div>
              {v.priorita === "alta" && (
                <span className="shrink-0 rounded-full border border-rose-400/30 bg-rose-400/15 px-2.5 py-1 text-xs text-rose-200">
                  Priorità alta
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
