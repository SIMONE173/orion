"use client";

import { useRef, useState } from "react";
import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "importa" }>["dati"];

type Analisi = {
  stage_id: string;
  nome_file: string;
  colonne: string[];
  totale: number;
  esempi: Record<string, string>[];
};

// Import dei dati esistenti: l'utente esporta CSV/Excel dal software che usa
// già e lo carica qui. L'analisi (colonne + esempi) va a ORION in conversazione,
// che propone la mappatura; l'esito dell'import ricompare in questo pannello.
export function ImportaPanel({ dati }: { dati: Dati }) {
  const [analisi, setAnalisi] = useState<Analisi | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const esito = dati.esito;

  const carica = async (file: File) => {
    setErrore(null);
    setCaricamento(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error("File non leggibile."));
        r.readAsDataURL(file);
      });
      const resp = await fetch("/api/importa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome: file.name, base64 }),
      });
      const d = await resp.json();
      if (!d.ok) throw new Error(d.errore ?? "Analisi fallita.");
      const a = d as Analisi;
      setAnalisi(a);
      // Passa l'analisi a ORION (messaggio di sistema, non visibile in chat):
      // da qui in poi la mappatura si decide in conversazione.
      const esempi = JSON.stringify(a.esempi);
      window.dispatchEvent(
        new CustomEvent("orion:messaggio", {
          detail: {
            testo:
              `[Sistema] L'utente ha caricato "${a.nome_file}" nel pannello di import` +
              (dati.sistema ? ` (dal software ${dati.sistema})` : "") +
              `. stage_id: ${a.stage_id}. Righe di dati: ${a.totale}. Colonne: ${a.colonne.join(" · ")}. ` +
              `Prime righe: ${esempi.length > 1600 ? esempi.slice(0, 1600) + "…" : esempi}. ` +
              `Proponi all'utente la mappatura più adatta (clienti / appuntamenti / entita_esterne), chiedi conferma e poi usa esegui_import (anche più volte sullo stesso stage_id per destinazioni diverse).`,
          },
        })
      );
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Qualcosa è andato storto.");
    } finally {
      setCaricamento(false);
    }
  };

  // Esito dell'import: ORION ha eseguito la mappatura.
  if (esito) {
    const righe: [string, string | number][] = [
      ["Righe nel file", esito.totale ?? 0],
      ["Importati", esito.importati ?? 0],
      ["Integrati (già presenti)", esito.aggiornati ?? 0],
      ["Saltati", esito.saltati ?? 0],
    ];
    const analisiEsito = Object.entries(esito.analisi ?? {}).filter(([, v]) => v != null && String(v) !== "");
    return (
      <div className="flex h-full flex-col p-1">
        <h2 className="mb-1 text-lg font-semibold tracking-tight text-cyan-100">
          {esito.ok ? "Import completato" : "Import non riuscito"}
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          {esito.ok
            ? `Destinazione: ${esito.destinazione}${esito.sistema ? ` · da ${esito.sistema}` : ""}`
            : esito.errore}
        </p>
        {esito.ok && (
          <div className="grid grid-cols-2 gap-2">
            {righe.map(([k, v]) => (
              <div key={k} className="glass rounded-xl px-4 py-3">
                <div className="text-2xl font-semibold text-cyan-200">{v}</div>
                <div className="text-xs text-slate-400">{k}</div>
              </div>
            ))}
          </div>
        )}
        {esito.ok && analisiEsito.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Cosa ho capito dai dati</div>
            <ul className="space-y-1.5">
              {analisiEsito.map(([k, v]) => (
                <li key={k} className="text-sm text-slate-300">
                  <span className="text-slate-500">{k.replaceAll("_", " ")}:</span>{" "}
                  {Array.isArray(v) ? v.join(", ") : String(v)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(esito.motivi_salto?.length ?? 0) > 0 && (
          <p className="mt-3 text-xs text-slate-500">Motivi dei salti: {esito.motivi_salto!.join(" · ")}</p>
        )}
      </div>
    );
  }

  // Analisi fatta: la palla passa alla conversazione.
  if (analisi) {
    return (
      <div className="flex h-full flex-col p-1">
        <h2 className="mb-1 text-lg font-semibold tracking-tight text-cyan-100">File letto</h2>
        <p className="mb-4 text-xs text-slate-400">
          «{analisi.nome_file}» — {analisi.totale} righe. Ho passato la struttura a ORION: ti propone lui come importarla, continua a voce.
        </p>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Colonne trovate</div>
        <div className="flex flex-wrap gap-1.5">
          {analisi.colonne.map((c) => (
            <span key={c} className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-100">
              {c}
            </span>
          ))}
        </div>
        <button
          onClick={() => {
            setAnalisi(null);
            setErrore(null);
          }}
          className="mt-5 self-start rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
        >
          Carica un altro file
        </button>
      </div>
    );
  }

  // Stato iniziale: zona di caricamento.
  return (
    <div className="flex h-full flex-col p-1">
      <h2 className="mb-1 text-lg font-semibold tracking-tight text-cyan-100">Porta dentro i tuoi dati</h2>
      <p className="mb-4 max-w-md text-sm text-slate-400">
        Esporta da {dati.sistema ? <span className="text-slate-200">{dati.sistema}</span> : "il software che usi già"} un file{" "}
        <span className="text-slate-200">CSV o Excel</span> (clienti, appuntamenti, archivio…) e caricalo qui: leggo la
        struttura e mi adatto ai tuoi dati.
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) carica(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`grid flex-1 cursor-pointer place-items-center rounded-2xl border-2 border-dashed transition ${
          drag ? "border-cyan-400/70 bg-cyan-400/10" : "border-white/15 bg-white/[0.02] hover:border-cyan-400/40"
        }`}
      >
        <div className="text-center">
          {caricamento ? (
            <p className="text-sm text-cyan-200">Leggo il file…</p>
          ) : (
            <>
              <p className="text-sm text-slate-300">Trascina qui il file, o clicca per sceglierlo</p>
              <p className="mt-1 text-xs text-slate-500">.csv · .xlsx — fino a ~8 MB</p>
            </>
          )}
        </div>
      </div>
      {errore && <p className="mt-3 text-sm text-rose-300">{errore}</p>}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xlsm,.tsv,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) carica(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
