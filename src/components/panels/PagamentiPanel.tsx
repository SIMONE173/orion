"use client";

import type { Vista } from "@/lib/orion/views";
import { euro, dataBreve, etichettaMetodo } from "./format";

type Dati = Extract<Vista, { tipo: "pagamenti" }>["dati"];

export function PagamentiPanel({ titolo, dati }: { titolo: string; dati: Dati }) {
  const maxMetodo = Math.max(1, ...Object.values(dati.perMetodo));
  const maxCliente = Math.max(1, ...dati.topClienti.map((c) => c.totale));

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">{titolo}</h2>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat etichetta="Incassato" valore={euro(dati.totaleIncassato)} tono="emerald" />
        <Stat etichetta="Da incassare" valore={euro(dati.totaleDaIncassare)} tono="amber" />
        <Stat etichetta="Pagamenti" valore={String(dati.numeroPagamenti)} tono="cyan" />
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto pr-1 md:grid-cols-2">
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
            Per metodo
          </div>
          {Object.keys(dati.perMetodo).length === 0 ? (
            <div className="text-sm text-slate-500">Nessun incasso.</div>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(dati.perMetodo).map(([m, v]) => (
                <div key={m}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-300">{etichettaMetodo(m)}</span>
                    <span className="text-slate-400">{euro(v)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300"
                      style={{ width: `${(v / maxMetodo) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {dati.giornoPiuRedditizio && (
            <div className="mt-4 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.06] px-3 py-2 text-sm">
              <span className="text-slate-400">Giorno più redditizio: </span>
              <span className="text-cyan-200">
                {dataBreve(dati.giornoPiuRedditizio.data)} · {euro(dati.giornoPiuRedditizio.totale)}
              </span>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
            Clienti top
          </div>
          {dati.topClienti.length === 0 ? (
            <div className="text-sm text-slate-500">—</div>
          ) : (
            <div className="space-y-2.5">
              {dati.topClienti.map((c) => (
                <div key={c.nome}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="truncate text-slate-300">{c.nome}</span>
                    <span className="shrink-0 text-slate-400">{euro(c.totale)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-300"
                      style={{ width: `${(c.totale / maxCliente) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {dati.daIncassare.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-amber-300/70">
                Da incassare
              </div>
              <div className="space-y-1.5">
                {dati.daIncassare.map((d, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="truncate text-slate-300">{d.cliente ?? "—"}</span>
                    <span className="shrink-0 text-amber-300">{euro(d.importo)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  etichetta,
  valore,
  tono,
}: {
  etichetta: string;
  valore: string;
  tono: "emerald" | "amber" | "cyan";
}) {
  const toni = {
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
  }[tono];
  return (
    <div className={`rounded-xl border px-4 py-3 ${toni}`}>
      <div className="text-xs opacity-70">{etichetta}</div>
      <div className="mt-0.5 text-xl font-semibold">{valore}</div>
    </div>
  );
}
