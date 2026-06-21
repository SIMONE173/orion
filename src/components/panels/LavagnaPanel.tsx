"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "lavagna" }>["dati"];

function Math({ latex, display }: { latex: string; display?: boolean }) {
  let html = "";
  try {
    html = katex.renderToString(latex, { throwOnError: false, displayMode: display, output: "html" });
  } catch {
    html = latex;
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function LavagnaPanel({ dati }: { dati: Dati }) {
  const passi = dati.passi ?? [];
  return (
    <div className="flex h-full flex-col text-slate-100">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-cyan-500/15 text-cyan-300">∑</span>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-cyan-300/70">Lavagna</div>
          <div className="truncate text-lg font-semibold">{dati.titolo}</div>
        </div>
      </div>

      {/* Lavagna vera e propria */}
      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-white/10 bg-[#0b1220]/80 p-5 shadow-inner">
        <ol className="space-y-4">
          {passi.map((p, i) => (
            <li
              key={i}
              className="lavagna-passo flex gap-3"
              style={{ animationDelay: `${i * 0.28 + 0.1}s` }}
            >
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-cyan-400/30 text-xs text-cyan-200/80">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {p.latex && (
                  <div className="overflow-x-auto py-1 text-[17px] leading-relaxed text-slate-50">
                    <Math latex={p.latex} display />
                  </div>
                )}
                {p.spiegazione && (
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-400">{p.spiegazione}</p>
                )}
              </div>
            </li>
          ))}
        </ol>

        {dati.risultato && (
          <div
            className="lavagna-passo mt-6 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-4 text-center"
            style={{ animationDelay: `${passi.length * 0.28 + 0.2}s` }}
          >
            <div className="mb-1 text-xs uppercase tracking-widest text-cyan-300/70">Risultato</div>
            <div className="text-xl text-cyan-50">
              <Math latex={dati.risultato} display />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LavagnaPanel;
