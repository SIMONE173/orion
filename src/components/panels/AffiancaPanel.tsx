"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "affianca" }>["dati"];

// Scheda del riassunto dell'affiancamento: ORION guarda lo schermo e riporta qui
// ciò che conta + l'elenco di ciò che ha cerchiato. Stessa veste dei pannelli ORION.
export function AffiancaPanel({ dati }: { dati: Dati }) {
  const guardo = dati.stato === "guardo";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center gap-3">
        <span className="relative grid size-6 place-items-center">
          <span className="absolute inline-flex size-6 rounded-full bg-cyan-400/20" />
          <span className={`size-2.5 rounded-full bg-cyan-400 ${guardo ? "animate-pulse" : ""}`} />
        </span>
        <div>
          <h2 className="text-lg font-semibold leading-none tracking-tight text-cyan-100">Affiancamento</h2>
          <p className="mt-1 text-xs text-slate-400">{guardo ? "Guardo lo schermo…" : "Ecco cosa conta"}</p>
        </div>
      </div>

      {dati.errore ? (
        <p className="text-sm leading-relaxed text-amber-200">{dati.errore}</p>
      ) : guardo && !dati.riassunto ? (
        <p className="text-sm text-slate-400">Sto guardando lo schermo che hai davanti…</p>
      ) : (
        <div className="flex-1 overflow-auto pr-1">
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-100">{dati.riassunto}</p>

          {dati.evidenze.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                Cosa ti ho cerchiato
              </div>
              <ul className="space-y-2">
                {dati.evidenze.map((e, i) => {
                  const allerta = e.forma === "attenzione";
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-200"
                    >
                      <span
                        className={`size-2.5 shrink-0 rounded-full ${allerta ? "bg-amber-400" : "bg-cyan-400"}`}
                        style={{ boxShadow: `0 0 8px ${allerta ? "#fbbf24" : "#22d3ee"}` }}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {e.etichetta || (allerta ? "Da controllare" : "Da vedere")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
