"use client";

import { useEffect, useRef, useState } from "react";
import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "software_prova" }>["dati"];

// ── LA FINESTRA DI PROVA DEL SOFTWARE DELL'UTENTE ────────────────────────────
// Quando il professionista nomina il suo software, ORION apre QUESTA: un finto
// gestionale/Calendar (col suo nome) e lo OPERA col cursore — clicca, scrive un
// appuntamento, salva — davanti ai suoi occhi. Volutamente in tema CHIARO, con
// un'estetica "da SaaS", per leggere all'istante come un ALTRO programma (ORION
// è scuro e vetroso): così si capisce che ORION lavora fuori dal proprio mondo.
// Prova che ORION sa usare qualsiasi software: non un collegamento magico, ma il
// pilotare lo schermo come farebbe una persona.

type Passo = { a: "cursore" | "click" | "scrivi" | "salva" | "fatto"; verso?: "nuovo" | "campo" | "salva"; testo?: string };

export function SoftwareProvaPanel({ dati }: { dati: Dati }) {
  const contRef = useRef<HTMLDivElement>(null);
  const nuovoRef = useRef<HTMLButtonElement>(null);
  const campoRef = useRef<HTMLDivElement>(null);
  const salvaRef = useRef<HTMLButtonElement>(null);

  const [cursore, setCursore] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [click, setClick] = useState<{ x: number; y: number; n: number } | null>(null);
  const [formAperto, setFormAperto] = useState(false);
  const [digitato, setDigitato] = useState("");
  const [salvato, setSalvato] = useState(false);
  const [fatto, setFatto] = useState(false);

  const testoDaScrivere = `${dati.cliente} — ${dati.prestazione}, ${dati.quando}`;

  // Il centro di un elemento, in coordinate del contenitore.
  const centro = (el: HTMLElement | null): { x: number; y: number } => {
    const c = contRef.current;
    if (!el || !c) return { x: 40, y: 40 };
    const r = el.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    return { x: r.left - cr.left + r.width / 2, y: r.top - cr.top + r.height / 2 };
  };

  useEffect(() => {
    // La sceneggiatura, deterministica: ORION apre, scrive, salva. I timer si
    // ripuliscono se il pannello si chiude a metà.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const dopo = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    dopo(700, () => setCursore(centro(nuovoRef.current))); // vai su "Nuovo"
    dopo(1500, () => {
      const p = centro(nuovoRef.current);
      setClick({ ...p, n: 1 });
      setFormAperto(true);
    });
    // Digitazione lettera per lettera.
    dopo(2100, () => setCursore(centro(campoRef.current)));
    let i = 0;
    dopo(2400, () => {
      const scrivi = () => {
        i += 1;
        setDigitato(testoDaScrivere.slice(0, i));
        if (i < testoDaScrivere.length) dopo(28 + Math.random() * 34, scrivi);
      };
      scrivi();
    });
    const finoScrittura = 2400 + testoDaScrivere.length * 52;
    dopo(finoScrittura + 300, () => setCursore(centro(salvaRef.current))); // vai su "Salva"
    dopo(finoScrittura + 900, () => {
      const p = centro(salvaRef.current);
      setClick({ ...p, n: 2 });
    });
    dopo(finoScrittura + 1200, () => {
      setSalvato(true);
      setFormAperto(false);
    });
    dopo(finoScrittura + 1700, () => setFatto(true));

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eCalendar = dati.skin === "calendar";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-white text-slate-800 shadow-2xl ring-1 ring-black/10">
      <style>{`
        @keyframes sw-click { from { opacity: .6; transform: translate(-50%,-50%) scale(.3); } to { opacity: 0; transform: translate(-50%,-50%) scale(2.4); } }
        @keyframes sw-evento { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: none; } }
        @keyframes sw-fatto { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes sw-caret { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>

      {/* Barra del titolo — sembra una finestra di un altro programma */}
      <div className={`flex items-center gap-2 px-4 py-2.5 ${eCalendar ? "bg-[#1a73e8]" : "bg-slate-800"} text-white`}>
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/30" />
          <span className="size-2.5 rounded-full bg-white/30" />
          <span className="size-2.5 rounded-full bg-white/30" />
        </span>
        <span className="ml-2 text-sm font-semibold">{dati.nome}</span>
        <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium tracking-wide">
          finestra di prova
        </span>
      </div>

      {/* Barra strumenti */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <button
          ref={nuovoRef}
          className={`rounded-md px-3 py-1.5 text-sm font-medium text-white ${eCalendar ? "bg-[#1a73e8]" : "bg-slate-800"}`}
        >
          + Nuovo appuntamento
        </button>
        <span className="text-sm text-slate-400">Oggi</span>
        <span className="text-sm text-slate-400">Settimana</span>
        <span className="ml-auto text-xs text-slate-400">{dati.nome}</span>
      </div>

      {/* Corpo: griglia calendario o lista gestionale */}
      <div ref={contRef} className="relative flex-1 overflow-hidden">
        {eCalendar ? <SkinCalendar salvato={salvato} testo={testoDaScrivere} /> : <SkinGestionale salvato={salvato} testo={testoDaScrivere} />}

        {/* Il form che ORION compila */}
        {formAperto && (
          <div
            className="absolute left-1/2 top-1/2 w-[78%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
            style={{ animation: "sw-evento .25s ease-out both" }}
          >
            <div className="mb-2 text-sm font-semibold text-slate-700">Nuovo appuntamento</div>
            <div ref={campoRef} className="min-h-[42px] rounded-lg border border-[#1a73e8]/40 bg-[#1a73e8]/[0.04] px-3 py-2.5 text-[15px] text-slate-800">
              {digitato}
              <span style={{ animation: "sw-caret 1s step-end infinite" }} className="ml-0.5 inline-block w-px align-middle text-slate-500">
                |
              </span>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded-md px-3 py-1.5 text-sm text-slate-500">Annulla</button>
              <button ref={salvaRef} className={`rounded-md px-4 py-1.5 text-sm font-medium text-white ${eCalendar ? "bg-[#1a73e8]" : "bg-slate-800"}`}>
                Salva
              </button>
            </div>
          </div>
        )}

        {/* Il cursore di ORION */}
        <div
          className="pointer-events-none absolute z-20"
          style={{ left: cursore.x, top: cursore.y, transform: "translate(-3px,-2px)", transition: "left .7s cubic-bezier(.4,0,.2,1), top .7s cubic-bezier(.4,0,.2,1)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow">
            <path d="M4 2l6 16 2.5-6.5L19 9z" fill="#0f172a" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <span className="absolute left-5 top-4 whitespace-nowrap rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white shadow">
            ORION
          </span>
        </div>

        {/* Il "ping" del click */}
        {click && (
          <span
            key={click.n}
            className="pointer-events-none absolute z-10 size-7 rounded-full border-2 border-slate-900"
            style={{ left: click.x, top: click.y, animation: "sw-click .5s ease-out both" }}
          />
        )}

        {/* Conferma finale */}
        {fatto && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg"
            style={{ animation: "sw-fatto .4s ease-out both" }}
          >
            ✓ Appuntamento scritto da ORION
          </div>
        )}
      </div>
    </div>
  );
}

// La griglia calendario (stile Google Calendar): righe orarie, l'evento nuovo.
function SkinCalendar({ salvato, testo }: { salvato: boolean; testo: string }) {
  const ore = ["09:00", "10:00", "11:00", "12:00", "15:00", "16:00", "17:00"];
  return (
    <div className="h-full overflow-auto">
      {ore.map((o, i) => (
        <div key={o} className="flex border-b border-slate-100" style={{ minHeight: 46 }}>
          <div className="w-16 shrink-0 border-r border-slate-100 px-2 py-1 text-right text-[11px] text-slate-400">{o}</div>
          <div className="relative flex-1 px-2 py-1">
            {i === 1 && salvato && (
              <div className="rounded-md bg-[#1a73e8] px-2 py-1 text-[12px] font-medium text-white" style={{ animation: "sw-evento .3s ease-out both" }}>
                {testo}
              </div>
            )}
            {i === 3 && <div className="rounded-md bg-emerald-500/80 px-2 py-1 text-[12px] text-white">Andrea Colombo</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// La vista gestionale: sidebar + lista appuntamenti del giorno.
function SkinGestionale({ salvato, testo }: { salvato: boolean; testo: string }) {
  return (
    <div className="flex h-full">
      <div className="w-40 shrink-0 border-r border-slate-200 bg-slate-50 p-3">
        {["📅 Agenda", "👥 Clienti", "📄 Documenti", "💶 Pagamenti", "⚙️ Impostazioni"].map((v, i) => (
          <div key={v} className={`mb-1 rounded-md px-2.5 py-2 text-sm ${i === 0 ? "bg-slate-800 font-medium text-white" : "text-slate-500"}`}>
            {v}
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="mb-3 text-sm font-semibold text-slate-600">Agenda di oggi</div>
        <div className="space-y-2">
          <Riga ora="10:00" testo="Andrea Colombo" />
          <Riga ora="15:00" testo="Elena Ricci" />
          <Riga ora="17:00" testo="Paolo Fontana" stato="da confermare" />
          {salvato && (
            <div className="flex items-center gap-3 rounded-lg border border-[#1a73e8]/30 bg-[#1a73e8]/[0.06] px-3 py-2.5" style={{ animation: "sw-evento .3s ease-out both" }}>
              <span className="font-mono text-sm text-slate-500">09:00</span>
              <span className="text-sm text-slate-800">{testo}</span>
              <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">nuovo</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Riga({ ora, testo, stato }: { ora: string; testo: string; stato?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
      <span className="font-mono text-sm text-slate-500">{ora}</span>
      <span className="text-sm text-slate-800">{testo}</span>
      {stato && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">{stato}</span>}
    </div>
  );
}
