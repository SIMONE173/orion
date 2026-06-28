"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "organico" }>["dati"];

export function OrganicoPanel({ dati }: { dati: Dati }) {
  const membri = dati.organico;
  if (!membri.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <h2 className="mb-2 text-lg font-semibold tracking-tight text-cyan-100">Organigramma</h2>
        <p className="max-w-sm text-sm text-slate-400">
          Non conosco ancora le persone del team. Raccontami chi lavora qui e cosa fa: costruirò
          l&apos;organigramma dell&apos;azienda.
        </p>
      </div>
    );
  }
  // Raggruppa per reparto.
  const reparti = new Map<string, typeof membri>();
  for (const m of membri) {
    const k = m.reparto || "Senza reparto";
    if (!reparti.has(k)) reparti.set(k, []);
    reparti.get(k)!.push(m);
  }
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-1 text-lg font-semibold tracking-tight text-cyan-100">Organigramma</h2>
      <p className="mb-4 text-sm text-slate-400">{membri.length} persone</p>
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto pr-1 md:grid-cols-2">
        {[...reparti.entries()].map(([reparto, persone]) => (
          <div key={reparto} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">{reparto}</div>
            <div className="space-y-3">
              {persone.map((m) => (
                <div key={m.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100">{m.nome}</span>
                    {m.ruolo && <span className="shrink-0 text-xs text-cyan-300/70">{m.ruolo}</span>}
                  </div>
                  {m.responsabilita && <div className="mt-0.5 text-xs text-slate-400">{m.responsabilita}</div>}
                  {m.riporta_a && <div className="mt-0.5 text-xs text-slate-500">riporta a {m.riporta_a}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
