"use client";

import { IconClose, IconDoc } from "@/components/icons";

// Modalità appunti: lavagna a schermo dove l'utente detta e ORION scrive.
// La dettatura (voce → testo) è gestita in page.tsx; qui mostriamo e salviamo.
export function AppuntiPanel({
  titolo,
  testo,
  interim,
  ascolto,
  stato,
  onChange,
  onPdf,
  onSalva,
  onSistema,
  onChiudi,
}: {
  titolo: string;
  testo: string;
  interim: string;
  ascolto: boolean;
  stato: "idle" | "salvando" | "salvato";
  onChange: (t: string) => void;
  onPdf: () => void;
  onSalva: () => void;
  onSistema: () => void;
  onChiudi: () => void;
}) {
  return (
    <div className="backdrop-in fixed inset-0 z-40 flex flex-col bg-black/60 backdrop-blur-sm">
      <div className="reveal glass mx-auto mt-10 flex h-[calc(100%-5rem)] w-full max-w-3xl flex-col rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-cyan-500/20 text-cyan-300">
              <IconDoc className="h-5 w-5" />
            </span>
            <div>
              <div className="font-semibold text-slate-100">{titolo || "Appunti"}</div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {ascolto ? (
                  <>
                    <span className="size-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_8px] shadow-cyan-300" />
                    Ti ascolto… detta pure
                  </>
                ) : (
                  "Microfono in pausa"
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onChiudi}
            className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            title="Chiudi appunti"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <textarea
          value={testo}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Inizia a dettare, oppure scrivi qui…"
          className="min-h-0 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 p-4 text-[15px] leading-relaxed text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
        />
        {interim && <p className="mt-2 px-1 text-sm italic text-slate-500">{interim}…</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={onSistema}
            disabled={!testo.trim() || stato === "salvando"}
            className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-5 py-2.5 font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-40"
            title="ORION mette la punteggiatura, va a capo e trasforma gli elenchi in liste"
          >
            ✨ Sistema
          </button>
          <button
            onClick={onPdf}
            disabled={!testo.trim()}
            className="rounded-xl bg-cyan-500/90 px-5 py-2.5 font-medium text-slate-900 transition hover:bg-cyan-400 disabled:opacity-40"
          >
            Salva come PDF
          </button>
          <button
            onClick={onSalva}
            disabled={!testo.trim() || stato === "salvando"}
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
          >
            {stato === "salvando" ? "Salvo…" : stato === "salvato" ? "Salvato ✓" : "Salva su ORION"}
          </button>
          <span className="ml-auto text-xs text-slate-500">
            Puoi dire: &quot;sistema&quot;, &quot;salva come PDF&quot;, &quot;salva su ORION&quot;, &quot;chiudi appunti&quot;
          </span>
        </div>
      </div>
    </div>
  );
}
