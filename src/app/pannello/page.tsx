"use client";

import { useEffect, useState } from "react";
import type { Vista } from "@/lib/orion/views";
import { PanelStage } from "@/components/PanelStage";

// Finestra separata di ORION Desktop: mostra UNA sola vista (pannello).
// La vista arriva da Electron via window.orionDesktop.onVista(...).
type ConOnVista = { onVista?: (cb: (v: Vista) => void) => void };

function etichetta(v: Vista): string {
  const d = v as unknown as { titolo?: string; dati?: { luogo?: string; titolo?: string; nome?: string } };
  return d.titolo || d.dati?.luogo || d.dati?.titolo || d.dati?.nome || "ORION";
}

export default function PannelloPage() {
  const [vista, setVista] = useState<Vista | null>(null);

  useEffect(() => {
    const w = window as unknown as { orionDesktop?: ConOnVista };
    w.orionDesktop?.onVista?.((v) => {
      setVista(v);
      document.title = `ORION — ${etichetta(v)}`;
    });
  }, []);

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#070b12] p-4 text-slate-100">
      {vista ? (
        <PanelStage viste={[vista]} />
      ) : (
        <div className="grid h-full place-items-center text-sm text-slate-500">Carico…</div>
      )}
    </main>
  );
}
