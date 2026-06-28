"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "memoria" }>["dati"];

// Etichette leggibili + ordine di presentazione delle categorie.
const CATEGORIE: { chiave: string; titolo: string }[] = [
  { chiave: "priorita", titolo: "Priorità" },
  { chiave: "preferenza", titolo: "Preferenze" },
  { chiave: "abitudine", titolo: "Abitudini" },
  { chiave: "procedura", titolo: "Procedure" },
  { chiave: "flusso", titolo: "Flussi di lavoro" },
  { chiave: "decisione", titolo: "Decisioni tipiche" },
  { chiave: "eccezione", titolo: "Eccezioni" },
  { chiave: "errore_da_evitare", titolo: "Errori da evitare" },
  { chiave: "contesto", titolo: "Contesto" },
];

const PALLINI: Record<string, string> = {
  alto: "bg-cyan-400",
  medio: "bg-cyan-400/50",
  basso: "bg-cyan-400/25",
};

export function MemoriaPanel({ dati }: { dati: Dati }) {
  const intu = dati.intuizioni;

  if (!intu.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <h2 className="mb-2 text-lg font-semibold tracking-tight text-cyan-100">Memoria del tuo lavoro</h2>
        <p className="max-w-sm text-sm text-slate-400">
          Non ho ancora imparato abbastanza. Lavorando insieme costruirò un quadro vivo del tuo modo di
          lavorare: preferenze, abitudini, priorità e procedure.
        </p>
      </div>
    );
  }

  const presenti = CATEGORIE.filter((c) => intu.some((m) => m.categoria === c.chiave));
  // Categorie non previste (per sicurezza) finiscono in coda.
  const altre = intu.filter((m) => !CATEGORIE.some((c) => c.chiave === m.categoria));

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-1 text-lg font-semibold tracking-tight text-cyan-100">Memoria del tuo lavoro</h2>
      <p className="mb-4 text-sm text-slate-400">Ciò che ho imparato lavorando con te ({intu.length})</p>
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto pr-1 md:grid-cols-2">
        {presenti.map((c) => (
          <Gruppo key={c.chiave} titolo={c.titolo} voci={intu.filter((m) => m.categoria === c.chiave)} />
        ))}
        {altre.length > 0 && <Gruppo titolo="Altro" voci={altre} />}
      </div>
    </div>
  );
}

type Voce = Dati["intuizioni"][number];

function Gruppo({ titolo, voci }: { titolo: string; voci: Voce[] }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <div className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">{titolo}</div>
      <div className="space-y-3">
        {voci.map((m) => (
          <div key={m.id} className="flex gap-2.5">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PALLINI[m.confidenza] ?? "bg-cyan-400/40"}`}
              title={`confidenza ${m.confidenza}${m.evidenze > 1 ? ` · osservata ${m.evidenze} volte` : ""}`}
            />
            <div className="min-w-0">
              <div className="text-sm text-slate-200">
                {m.soggetto && <span className="text-cyan-300/70">{m.soggetto}: </span>}
                {m.contenuto}
              </div>
              {m.motivo && <div className="mt-0.5 text-xs text-slate-500">perché {m.motivo}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
