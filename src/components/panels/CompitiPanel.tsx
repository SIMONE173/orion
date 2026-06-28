"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "compiti" }>["dati"];

const STATO_LABEL: Record<string, string> = {
  aperto: "Aperto",
  in_corso: "In corso",
  completato: "Completato",
  annullato: "Annullato",
};

export function CompitiPanel({ dati, titolo }: { dati: Dati; titolo?: string }) {
  const compiti = dati.compiti;
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">{titolo || "Compiti"}</h2>
      {compiti.length === 0 ? (
        <p className="text-sm text-slate-400">Nessun compito da mostrare.</p>
      ) : (
        <div className="flex-1 space-y-2.5 overflow-auto pr-1">
          {compiti.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border px-4 py-3 ${
                c.in_ritardo ? "border-amber-400/25 bg-amber-400/[0.06]" : "border-white/8 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-slate-100">{c.titolo}</span>
                <span className={`shrink-0 text-xs ${c.in_ritardo ? "text-amber-300" : "text-slate-500"}`}>
                  {c.in_ritardo ? "In ritardo" : STATO_LABEL[c.stato] ?? c.stato}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                {c.assegnatario && <span>→ {c.assegnatario}</span>}
                {c.reparto && <span>{c.reparto}</span>}
                {c.scadenza && <span>scad. {c.scadenza.slice(0, 10)}</span>}
                {c.frequenza_giorni ? <span>aggiorn. ogni {c.frequenza_giorni}g</span> : null}
              </div>
              {c.descrizione && <div className="mt-1.5 whitespace-pre-line text-xs text-slate-500">{c.descrizione}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
