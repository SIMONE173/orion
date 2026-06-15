"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "profilo" }>["dati"];

export function ProfiloPanel({ dati }: { dati: Dati }) {
  const p = dati.profilo;
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">Memoria operativa</h2>
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto pr-1 md:grid-cols-2">
        <Sezione titolo="Chi sei">
          <Riga etichetta="Nome" valore={p.nome} />
          <Riga etichetta="Professione" valore={p.professione} />
          <Riga etichetta="Durata visita" valore={p.durata_visita_min ? `${p.durata_visita_min} min` : null} />
        </Sezione>
        <Sezione titolo="Come lavori">
          <Riga etichetta="Comunicazione" valore={p.canale_comunicazione} />
          <Riga etichetta="Cancellazioni" valore={p.gestione_cancellazioni} />
          <Riga etichetta="Abitudini" valore={p.abitudini} />
        </Sezione>
        <Sezione titolo="Dati fiscali">
          <Riga etichetta="P.IVA" valore={p.piva} />
          <Riga etichetta="Codice fiscale" valore={p.codice_fiscale} />
          <Riga etichetta="Regime" valore={p.regime_fiscale} />
        </Sezione>
        <Sezione titolo="Contatti fiscali">
          <Riga etichetta="Indirizzo" valore={p.indirizzo} />
          <Riga etichetta="PEC" valore={p.pec} />
          <Riga etichetta="SDI" valore={p.sdi} />
        </Sezione>
      </div>
      {p.problemi_tempo && (
        <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100/90">
          <span className="text-amber-300/70">Cosa ti fa perdere tempo: </span>
          {p.problemi_tempo}
        </div>
      )}
    </div>
  );
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">{titolo}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Riga({ etichetta, valore }: { etichetta: string; valore: string | number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-slate-500">{etichetta}</span>
      <span className="min-w-0 text-right text-slate-200">{valore ?? "—"}</span>
    </div>
  );
}
