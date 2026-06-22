"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "sport" }>["dati"];

function dataBreve(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

export function SportPanel({ dati }: { dati: Dati }) {
  const classifica = dati.classifica.length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 min-w-0">
        <div className="text-xs uppercase tracking-widest text-cyan-300/70">Sport</div>
        <div className="truncate text-lg font-semibold text-slate-100">{dati.titolo}</div>
        {dati.sottotitolo && <div className="truncate text-xs text-slate-400">{dati.sottotitolo}</div>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {classifica ? (
          <div className="space-y-1">
            {dati.classifica.map((r, i) => (
              <div
                key={i}
                className="appare flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <span className="w-5 text-right text-sm font-semibold text-cyan-300/80">{r.pos}</span>
                {r.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.logo} alt="" className="h-5 w-5 object-contain" />
                ) : (
                  <span className="h-5 w-5" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{r.squadra}</span>
                <span className="text-sm font-semibold text-slate-200">{r.punti}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {dati.partite.map((p, i) => (
              <div
                key={i}
                className="appare rounded-xl border border-white/10 bg-white/[0.03] p-3"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">{p.stato}</span>
                  <span className="text-xs text-slate-500">{dataBreve(p.data)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 text-sm text-slate-100">{p.titolo}</span>
                  {p.punteggio && (
                    <span className="shrink-0 rounded-md bg-cyan-400/10 px-2 py-0.5 text-sm font-semibold text-cyan-200">
                      {p.punteggio}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SportPanel;
