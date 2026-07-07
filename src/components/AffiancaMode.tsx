"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconClose } from "./icons";

// MODALITÀ AFFIANCAMENTO (copilota sullo schermo). SOLO Desktop: ORION cattura
// ciò che è sullo schermo (il gestionale/sito che il pro già usa), lo fa leggere
// alla vista (/api/affianca), DISEGNA le evidenze sopra lo schermo reale (overlay
// nativo) e mostra qui un pannello-briefing col riassunto. On-demand (non un loop):
// si guarda all'avvio e quando l'utente lo chiede ("riguarda", o una domanda a voce).

// Richiesta esterna (voce): quando `seq` cambia, la modalità riguarda lo schermo
// con l'eventuale domanda. Evita un ref imperativo (così il componente si carica
// via next/dynamic ssr:false, corretto per un componente desktop-only).
export type AffiancaRichiesta = { testo?: string; seq: number };

type Evidenza = { etichetta: string; forma: string; x: number; y: number; w?: number; h?: number };
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
  onClose,
  parla,
  domandaIniziale,
  richiesta,
}: {
  onClose: () => void;
  parla: (t: string) => void;
  domandaIniziale?: string;
  richiesta?: AffiancaRichiesta;
}) {
    const [stato, setStato] = useState<"pronto" | "guardo" | "scrivo">("pronto");
    const [riassunto, setRiassunto] = useState<string>("");
    const [errore, setErrore] = useState<string | null>(null);
    const [evidenze, setEvidenze] = useState<Evidenza[]>([]);
    const inFlight = useRef(false);

    const analizza = useCallback(
      async (domanda?: string) => {
        const b = bridge();
        if (!b?.catturaSchermo) {
          setErrore("L'affiancamento sullo schermo è disponibile solo su ORION Desktop.");
          return;
        }
        if (inFlight.current) return;
        inFlight.current = true;
        setErrore(null);
        setStato("guardo");
        try {
          // Pulisce le evidenze vecchie prima di catturare (niente disegni nello scatto).
          b.affiancaDisegna?.([]);
          await new Promise((r) => setTimeout(r, 120));
          const scatto = await b.catturaSchermo();
          if (!scatto.ok || !scatto.dataUrl) {
            setErrore(
              scatto.errore === "permesso_schermo"
                ? "Mi serve il permesso «Registrazione schermo»: Impostazioni di Sistema → Privacy e Sicurezza → Registrazione schermo → attiva ORION, poi riprova."
                : "Non riesco a catturare lo schermo in questo momento."
            );
            setStato("pronto");
            return;
          }
          setStato("scrivo");
          const res = await fetch("/api/affianca", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ frame: scatto.dataUrl, domanda }),
          });
          const d = (await res.json()) as { riassunto?: string; parla?: string; evidenzia?: Evidenza[]; errore?: string };
          const ev = Array.isArray(d.evidenzia) ? d.evidenzia : [];
          b.affiancaDisegna?.(ev);
          setEvidenze(ev);
          setRiassunto((d.riassunto ?? "").trim());
          const dire = (d.parla ?? "").trim();
          if (dire) parla(dire);
        } catch {
          setErrore("Qualcosa è andato storto guardando lo schermo. Riprova.");
        } finally {
          inFlight.current = false;
          setStato("pronto");
        }
      },
      [parla]
    );

    // Richiesta dall'esterno (voce): "evidenziami gli appuntamenti di oggi".
    const ultimaSeq = useRef(0);
    useEffect(() => {
      if (richiesta && richiesta.seq > ultimaSeq.current) {
        ultimaSeq.current = richiesta.seq;
        analizza((richiesta.testo ?? "").trim() || undefined);
      }
    }, [richiesta, analizza]);

    // Avvio: apre l'overlay nativo e fa la prima lettura (con l'eventuale domanda).
    useEffect(() => {
      const b = bridge();
      b?.affiancaOn?.();
      analizza(domandaIniziale || undefined);
      return () => {
        const bb = bridge();
        bb?.affiancaDisegna?.([]);
        bb?.affiancaOff?.();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const chiudi = () => {
      const b = bridge();
      b?.affiancaDisegna?.([]);
      b?.affiancaOff?.();
      onClose();
    };

    const etichettaStato =
      stato === "guardo" ? "Guardo lo schermo…" : stato === "scrivo" ? "Preparo il riassunto…" : "Pronto";

    const occupato = stato !== "pronto";

    return (
      <div className="fade-in glass fixed bottom-5 left-5 z-50 flex max-h-[80vh] w-[min(94vw,420px)] flex-col overflow-hidden rounded-2xl border border-cyan-400/25 shadow-2xl">
        {/* Intestazione della scheda (come i pannelli di ORION). */}
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3.5">
          <span className="relative grid size-6 place-items-center">
            <span className="absolute inline-flex size-6 rounded-full bg-cyan-400/20" />
            <span className={`size-2.5 rounded-full bg-cyan-400 ${occupato ? "animate-pulse" : ""}`} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-none tracking-tight text-cyan-100">Affiancamento</h2>
            <p className="mt-1 text-xs text-slate-400">{etichettaStato}</p>
          </div>
          <button
            onClick={chiudi}
            className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-slate-200"
            aria-label="Chiudi affiancamento"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {/* Corpo della scheda. */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {errore ? (
            <p className="text-sm leading-relaxed text-amber-200">{errore}</p>
          ) : (
            <>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-100">
                {riassunto || "Guardo lo schermo che hai davanti (il tuo gestionale o sito) e ti evidenzio ciò che conta."}
              </p>

              {evidenze.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Cosa ti ho cerchiato
                  </div>
                  <ul className="space-y-1.5">
                    {evidenze.map((e, i) => {
                      const allerta = e.forma === "attenzione";
                      return (
                        <li key={i} className="flex items-center gap-2.5 text-sm text-slate-200">
                          <span
                            className={`size-2 shrink-0 rounded-full ${allerta ? "bg-amber-400" : "bg-cyan-400"}`}
                            style={{ boxShadow: `0 0 8px ${allerta ? "#fbbf24" : "#22d3ee"}` }}
                          />
                          <span className="truncate">{e.etichetta || (allerta ? "Da controllare" : "Da vedere")}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer con le azioni. */}
        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-3">
          <button
            onClick={() => analizza()}
            disabled={occupato}
            className="rounded-lg bg-cyan-500/90 px-3.5 py-2 text-sm font-medium text-slate-900 hover:bg-cyan-400 disabled:opacity-40"
          >
            Riguarda lo schermo
          </button>
          <span className="text-xs text-slate-500">Di&apos;: &quot;evidenziami…&quot;</span>
        </div>
      </div>
    );
}
