"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "email" }>["dati"];

export function EmailPanel({ dati }: { dati: Dati }) {
  const { messaggi, bozza, account } = dati;
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-cyan-100">Email</h2>
        {account && <span className="truncate text-xs text-slate-500">{account}</span>}
      </div>

      {bozza && (
        <div className="mb-4 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-cyan-300/70">Bozza da inviare</div>
          <div className="text-sm text-slate-300">
            <span className="text-slate-500">A: </span>
            {bozza.a}
          </div>
          <div className="mt-0.5 text-sm font-medium text-slate-100">{bozza.oggetto}</div>
          <div className="mt-2 whitespace-pre-line text-sm text-slate-300">{bozza.corpo}</div>
          <div className="mt-3 text-xs text-slate-500">Dì &quot;invia&quot; per confermare.</div>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-auto pr-1">
        {messaggi.length === 0 && !bozza ? (
          <p className="text-sm text-slate-400">Nessuna email da mostrare.</p>
        ) : (
          messaggi.map((m) => (
            <div key={m.uid} className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`truncate text-sm ${m.letto ? "text-slate-300" : "font-semibold text-slate-100"}`}>
                  {m.da}
                </span>
                {m.data && <span className="shrink-0 text-xs text-slate-500">{m.data.slice(0, 10)}</span>}
              </div>
              <div className={`mt-0.5 truncate text-sm ${m.letto ? "text-slate-400" : "text-cyan-100"}`}>
                {!m.letto && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-cyan-400 align-middle" />}
                {m.oggetto}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
