"use client";

import type { Vista } from "@/lib/orion/views";
import { ora, dataBreve, euro, etichettaStato } from "./format";

type Dati = Extract<Vista, { tipo: "cliente" }>["dati"];

export function ClientePanel({ dati }: { dati: Dati }) {
  const { cliente, appuntamenti, pagamenti, comunicazioni, note, totaleIncassato } = dati;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-cyan-100">{cliente.nome}</h2>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
            {cliente.telefono && <span>{cliente.telefono}</span>}
            {cliente.email && <span>{cliente.email}</span>}
          </div>
        </div>
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-right">
          <div className="text-xs text-emerald-300/70">Incassato</div>
          <div className="text-lg font-semibold text-emerald-200">{euro(totaleIncassato)}</div>
        </div>
      </div>

      {cliente.note && (
        <div className="mb-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100/90">
          {cliente.note}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto pr-1 md:grid-cols-2">
        <Sezione titolo="Appuntamenti">
          {appuntamenti.length === 0 ? (
            <Vuoto>Nessun appuntamento.</Vuoto>
          ) : (
            appuntamenti.map((a) => (
              <Riga key={a.id} sx={`${dataBreve(a.inizio)} · ${ora(a.inizio)}`} dx={etichettaStato(a.stato)}>
                {a.titolo}
              </Riga>
            ))
          )}
        </Sezione>

        <Sezione titolo="Pagamenti">
          {pagamenti.length === 0 ? (
            <Vuoto>Nessun pagamento.</Vuoto>
          ) : (
            pagamenti.map((p) => (
              <Riga key={p.id} sx={dataBreve(p.data)} dx={euro(p.importo)}>
                {p.descrizione ?? etichettaStato(p.stato)}
              </Riga>
            ))
          )}
        </Sezione>

        <Sezione titolo="Comunicazioni">
          {comunicazioni.length === 0 ? (
            <Vuoto>Nessun messaggio.</Vuoto>
          ) : (
            comunicazioni.map((c) => (
              <Riga key={c.id} sx={c.direzione === "in" ? "Ricevuto" : "Inviato"} dx="">
                {c.contenuto ?? c.tipo}
              </Riga>
            ))
          )}
        </Sezione>

        <Sezione titolo="Note">
          {note.length === 0 ? (
            <Vuoto>Nessuna nota.</Vuoto>
          ) : (
            note.map((n) => (
              <Riga key={n.id} sx={dataBreve(n.created_at)} dx="">
                {n.titolo ? `${n.titolo}: ` : ""}
                {n.contenuto}
              </Riga>
            ))
          )}
        </Sezione>
      </div>
    </div>
  );
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">{titolo}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Riga({ sx, dx, children }: { sx: string; dx: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="w-20 shrink-0 text-xs text-slate-500">{sx}</span>
      <span className="min-w-0 flex-1 truncate text-slate-200">{children}</span>
      {dx && <span className="shrink-0 text-slate-400">{dx}</span>}
    </div>
  );
}

function Vuoto({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-slate-500">{children}</div>;
}
