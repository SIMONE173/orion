"use client";

import type { Vista } from "@/lib/orion/views";
import { dataBreve } from "./format";

type Dati = Extract<Vista, { tipo: "documenti" }>["dati"];

export function DocumentiPanel({ dati }: { dati: Dati }) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">Documenti</h2>
      {dati.documenti.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center text-slate-400">
          Nessun documento. Di&apos; &quot;digitalizza questo documento&quot; e inquadra il foglio.
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-auto pr-1">
          {dati.documenti.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cyan-400/15 text-cyan-200">
                ▤
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-100">{d.titolo}</div>
                <div className="truncate text-xs text-slate-500">
                  {d.tipo}
                  {d.cliente_nome ? ` · ${d.cliente_nome}` : ""}
                </div>
              </div>
              <span className="shrink-0 text-xs text-slate-500">{dataBreve(d.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
