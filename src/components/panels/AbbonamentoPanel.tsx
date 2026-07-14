"use client";

import { useState } from "react";
import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "abbonamento" }>["dati"];

function Riga({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/5 py-2.5">
      <span className="text-sm text-slate-400">{etichetta}</span>
      <span className="text-sm font-medium text-slate-100">{valore}</span>
    </div>
  );
}

export function AbbonamentoPanel({ dati }: { dati: Dati }) {
  const s = dati.stato;
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const vai = async (endpoint: "checkout" | "portal") => {
    setBusy(true);
    setErrore(null);
    try {
      const r = await fetch(`/api/stripe/${endpoint}`, { method: "POST" });
      const d = await r.json();
      if (d?.ok && d.url) {
        window.location.href = d.url;
        return;
      }
      setErrore(d?.errore ?? "Operazione non riuscita.");
    } catch {
      setErrore("Errore di rete.");
    } finally {
      setBusy(false);
    }
  };

  const badge =
    s.stato === "attivo"
      ? { testo: "Attivo", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" }
      : s.stato === "prova"
        ? { testo: `Prova gratuita`, cls: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" }
        : s.stato === "annullato"
          ? { testo: "In disdetta", cls: "border-amber-400/30 bg-amber-400/10 text-amber-200" }
          : s.stato === "scaduto"
            ? { testo: "Scaduto", cls: "border-rose-400/30 bg-rose-400/10 text-rose-200" }
            : { testo: "Demo", cls: "border-white/15 bg-white/5 text-slate-300" };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Abbonamento ORION</h2>
          <p className="text-xs text-slate-400">Il piano che tiene ORION al tuo fianco</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${badge.cls}`}>{badge.testo}</span>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        {!s.configurato && (
          <p className="text-sm leading-relaxed text-slate-300">
            ORION è in <strong>modalità demo</strong>: tutte le funzioni sono attive e libere. Gli
            abbonamenti si accenderanno quando il servizio aprirà ufficialmente — non devi fare nulla ora.
          </p>
        )}

        {s.configurato && s.inProva && (
          <p className="text-sm leading-relaxed text-slate-300">
            Sei nella <strong>prova gratuita</strong>: ti restano{" "}
            <strong className="text-cyan-200">{s.giorniProvaRimasti} giorni</strong>. Al termine parte
            l&apos;abbonamento; puoi <strong>disdire quando vuoi</strong> prima della fine e non paghi nulla.
          </p>
        )}

        {s.configurato && s.stato === "annullato" && (
          <p className="text-sm leading-relaxed text-slate-300">
            Disdetta registrata: ORION resta attivo fino alla fine del periodo. Puoi riattivarlo quando
            vuoi dal pulsante qui sotto.
          </p>
        )}

        {s.configurato && s.attivo && (
          <p className="text-sm leading-relaxed text-slate-300">
            Abbonamento <strong className="text-emerald-200">attivo</strong>. Grazie! ORION è al tuo
            fianco a pieno regime.
          </p>
        )}

        {s.configurato && s.stato === "scaduto" && (
          <p className="text-sm leading-relaxed text-slate-300">
            La prova è terminata. Attiva l&apos;abbonamento per riprendere ad usare ORION senza limiti.
          </p>
        )}

        {s.configurato && (
          <div className="mt-4">
            {s.periodoFine && (
              <Riga
                etichetta={s.attivo ? "Prossimo rinnovo" : "Valido fino al"}
                valore={new Date(s.periodoFine).toLocaleDateString("it-IT")}
              />
            )}
          </div>
        )}
      </div>

      {errore && (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3.5 py-2 text-sm text-rose-200">
          {errore}
        </div>
      )}

      {s.configurato && (
        <div className="mt-5 flex flex-wrap gap-3">
          {/* Chi NON ha ancora un abbonamento (scaduto/da attivare) → attiva. */}
          {(s.stato === "scaduto" || s.stato === "da_attivare") && (
            <button
              onClick={() => vai("checkout")}
              disabled={busy}
              className="rounded-xl bg-cyan-500/90 px-6 py-3 font-medium text-slate-900 transition hover:bg-cyan-400 disabled:opacity-50"
            >
              {busy ? "Un attimo…" : "Attiva l'abbonamento"}
            </button>
          )}
          {/* Chi HA un abbonamento (in prova, attivo o in disdetta) → portale:
              cambia carta, cambia piano, DISDICE la prova o l'abbonamento. */}
          {(s.stato === "prova" || s.stato === "attivo" || s.stato === "annullato") && (
            <button
              onClick={() => vai("portal")}
              disabled={busy}
              className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              {busy ? "Un attimo…" : s.stato === "prova" ? "Gestisci o disdici la prova" : "Gestisci o disdici l'abbonamento"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
