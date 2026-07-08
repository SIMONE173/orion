"use client";

import { useCallback, useEffect, useRef } from "react";

// AFFIANCAMENTO — ORION copilota sullo schermo. SOLO Desktop, SEMPRE attivo (non
// una modalità da accendere): appena ORION è aperto è già pronto. Questo componente
// è un ORCHESTRATORE INVISIBILE (rende null): quando serve GUARDA lo schermo, fa
// DISEGNARE le evidenze sull'overlay nativo e SPINGE il riassunto in una scheda-
// pannello vera (via onScheda → vista "affianca"). Guarda all'ISTANTE quando ORION
// glielo chiede (esplicito o proattivo dal discorso): non analizza a vuoto.

// Trigger esterno: quando `seq` cambia, ORION riguarda lo schermo (con l'eventuale
// domanda). Prop invece di ref imperativo → compatibile con next/dynamic ssr:false.
export type AffiancaRichiesta = { testo?: string; seq: number };
export type Evidenza = { etichetta: string; forma: string; x: number; y: number; w?: number; h?: number };
export type AffiancaDati = { riassunto: string; evidenze: Evidenza[]; stato: "guardo" | "pronto"; errore?: string };

type Bridge = {
  catturaSchermo?: () => Promise<{ ok: boolean; dataUrl?: string; errore?: string }>;
  affiancaOn?: () => void;
  affiancaOff?: () => void;
  affiancaDisegna?: (e: Evidenza[]) => void;
};
const bridge = (): Bridge | null =>
  typeof window !== "undefined" && (window as unknown as { orionDesktop?: Bridge }).orionDesktop
    ? (window as unknown as { orionDesktop: Bridge }).orionDesktop
    : null;

export function AffiancaMode({
  parla,
  richiesta,
  onScheda,
}: {
  parla: (t: string) => void;
  richiesta?: AffiancaRichiesta;
  onScheda: (dati: AffiancaDati) => void;
}) {
  const inFlight = useRef(false);
  const onSchedaRef = useRef(onScheda);
  onSchedaRef.current = onScheda;
  const parlaRef = useRef(parla);
  parlaRef.current = parla;

  const analizza = useCallback(async (domanda?: string) => {
    const b = bridge();
    if (!b?.catturaSchermo || inFlight.current) return;
    inFlight.current = true;
    onSchedaRef.current({ riassunto: "", evidenze: [], stato: "guardo" });
    try {
      // Pulisce le evidenze vecchie prima di catturare (niente disegni nello scatto).
      b.affiancaDisegna?.([]);
      await new Promise((r) => setTimeout(r, 120));
      const scatto = await b.catturaSchermo();
      if (!scatto.ok || !scatto.dataUrl) {
        onSchedaRef.current({
          riassunto: "",
          evidenze: [],
          stato: "pronto",
          errore:
            scatto.errore === "permesso_schermo"
              ? "Mi serve il permesso «Registrazione schermo»: Impostazioni di Sistema → Privacy e Sicurezza → Registrazione schermo → attiva ORION, poi riavviami."
              : "Non riesco a guardare lo schermo in questo momento.",
        });
        return;
      }
      const res = await fetch("/api/affianca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame: scatto.dataUrl, domanda }),
      });
      const d = (await res.json()) as { riassunto?: string; parla?: string; evidenzia?: Evidenza[] };
      const ev = Array.isArray(d.evidenzia) ? d.evidenzia : [];
      b.affiancaDisegna?.(ev);
      onSchedaRef.current({ riassunto: (d.riassunto ?? "").trim(), evidenze: ev, stato: "pronto" });
      const dire = (d.parla ?? "").trim();
      if (dire) parlaRef.current(dire);
    } catch {
      onSchedaRef.current({ riassunto: "", evidenze: [], stato: "pronto", errore: "Qualcosa è andato storto guardando lo schermo." });
    } finally {
      inFlight.current = false;
    }
  }, []);

  // ORION chiede di guardare (esplicito o proattivo): riguarda all'istante.
  const ultimaSeq = useRef(0);
  useEffect(() => {
    if (richiesta && richiesta.seq > ultimaSeq.current) {
      ultimaSeq.current = richiesta.seq;
      analizza((richiesta.testo ?? "").trim() || undefined);
    }
  }, [richiesta, analizza]);

  // All'avvio: overlay nativo pronto + "priming" del permesso schermo. Uno scatto a
  // vuoto (NON mandato alla vista → zero costo) fa comparire la richiesta di macOS
  // già all'apertura, così l'utente concede il permesso subito.
  useEffect(() => {
    const b = bridge();
    if (!b?.affiancaOn) return; // solo Desktop
    b.affiancaOn();
    const t = setTimeout(() => {
      bridge()?.catturaSchermo?.().catch(() => {});
    }, 2500);
    return () => {
      clearTimeout(t);
      const bb = bridge();
      bb?.affiancaDisegna?.([]);
      bb?.affiancaOff?.();
    };
  }, []);

  return null;
}
