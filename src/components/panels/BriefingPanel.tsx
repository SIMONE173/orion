"use client";

import type { Vista } from "@/lib/orion/views";
import { ora, euro, etichettaStato } from "./format";

type Dati = Extract<Vista, { tipo: "briefing" }>["dati"];

export function BriefingPanel({ dati }: { dati: Dati }) {
  const prossimi = [...dati.appuntamenti].sort((a, b) => a.inizio.localeCompare(b.inizio));

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">
        Briefing della giornata
      </h2>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi n={dati.totaleAppuntamenti} label="Appuntamenti" tono="cyan" />
        <Kpi n={dati.daConfermare} label="Da confermare" tono="amber" />
        <Kpi n={dati.messaggiRicevutiOggi} label="Messaggi oggi" tono="emerald" />
        <Kpi n={dati.promemoriaAttivi} label="Promemoria" tono="rose" />
        <Kpi n={dati.clientiInattivi} label="Clienti inattivi" tono="indigo" />
      </div>

      {dati.pagamentiInSospeso > 0 && (
        <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-100">
          {dati.pagamentiInSospeso} pagament{dati.pagamentiInSospeso === 1 ? "o" : "i"} in sospeso ·{" "}
          {euro(dati.importoInSospeso)}
        </div>
      )}

      <div className="flex-1 overflow-auto pr-1">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Agenda di oggi
        </div>
        {prossimi.length === 0 ? (
          <div className="text-sm text-slate-500">Nessun appuntamento oggi.</div>
        ) : (
          <div className="space-y-2">
            {prossimi.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] p-3"
              >
                <span className="w-14 shrink-0 font-mono text-cyan-200">{ora(a.inizio)}</span>
                <span className="min-w-0 flex-1 truncate text-slate-100">
                  {a.titolo}
                  {a.cliente_nome ? ` · ${a.cliente_nome}` : ""}
                </span>
                {a.stato === "da_confermare" && (
                  <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300">
                    {etichettaStato(a.stato)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  n,
  label,
  tono,
}: {
  n: number;
  label: string;
  tono: "cyan" | "amber" | "emerald" | "indigo" | "rose";
}) {
  const toni = {
    cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    indigo: "border-indigo-400/20 bg-indigo-400/10 text-indigo-200",
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  }[tono];
  return (
    <div className={`rounded-xl border px-4 py-3 ${toni}`}>
      <div className="text-2xl font-semibold">{n}</div>
      <div className="text-xs opacity-70">{label}</div>
    </div>
  );
}
