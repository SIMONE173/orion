"use client";

import { useState } from "react";
import type { Vista } from "@/lib/orion/views";
import { scaricaTestoPdf } from "./pdf";

type Dati = Extract<Vista, { tipo: "schema" }>["dati"];

// Schema → testo (per PDF, salvataggio e condivisione).
function aTesto(d: Dati): string {
  const righe = [d.titolo, ""];
  for (const r of d.rami) {
    righe.push(`• ${r.titolo}`);
    for (const p of r.punti ?? []) righe.push(`   - ${p}`);
    righe.push("");
  }
  return righe.join("\n").trim();
}

export function SchemaPanel({ dati }: { dati: Dati }) {
  const [stato, setStato] = useState<"idle" | "salvando" | "salvato">("idle");

  const salvaOrion = async () => {
    setStato("salvando");
    try {
      const r = await fetch("/api/appunti", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titolo: dati.titolo, testo: aTesto(dati), tipo: "schema" }),
      });
      const d = await r.json();
      setStato(d?.ok ? "salvato" : "idle");
    } catch {
      setStato("idle");
    }
  };

  const condividi = async () => {
    const testo = aTesto(dati);
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    try {
      if (nav.share) await nav.share({ title: dati.titolo, text: testo });
      else {
        await navigator.clipboard.writeText(testo);
        setStato("salvato");
        setTimeout(() => setStato("idle"), 1500);
      }
    } catch {
      /* annullato */
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Argomento centrale */}
      <div className="mb-4 text-center">
        <div className="text-xs uppercase tracking-widest text-cyan-300/70">Schema</div>
        <h2 className="mt-1 inline-block rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-lg font-semibold text-slate-50">
          {dati.titolo}
        </h2>
      </div>

      {/* Rami */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid gap-3 sm:grid-cols-2">
          {dati.rami.map((r, i) => (
            <div
              key={i}
              className="appare rounded-2xl border border-white/10 bg-white/5 p-4"
              style={{ animationDelay: `${i * 0.12 + 0.08}s` }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-cyan-400 shadow-[0_0_8px] shadow-cyan-400/70" />
                <h3 className="font-semibold text-slate-100">{r.titolo}</h3>
              </div>
              {r.punti && r.punti.length > 0 && (
                <ul className="space-y-1.5 pl-1">
                  {r.punti.map((p, j) => (
                    <li key={j} className="flex gap-2 text-sm leading-relaxed text-slate-300">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-500" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Azioni */}
      <div className="mt-4 flex flex-wrap gap-2.5">
        <button
          onClick={() => scaricaTestoPdf(dati.titolo, aTesto(dati))}
          className="rounded-xl bg-cyan-500/90 px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:bg-cyan-400"
        >
          Salva come PDF
        </button>
        <button
          onClick={salvaOrion}
          disabled={stato === "salvando"}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          {stato === "salvando" ? "Salvo…" : stato === "salvato" ? "Fatto ✓" : "Salva su ORION"}
        </button>
        <button
          onClick={condividi}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
        >
          Condividi
        </button>
      </div>
    </div>
  );
}
