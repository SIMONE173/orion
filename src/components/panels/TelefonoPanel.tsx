"use client";

import { useEffect, useRef, useState } from "react";
import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "telefono" }>["dati"];

type Bolla = { chi: "cliente" | "studio"; testo: string };

// ── IL TELEFONO DEL CLIENTE (demo) ───────────────────────────────────────────
// L'utente impersona il SUO cliente: scrive nel WhatsApp finto dello studio e
// vede la segreteria di ORION rispondere DA SOLA (stessa pipeline del webhook
// vero, via /api/whatsapp/simula). È il momento "caspita, risponde davvero".

export function TelefonoPanel({ dati }: { dati: Dati }) {
  const [bolle, setBolle] = useState<Bolla[]>([]);
  const [testo, setTesto] = useState("");
  const [staScrivendo, setStaScrivendo] = useState(false);
  const fondo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight, behavior: "smooth" });
  }, [bolle, staScrivendo]);

  async function invia() {
    const t = testo.trim();
    if (!t || staScrivendo) return;
    setTesto("");
    setBolle((b) => [...b, { chi: "cliente", testo: t }]);
    setStaScrivendo(true);
    try {
      const r = await fetch("/api/whatsapp/simula", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telefono: dati.telefono, testo: t, processa: true }),
      });
      const d = (await r.json()) as { ok?: boolean; risposte?: string[] };
      const risposte = (d.risposte ?? []).filter(Boolean);
      if (risposte.length) {
        setBolle((b) => [...b, ...risposte.map((testo) => ({ chi: "studio" as const, testo }))]);
      } else {
        setBolle((b) => [
          ...b,
          { chi: "studio", testo: "✓ Messaggio ricevuto dallo studio (il titolare è stato avvisato)." },
        ]);
      }
    } catch {
      setBolle((b) => [...b, { chi: "studio", testo: "⚠️ Il messaggio non è partito. Riprova." }]);
    } finally {
      setStaScrivendo(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center">
      <style>{`
        @keyframes tel-entra { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: none; } }
        @keyframes tel-bolla { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes tel-punto { 0%, 60%, 100% { transform: none; opacity: 0.4; } 30% { transform: translateY(-3px); opacity: 1; } }
      `}</style>

      <p className="mb-2 text-center text-xs text-slate-400">
        Qui sei TU il cliente: scrivi come scriverebbe {dati.cliente.split(" ")[0]} — la segreteria risponde da sola.
      </p>

      {/* La cornice del telefono */}
      <div
        className="flex min-h-0 w-full max-w-[340px] flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 shadow-2xl"
        style={{ animation: "tel-entra 0.6s cubic-bezier(0.2,0.8,0.2,1) both" }}
      >
        {/* Header WhatsApp dello studio */}
        <div className="flex items-center gap-3 bg-[#075E54] px-4 pb-3 pt-4">
          <div className="grid size-9 place-items-center rounded-full bg-white/15 text-sm font-semibold text-white">S</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">Lo Studio (il tuo numero)</div>
            <div className="flex items-center gap-1 text-[11px] text-emerald-100/90">
              <span className="size-1.5 rounded-full bg-emerald-300" /> risponde ORION, anche di notte
            </div>
          </div>
        </div>

        {/* La chat */}
        <div ref={fondo} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#0b141a] px-3 py-3">
          {bolle.length === 0 && (
            <div className="mx-auto mt-6 max-w-[220px] rounded-xl bg-white/[0.04] px-3 py-2 text-center text-[11px] leading-relaxed text-slate-500">
              Prova con: «Buonasera, domani non riesco a venire, posso spostare?»
            </div>
          )}
          {bolle.map((b, i) => (
            <div key={i} className={`flex ${b.chi === "cliente" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-snug ${
                  b.chi === "cliente" ? "rounded-br-md bg-[#005c4b] text-emerald-50" : "rounded-bl-md bg-[#202c33] text-slate-100"
                }`}
                style={{ animation: "tel-bolla 0.25s ease-out both" }}
              >
                {b.testo}
              </div>
            </div>
          ))}
          {staScrivendo && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-[#202c33] px-3.5 py-2.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 rounded-full bg-slate-400"
                    style={{ animation: `tel-punto 1.1s ${i * 0.18}s infinite` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* L'input del cliente */}
        <div className="flex items-center gap-2 border-t border-white/5 bg-[#111b21] px-2.5 py-2.5">
          <input
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") invia();
            }}
            placeholder={`Scrivi come ${dati.cliente.split(" ")[0]}…`}
            className="min-w-0 flex-1 rounded-full bg-[#202c33] px-4 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            onClick={invia}
            disabled={!testo.trim() || staScrivendo}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[#00a884] text-white transition disabled:opacity-40"
            title="Invia"
            aria-label="Invia"
          >
            <svg viewBox="0 0 24 24" className="ml-0.5 size-4 fill-current">
              <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
