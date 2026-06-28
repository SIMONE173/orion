"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "profilo" }>["dati"];

// La memoria operativa è un JSON { tema: dettaglio }. La rendiamo come elenco.
function parseMemoria(json: string | null | undefined): [string, string][] {
  if (!json) return [];
  try {
    const m = JSON.parse(json) as Record<string, string>;
    return Object.entries(m).filter(([, v]) => typeof v === "string" && v.trim().length > 0);
  } catch {
    return [];
  }
}

export function ProfiloPanel({ dati }: { dati: Dati }) {
  const { profilo: p, azienda, ruolo } = dati;

  // Ambiente AZIENDA: identità condivisa + codice in evidenza.
  if (azienda) {
    const mem = parseMemoria(azienda.memoria_operativa);
    return (
      <div className="flex h-full flex-col">
        <h2 className="mb-1 text-lg font-semibold tracking-tight text-cyan-100">
          ORION · {azienda.nome ?? "Azienda"}
        </h2>
        <p className="mb-4 text-sm text-slate-400">Memoria aziendale condivisa</p>

        {azienda.codice_aziendale && (
          <div className="mb-4 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.07] px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wider text-cyan-300/70">
              Codice aziendale
            </div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-widest text-cyan-100">
              {azienda.codice_aziendale}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              I collaboratori lo usano per entrare in questo ambiente.
            </div>
          </div>
        )}

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto pr-1 md:grid-cols-2">
          <Sezione titolo="Azienda">
            <Riga etichetta="Nome" valore={azienda.nome} />
            <Riga etichetta="Settore" valore={azienda.settore} />
            <Riga etichetta="Dimensioni" valore={azienda.dimensioni} />
            <Riga etichetta="Sedi" valore={azienda.sedi} />
          </Sezione>
          <Sezione titolo="Tu nel team">
            <Riga etichetta="Nome" valore={p.nome} />
            <Riga etichetta="Ruolo" valore={ruolo ?? null} />
          </Sezione>
          <Sezione titolo="Dati fiscali">
            <Riga etichetta="P.IVA" valore={azienda.piva} />
            <Riga etichetta="Regime" valore={azienda.regime_fiscale} />
            <Riga etichetta="Indirizzo" valore={azienda.indirizzo} />
          </Sezione>
          <Sezione titolo="Contatti fiscali">
            <Riga etichetta="PEC" valore={azienda.pec} />
            <Riga etichetta="SDI" valore={azienda.sdi} />
            <Riga etichetta="Cod. fiscale" valore={azienda.codice_fiscale} />
          </Sezione>
          {mem.length > 0 && (
            <div className="md:col-span-2">
              <SezioneMemoria titolo="Come lavora l'azienda" voci={mem} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Ambiente SINGOLO: autonomo o uso personale.
  const mem = parseMemoria(p.memoria_operativa);
  const usoLavoro = p.tipo_uso !== "personale";
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">Memoria operativa</h2>
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto pr-1 md:grid-cols-2">
        <Sezione titolo="Chi sei">
          <Riga etichetta="Nome" valore={p.nome} />
          {usoLavoro && <Riga etichetta="Professione" valore={p.professione} />}
          <Riga
            etichetta="Uso"
            valore={p.tipo_uso === "personale" ? "Personale" : usoLavoro ? "Lavoro" : null}
          />
        </Sezione>
        {usoLavoro && (
          <Sezione titolo="Dati fiscali">
            <Riga etichetta="P.IVA" valore={p.piva} />
            <Riga etichetta="Codice fiscale" valore={p.codice_fiscale} />
            <Riga etichetta="Regime" valore={p.regime_fiscale} />
            <Riga etichetta="Indirizzo" valore={p.indirizzo} />
            <Riga etichetta="PEC" valore={p.pec} />
            <Riga etichetta="SDI" valore={p.sdi} />
          </Sezione>
        )}
        {mem.length > 0 && (
          <div className="md:col-span-2">
            <SezioneMemoria titolo="Come lavori / preferenze" voci={mem} />
          </div>
        )}
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

function SezioneMemoria({ titolo, voci }: { titolo: string; voci: [string, string][] }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <div className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">{titolo}</div>
      <div className="space-y-3">
        {voci.map(([tema, dettaglio]) => (
          <div key={tema}>
            <div className="text-xs font-medium uppercase tracking-wider text-cyan-300/60">{tema}</div>
            <div className="mt-0.5 text-sm text-slate-200">{dettaglio}</div>
          </div>
        ))}
      </div>
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
