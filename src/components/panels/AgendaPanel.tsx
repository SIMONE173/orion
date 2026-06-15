"use client";

import type { Vista } from "@/lib/orion/views";
import { ora, etichettaStato } from "./format";

type Dati = Extract<Vista, { tipo: "agenda" }>["dati"];

const statoColore: Record<string, string> = {
  confermato: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
  da_confermare: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  cancellato: "bg-rose-400/15 text-rose-300 border-rose-400/30",
};

export function AgendaPanel({ titolo, dati }: { titolo: string; dati: Dati }) {
  const app = [...dati.appuntamenti].sort((a, b) => a.inizio.localeCompare(b.inizio));

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">{titolo}</h2>
      {app.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">
          Nessun appuntamento in questo periodo.
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-auto pr-1">
          {app.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] p-3.5"
            >
              <div className="w-20 shrink-0 text-right">
                <div className="font-mono text-base text-cyan-200">{ora(a.inizio)}</div>
                <div className="font-mono text-xs text-slate-500">{ora(a.fine)}</div>
              </div>
              <div className="w-px self-stretch bg-white/10" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-100">{a.titolo}</div>
                {a.cliente_nome && (
                  <div className="truncate text-sm text-slate-400">{a.cliente_nome}</div>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${
                  statoColore[a.stato] ?? "bg-white/5 text-slate-300 border-white/10"
                }`}
              >
                {etichettaStato(a.stato)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
