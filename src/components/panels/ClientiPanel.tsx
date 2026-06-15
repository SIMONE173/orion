"use client";

import type { Vista } from "@/lib/orion/views";
import { dataBreve } from "./format";

type Dati = Extract<Vista, { tipo: "clienti" }>["dati"];

export function ClientiPanel({ titolo, dati }: { titolo: string; dati: Dati }) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">{titolo}</h2>
      {dati.clienti.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">
          Nessun cliente trovato.
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-auto pr-1">
          {dati.clienti.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] p-3.5"
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-cyan-400/15 text-sm font-semibold text-cyan-200">
                {c.nome.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-100">{c.nome}</div>
                <div className="truncate text-sm text-slate-400">{c.telefono ?? c.email ?? "—"}</div>
              </div>
              {c.ultima_visita && (
                <div className="shrink-0 text-right text-xs text-slate-500">
                  <div>ultima visita</div>
                  <div className="text-slate-400">{dataBreve(c.ultima_visita)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
