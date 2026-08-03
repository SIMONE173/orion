"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "referto" }>["dati"];

// IL REFERTO — il foglio che dice quanti soldi stanno per terra.
// Poche cose, grandi. Chi lo guarda deve capire la cifra in due secondi e
// riconoscerla come SUA. Niente grafici, niente cruscotti: i numeri e basta.

const ICONE: Record<string, string> = {
  da_incassare: "💶",
  dormienti: "🚶",
  agenda_vuota: "🕳",
};

export function RefertoPanel({ dati }: { dati: Dati }) {
  const { voci, totaleEuro, avvertenza, studio } = dati;
  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div>
        <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-cyan-300/90">
          {studio ? `${studio} — il conto` : "Il conto"}
        </div>
        <h2 className="mt-1 text-2xl font-semibold text-slate-50">Cosa ti sta scappando</h2>
      </div>

      {voci.length > 0 ? (
        <div className="grid gap-3">
          {voci.map((v) => (
            <div key={v.chiave} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-baseline gap-3">
                <span className="text-xl leading-none">{ICONE[v.chiave] ?? "•"}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{v.titolo}</div>
                  <div className="mt-0.5 text-3xl font-semibold tabular-nums text-slate-50">{v.valore}</div>
                  <p className="mt-1 text-[13px] leading-snug text-slate-400">{v.dettaglio}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-100/90">
          Niente da recuperare: incassi in ordine, nessuno sparito, agenda senza buchi fissi. È una buona notizia.
        </div>
      )}

      {totaleEuro > 0 && (
        <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.07] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-200/80">
            Soldi che oggi ti passano davanti
          </div>
          <div className="mt-0.5 text-4xl font-semibold tabular-nums text-cyan-50">
            ~{Math.round(totaleEuro).toLocaleString("it-IT")} €
          </div>
          {/* Detto come stima, mai come promessa: è la riga che tiene in piedi
              la credibilità di tutto il foglio. */}
          <p className="mt-1 text-[12px] text-cyan-100/60">Stima prudente sui tuoi numeri, non una promessa.</p>
        </div>
      )}

      {avvertenza && (
        <p className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[13px] leading-relaxed text-slate-400">
          {avvertenza}
        </p>
      )}
    </div>
  );
}
