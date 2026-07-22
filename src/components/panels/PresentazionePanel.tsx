"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "presentazione" }>["dati"];

// ── LA PRESENTAZIONE DELLA DEMO ──────────────────────────────────────────────
// Le slide di fine tappa: pochi punti, grandi, che entrano uno alla volta come
// in un keynote. Tutto CSS (nessuna libreria): titolo che scende, riga di luce
// che si allunga, punti in cascata con la loro icona che "atterra".
// Con finale=true la veste diventa quella del gran finale (oro, più solenne).

export function PresentazionePanel({ dati }: { dati: Dati }) {
  const oro = dati.finale === true;
  const accento = oro ? "#f5c96b" : "#67e8f9";

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <style>{`
        @keyframes pres-titolo { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: none; } }
        @keyframes pres-riga { from { width: 0; opacity: 0; } to { width: 72px; opacity: 1; } }
        @keyframes pres-punto { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
        @keyframes pres-icona { 0% { opacity: 0; transform: scale(0.4) rotate(-12deg); } 60% { transform: scale(1.15) rotate(3deg); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
        @keyframes pres-alone { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
      `}</style>

      {/* L'alone scenografico dietro le slide */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[420px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${accento}22, transparent)`, animation: "pres-alone 5s ease-in-out infinite" }}
      />

      <div className="relative mx-auto flex h-full w-full max-w-2xl flex-col justify-center px-2 py-4">
        <div style={{ animation: "pres-titolo 0.7s cubic-bezier(0.2,0.8,0.2,1) both" }}>
          {oro && (
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: accento }}>
              Gran finale
            </div>
          )}
          <h2 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">{dati.titolo}</h2>
          {dati.sottotitolo && <p className="mt-1 text-sm text-slate-400">{dati.sottotitolo}</p>}
          <div
            className="mt-3 h-[2px] rounded-full"
            style={{ background: accento, boxShadow: `0 0 12px ${accento}`, animation: "pres-riga 0.9s 0.35s cubic-bezier(0.2,0.8,0.2,1) both" }}
          />
        </div>

        <div className="mt-7 space-y-4">
          {dati.punti.map((p, i) => (
            <div
              key={i}
              className="flex items-start gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5"
              style={{ animation: `pres-punto 0.65s ${0.55 + i * 0.5}s cubic-bezier(0.2,0.8,0.2,1) both` }}
            >
              <div
                className="grid size-11 shrink-0 place-items-center rounded-xl text-xl"
                style={{
                  background: `${accento}14`,
                  border: `1px solid ${accento}33`,
                  animation: `pres-icona 0.6s ${0.7 + i * 0.5}s cubic-bezier(0.2,0.8,0.2,1) both`,
                }}
              >
                {p.icona}
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-slate-100">{p.titolo}</div>
                <div className="mt-0.5 text-sm leading-snug text-slate-400">{p.testo}</div>
              </div>
            </div>
          ))}
        </div>

        {oro && (
          <div
            className="mt-8 text-center text-sm text-slate-400"
            style={{ animation: `pres-punto 0.8s ${0.9 + dati.punti.length * 0.5}s both` }}
          >
            Questo era un assaggio. La versione completa ti aspetta su{" "}
            <span className="font-medium" style={{ color: accento }}>
              orionvision.it
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
