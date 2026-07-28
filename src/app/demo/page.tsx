"use client";

import { useEffect, useState } from "react";

// ── L'INGRESSO DELLA DEMO ────────────────────────────────────────────────────
// Due anime, una regola: la Demo si VIVE solo nell'app desktop "ORION Demo"
// (perché il suo pezzo forte è ORION che usa DAVVERO il computer e il software
// del professionista — dal browser non si può).
//  - Dentro l'app demo (user agent ORIONDemo/…): un solo bottone, si parte.
//  - Nel browser: la spiegazione e i download per Mac e Windows.

export default function DemoPage() {
  const [dentroApp, setDentroApp] = useState(false);
  const [avvio, setAvvio] = useState<"fermo" | "in_corso" | "errore">("fermo");
  const [errore, setErrore] = useState<string | null>(null);
  // Chi entra SENZA account (la demo) accetta prima l'NDA: ORION è riservato.
  const [nda, setNda] = useState(false);

  useEffect(() => {
    setDentroApp(navigator.userAgent.includes("ORIONDemo/"));
  }, []);

  async function avvia() {
    if (avvio === "in_corso") return;
    setAvvio("in_corso");
    setErrore(null);
    try {
      const r = await fetch("/api/demo/avvia", { method: "POST" });
      const d = await r.json();
      if (d?.ok) {
        window.location.href = "/app";
        return;
      }
      setErrore(d?.errore ?? "Qualcosa è andato storto. Riprova.");
      setAvvio("errore");
    } catch {
      setErrore("Connessione assente. Controlla la rete e riprova.");
      setAvvio("errore");
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#05080f] px-6 py-14 text-slate-100">
      {/* Scenografia */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-140px] h-[420px] w-[640px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(103,232,249,0.14), transparent)" }}
      />

      <div className="relative w-full max-w-xl text-center lg:max-w-3xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-200 lg:px-5 lg:py-1.5 lg:text-sm">
          🎬 ORION Demo
        </div>

        {dentroApp ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-6xl">Benvenuto nella demo</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400 lg:mt-5 lg:max-w-2xl lg:text-xl lg:leading-relaxed">
              Adesso conosci ORION di persona: una breve chiacchierata per capire il tuo lavoro, poi ti porta
              lui a fare un giro guidato — parla, agisce e ti fa provare tutto. Nessun dato vero, nessun impegno.
            </p>
            <label className="mx-auto mt-8 flex max-w-md cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-xs leading-relaxed text-slate-400 lg:text-sm">
              <input type="checkbox" checked={nda} onChange={(e) => setNda(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-cyan-400" />
              <span>
                Accetto l&apos;accordo di riservatezza: ciò che vedo di ORION — funzionamento e architettura — è riservato, e mi impegno a
                non copiarlo, replicarlo, decompilarlo né diffonderlo.
              </span>
            </label>
            <button
              onClick={avvia}
              disabled={avvio === "in_corso" || !nda}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-cyan-400/40 bg-cyan-400/15 px-8 py-4 text-lg font-semibold text-cyan-50 shadow-[0_0_30px_rgba(103,232,249,0.15)] transition hover:bg-cyan-400/25 disabled:opacity-40 lg:rounded-3xl lg:px-14 lg:py-6 lg:text-2xl"
            >
              {avvio === "in_corso" ? "Preparo il tuo studio di prova…" : "Inizia la demo"}
            </button>
            {errore && <p className="mt-4 text-sm text-rose-300 lg:text-base">{errore}</p>}
            <p className="mt-6 text-[11px] text-slate-500 lg:mt-8 lg:text-sm">
              Serve il microfono per parlare con ORION (te lo chiede lui). Lo studio di prova si cancella da solo dopo pochi giorni.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-6xl">Prova ORION dal vivo</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400 lg:mt-5 lg:max-w-2xl lg:text-xl lg:leading-relaxed">
              La demo è ORION vero, guidato da ORION in persona: ti accoglie, ti fa un giro delle sue
              meraviglie e le fa succedere davanti ai tuoi occhi — anche dentro il software che già usi.
              Per questo vive sul computer, non nel browser.
            </p>
            <div className="mx-auto mt-8 grid max-w-md gap-3 sm:grid-cols-2">
              <a
                href="/api/scarica?os=demo_mac"
                className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-4 font-semibold text-cyan-50 transition hover:bg-cyan-400/20"
              >
                 Scarica per Mac
                <div className="mt-0.5 text-[11px] font-normal text-slate-400">Apple Silicon · gratis</div>
              </a>
              <a
                href="/api/scarica?os=demo_win"
                className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-4 font-semibold text-cyan-50 transition hover:bg-cyan-400/20"
              >
                ⊞ Scarica per Windows
                <div className="mt-0.5 text-[11px] font-normal text-slate-400">Windows 10/11 · installer · gratis</div>
              </a>
            </div>
            {/* ORION non è ancora firmato digitalmente: il sistema avvisa. Meglio
                dirlo prima con semplicità che lasciare qualcuno spaventato a metà. */}
            <p className="mx-auto mt-4 max-w-md text-[11px] leading-relaxed text-slate-500">
              La prima volta il computer chiede conferma perché ORION è nuovo: su Windows premi
              «Ulteriori informazioni → Esegui comunque», su Mac tasto destro sull'app → «Apri». È normale.
            </p>
            <div className="mx-auto mt-6 flex max-w-md flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span>✓ Senza carta</span>
              <span>✓ Senza registrazione</span>
              <span>✓ Guidata da ORION</span>
              <span>✓ Si autodistrugge da sola</span>
            </div>
            <a href="/" className="mt-8 inline-block text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline">
              ← Torna al sito
            </a>
          </>
        )}
      </div>
    </main>
  );
}
