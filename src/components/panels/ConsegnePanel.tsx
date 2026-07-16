"use client";

import { useState } from "react";
import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "consegne" }>["dati"];
type Consegna = Dati["consegne"][number];

// ── CONSEGNE AL GESTIONALE (il Ponte universale, senza API) ──────────────────
// La coda delle modifiche da portare nel software del professionista: ogni
// voce si copia perfetta con un click (pronta da incollare) e si spunta.

const BADGE: Record<string, { testo: string; cls: string }> = {
  appuntamento_creato: { testo: "Nuovo appuntamento", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" },
  appuntamento_spostato: { testo: "Appuntamento spostato", cls: "border-amber-400/30 bg-amber-400/10 text-amber-200" },
  appuntamento_stato: { testo: "Stato aggiornato", cls: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" },
  appuntamento_cancellato: { testo: "Appuntamento cancellato", cls: "border-rose-400/30 bg-rose-400/10 text-rose-200" },
  cliente_creato: { testo: "Nuovo cliente", cls: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" },
  cliente_aggiornato: { testo: "Cliente aggiornato", cls: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" },
};

// Etichette italiane per i campi del payload (l'ordine conta).
const CAMPI: [string, string][] = [
  ["titolo", "Titolo"],
  ["cliente", "Cliente"],
  ["cliente_nome", "Cliente"],
  ["nome", "Nome"],
  ["telefono", "Telefono"],
  ["email", "Email"],
  ["inizio", "Inizio"],
  ["fine", "Fine"],
  ["stato", "Stato"],
  ["note", "Note"],
];

function dataLeggibile(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Le righe (etichetta, valore) di una consegna, pronte per pannello e appunti.
function righeDi(c: Consegna): [string, string][] {
  const righe: [string, string][] = [];
  const usate = new Set<string>();
  for (const [chiave, etichetta] of CAMPI) {
    const v = c.payload[chiave];
    if (v === undefined || v === null || v === "" || usate.has(etichetta)) continue;
    usate.add(etichetta);
    const testo = typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? dataLeggibile(v) : String(v);
    righe.push([etichetta, testo]);
  }
  for (const [k, v] of Object.entries(c.payload)) {
    if (CAMPI.some(([c2]) => c2 === k) || v === undefined || v === null || v === "" || typeof v === "object") continue;
    righe.push([k, String(v)]);
  }
  return righe;
}

export function ConsegnePanel({ dati }: { dati: Dati }) {
  const [consegne, setConsegne] = useState(dati.consegne);
  const [copiata, setCopiata] = useState<number | null>(null);

  const copia = async (c: Consegna) => {
    const testo = righeDi(c)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(testo);
      setCopiata(c.id);
      setTimeout(() => setCopiata((x) => (x === c.id ? null : x)), 1600);
    } catch {
      /* appunti non disponibili: pazienza */
    }
  };

  const fatto = async (c: Consegna) => {
    try {
      const r = await fetch("/api/consegne", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: c.id }),
      });
      const d = await r.json();
      if (d?.ok) setConsegne((prev) => prev.filter((x) => x.id !== c.id));
    } catch {
      /* riprova al prossimo click */
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-100">Consegne al gestionale</h2>
        <p className="text-xs text-slate-400">
          Il Ponte universale: copia una voce e incollala nel tuo software, poi spunta ✓. Su Desktop puoi anche dire a ORION di scriverla lui.
        </p>
      </div>

      {consegne.length === 0 ? (
        <div className="grid flex-1 place-items-center rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <div>
            <div className="text-3xl">✅</div>
            <p className="mt-2 text-sm text-slate-300">Tutto consegnato: il gestionale è allineato.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {consegne.map((c) => {
            const badge = BADGE[c.evento] ?? { testo: c.evento, cls: "border-white/15 bg-white/5 text-slate-300" };
            return (
              <div key={c.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.testo}</span>
                  <span className="text-[11px] text-slate-500">
                    per {c.sistema} · {dataLeggibile(c.created_at)}
                  </span>
                </div>
                <div className="mt-3 space-y-1">
                  {righeDi(c).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-sm">
                      <span className="w-24 shrink-0 text-slate-400">{k}</span>
                      <span className="font-medium text-slate-100">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => copia(c)}
                    className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3.5 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-400/20"
                  >
                    {copiata === c.id ? "Copiata ✓" : "📋 Copia"}
                  </button>
                  <button
                    onClick={() => fatto(c)}
                    className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/20"
                  >
                    ✓ Fatta
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
