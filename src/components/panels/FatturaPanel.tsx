"use client";

import type { Vista } from "@/lib/orion/views";
import { euro, dataBreve } from "./format";
import { scaricaFatturaPdf } from "./pdf";

type Dati = Extract<Vista, { tipo: "fattura" }>["dati"];

export function FatturaPanel({ dati }: { dati: Dati }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-cyan-100">
          Fattura n. {dati.numero}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scaricaFatturaPdf(dati)}
            className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm text-cyan-200 hover:bg-cyan-400/20"
          >
            ⬇ PDF
          </button>
          <span
            className={`rounded-full border px-3 py-1 text-xs ${
              dati.emessa
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-amber-400/30 bg-amber-400/10 text-amber-300"
            }`}
          >
            {dati.emessa ? "Emessa" : "Anteprima"}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto pr-1">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="grid grid-cols-2 gap-5 border-b border-white/8 pb-4">
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Emittente</div>
              <div className="font-medium text-slate-100">{dati.emittente.nome ?? "—"}</div>
              <div className="text-sm text-slate-400">{dati.emittente.indirizzo ?? ""}</div>
              <div className="mt-1 text-sm text-slate-400">
                P.IVA {dati.emittente.piva ?? "—"}
                {dati.emittente.regime_fiscale ? ` · ${dati.emittente.regime_fiscale}` : ""}
              </div>
              {(dati.emittente.pec || dati.emittente.sdi) && (
                <div className="text-sm text-slate-400">
                  {dati.emittente.pec ? `PEC ${dati.emittente.pec}` : ""}
                  {dati.emittente.sdi ? ` · SDI ${dati.emittente.sdi}` : ""}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Cliente</div>
              <div className="font-medium text-slate-100">{dati.cliente.nome}</div>
              <div className="text-sm text-slate-400">{dati.cliente.indirizzo ?? ""}</div>
              <div className="mt-1 text-sm text-slate-400">
                {dati.cliente.piva
                  ? `P.IVA ${dati.cliente.piva}`
                  : dati.cliente.codice_fiscale
                    ? `CF ${dati.cliente.codice_fiscale}`
                    : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between py-5">
            <div className="text-slate-200">{dati.descrizione ?? "Prestazione professionale"}</div>
            <div className="text-2xl font-semibold text-cyan-100">{euro(dati.importo)}</div>
          </div>

          <div className="border-t border-white/8 pt-3 text-sm text-slate-500">
            Data: {dataBreve(dati.data)}
          </div>
        </div>

        {dati.campiMancanti.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-100">
            Dati mancanti: {dati.campiMancanti.join(", ")}.
          </div>
        )}
      </div>
    </div>
  );
}
