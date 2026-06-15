"use client";

import type { Vista } from "@/lib/orion/views";
import { dataBreve } from "./format";

type Dati = Extract<Vista, { tipo: "promemoria" }>["dati"];

const catColore: Record<string, string> = {
  richiamo: "bg-cyan-400/15 text-cyan-200 border-cyan-400/30",
  commercialista: "bg-indigo-400/15 text-indigo-200 border-indigo-400/30",
  scadenza: "bg-rose-400/15 text-rose-200 border-rose-400/30",
  pagamento: "bg-amber-400/15 text-amber-200 border-amber-400/30",
  documento: "bg-emerald-400/15 text-emerald-200 border-emerald-400/30",
  attivita: "bg-white/8 text-slate-300 border-white/15",
};

export function PromemoriaPanel({ dati }: { dati: Dati }) {
  const oggi = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">Promemoria</h2>
      {dati.promemoria.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">
          Nessun promemoria attivo.
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-auto pr-1">
          {dati.promemoria.map((p) => {
            const scaduto = p.scadenza && p.scadenza <= oggi;
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3.5"
              >
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${
                    catColore[p.categoria] ?? catColore.attivita
                  }`}
                >
                  {p.categoria}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-slate-100">{p.testo}</div>
                  {p.cliente_nome && <div className="truncate text-xs text-slate-500">{p.cliente_nome}</div>}
                </div>
                {p.scadenza && (
                  <span className={`shrink-0 text-xs ${scaduto ? "text-rose-300" : "text-slate-400"}`}>
                    {dataBreve(p.scadenza)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
