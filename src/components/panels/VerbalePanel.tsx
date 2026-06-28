"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "verbale" }>["dati"];

export function VerbalePanel({ dati }: { dati: Dati }) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-1 text-lg font-semibold tracking-tight text-cyan-100">Verbale riunione</h2>
      <p className="mb-4 text-sm text-slate-400">{dati.titolo}</p>
      <div className="flex-1 space-y-4 overflow-auto pr-1">
        {dati.decisioni.length > 0 && (
          <Sezione titolo="Decisioni">
            {dati.decisioni.map((d, i) => (
              <div key={i} className="text-sm text-slate-200">
                • {d.contenuto}
                {d.motivo && <span className="text-slate-500"> — {d.motivo}</span>}
              </div>
            ))}
          </Sezione>
        )}
        {dati.compiti.length > 0 && (
          <Sezione titolo="Attività assegnate">
            {dati.compiti.map((c, i) => (
              <div key={i} className="text-sm text-slate-200">
                • {c.titolo}
                {c.assegnatario && <span className="text-cyan-300/70"> → {c.assegnatario}</span>}
                {c.scadenza && <span className="text-slate-500"> (entro {c.scadenza.slice(0, 10)})</span>}
              </div>
            ))}
          </Sezione>
        )}
        {dati.scadenze.length > 0 && (
          <Sezione titolo="Scadenze">
            {dati.scadenze.map((s, i) => (
              <div key={i} className="text-sm text-slate-200">
                • {s.cosa}
                {s.quando && <span className="text-slate-500"> — {s.quando}</span>}
              </div>
            ))}
          </Sezione>
        )}
        {dati.note && (
          <Sezione titolo="Note">
            <div className="whitespace-pre-line text-sm text-slate-300">{dati.note}</div>
          </Sezione>
        )}
      </div>
    </div>
  );
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">{titolo}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
