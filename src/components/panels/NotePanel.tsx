"use client";

import type { Vista } from "@/lib/orion/views";
import { dataBreve } from "./format";

type Dati = Extract<Vista, { tipo: "note" }>["dati"];

export function NotePanel({ dati }: { dati: Dati }) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">Note</h2>
      {dati.note.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">
          Nessuna nota ancora.
        </div>
      ) : (
        <div className="flex-1 space-y-2.5 overflow-auto pr-1">
          {dati.note.map((n) => (
            <div
              key={n.id}
              className="rounded-xl border border-white/8 bg-white/[0.03] p-4"
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="font-medium text-slate-100">{n.titolo ?? "Nota"}</div>
                <div className="shrink-0 text-xs text-slate-500">{dataBreve(n.created_at)}</div>
              </div>
              <div className="whitespace-pre-wrap text-sm text-slate-300">{n.contenuto}</div>
              {n.cliente_nome && (
                <div className="mt-2 text-xs text-cyan-300/70">↪ {n.cliente_nome}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
