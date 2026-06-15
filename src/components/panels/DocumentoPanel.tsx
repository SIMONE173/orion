"use client";

import type { Vista } from "@/lib/orion/views";
import { dataBreve } from "./format";
import { scaricaDocumentoPdf } from "./pdf";

type Dati = Extract<Vista, { tipo: "documento" }>["dati"];

export function DocumentoPanel({ dati }: { dati: Dati }) {
  const d = dati.documento;
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-cyan-100">{d.titolo}</h2>
          <div className="mt-1 text-sm text-slate-400">
            {d.tipo}
            {d.cliente_nome ? ` · ${d.cliente_nome}` : ""} · {dataBreve(d.created_at)}
          </div>
        </div>
        <button
          onClick={() => scaricaDocumentoPdf(d)}
          className="shrink-0 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm text-cyan-200 hover:bg-cyan-400/20"
        >
          ⬇ Scarica PDF
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto pr-1 md:grid-cols-2">
        {d.immagine && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={d.immagine}
            alt={d.titolo}
            className="max-h-full w-full rounded-xl border border-white/10 object-contain"
          />
        )}
        <div className={`rounded-xl border border-white/8 bg-white/[0.02] p-4 ${d.immagine ? "" : "md:col-span-2"}`}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            Contenuto ricostruito
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
            {d.testo || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
