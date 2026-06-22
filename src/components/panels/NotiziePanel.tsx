"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "notizie" }>["dati"];

function quando(iso: string | null) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "ora";
  if (min < 60) return `${min} min fa`;
  const ore = Math.round(min / 60);
  if (ore < 24) return `${ore} h fa`;
  const giorni = Math.round(ore / 24);
  if (giorni === 1) return "ieri";
  if (giorni < 7) return `${giorni} giorni fa`;
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

export function NotiziePanel({ dati }: { dati: Dati }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 min-w-0">
        <div className="text-xs uppercase tracking-widest text-cyan-300/70">Notizie</div>
        <div className="truncate text-lg font-semibold text-slate-100">
          {dati.argomento ? dati.argomento : "Ultime notizie"}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {dati.articoli.map((a, i) => (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="appare block rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="text-sm font-medium leading-snug text-slate-100">{a.titolo}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
              <span className="text-cyan-300/80">{a.fonte}</span>
              {quando(a.data) && (
                <>
                  <span className="text-slate-600">·</span>
                  <span>{quando(a.data)}</span>
                </>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default NotiziePanel;
