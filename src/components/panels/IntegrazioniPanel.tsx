"use client";

import { useEffect, useState } from "react";
import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "integrazioni" }>["dati"];

const TIPO_LABEL: Record<string, string> = {
  gestionale: "Gestionale",
  crm: "CRM",
  erp: "ERP",
  medico: "Software medico",
  legale: "Software legale",
  fiscale: "Software fiscale",
  hr: "HR",
  produzione: "Produzione",
  magazzino: "Magazzino",
  ticketing: "Ticketing",
  cloud: "Cloud",
  database: "Database",
  archivio: "Archivio",
  altro: "Altro",
};

export function IntegrazioniPanel({ dati }: { dati: Dati }) {
  const connessioni = dati.connessioni;
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!connessioni.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <h2 className="mb-2 text-lg font-semibold tracking-tight text-cyan-100">Sistemi collegati</h2>
        <p className="max-w-sm text-sm text-slate-400">
          Nessun sistema esterno collegato. Raccontami quali software usi (gestionale, CRM, archivio…):
          li comprenderò e li coordinerò, senza farti cambiare nulla.
        </p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-1 text-lg font-semibold tracking-tight text-cyan-100">Sistemi collegati</h2>
      <p className="mb-4 text-sm text-slate-400">L&apos;ambiente digitale che ORION comprende ({connessioni.length})</p>
      <div className="flex-1 space-y-3 overflow-auto pr-1">
        {connessioni.map((c) => (
          <div key={c.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-slate-100">{c.nome}</span>
              <span className="shrink-0 text-xs text-cyan-300/70">{TIPO_LABEL[c.tipo] ?? c.tipo}</span>
            </div>
            {c.descrizione && <div className="mt-1 text-xs text-slate-400">{c.descrizione}</div>}
            {c.regole && <div className="mt-1 text-xs text-slate-500">Regole: {c.regole}</div>}
            {c.modalita === "ingest" && c.token && (
              <div className="mt-2 rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Endpoint per inviare i dati a ORION</div>
                <div className="mt-0.5 break-all font-mono text-xs text-slate-300">
                  {origin}/api/integrazioni/ingest
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Token</div>
                <div className="break-all font-mono text-xs text-cyan-200/80">{c.token}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
