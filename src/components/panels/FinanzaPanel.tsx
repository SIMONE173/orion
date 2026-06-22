"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "finanza" }>["dati"];

function formatta(n: number, valuta: string) {
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: valuta,
      maximumFractionDigits: n < 10 ? 4 : 2,
    }).format(n);
  } catch {
    return `${n.toLocaleString("it-IT")} ${valuta}`;
  }
}

export function FinanzaPanel({ dati }: { dati: Dati }) {
  const su = (dati.variazione ?? 0) >= 0;
  const colore = su ? "#34d399" : "#fb7185"; // verde / rosso
  const W = 600;
  const H = 220;

  const serie = dati.serie.length > 1 ? dati.serie : [dati.prezzo, dati.prezzo];
  const min = Math.min(...serie);
  const max = Math.max(...serie);
  const span = max - min || 1;
  const px = (i: number) => (i / (serie.length - 1)) * W;
  const py = (v: number) => H - 8 - ((v - min) / span) * (H - 16);
  const linea = serie.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const area = `${linea} L${W},${H} L0,${H} Z`;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-cyan-300/70">
            {dati.categoria === "crypto" ? "Crypto" : "Mercati"}
          </div>
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-semibold text-slate-100">{dati.nome}</span>
            <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs text-slate-300">
              {dati.simbolo}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold text-slate-50">{formatta(dati.prezzo, dati.valuta)}</div>
          {dati.variazione != null && (
            <div className="text-sm font-medium" style={{ color: colore }}>
              {su ? "▲" : "▼"} {Math.abs(dati.variazione).toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-2">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
          <defs>
            <linearGradient id="finArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colore} stopOpacity="0.28" />
              <stop offset="100%" stopColor={colore} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#finArea)" />
          <path d={linea} fill="none" stroke={colore} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>Ultimi {dati.periodo}</span>
        <span>Dati informativi · non è un consiglio finanziario</span>
      </div>
    </div>
  );
}

export default FinanzaPanel;
