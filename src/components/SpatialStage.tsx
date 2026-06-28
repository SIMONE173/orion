"use client";

import { useRef } from "react";
import type { Vista } from "@/lib/orion/views";
import { renderPanel } from "./PanelStage";
import { IconClose } from "./icons";

// Pannelli FLUTTUANTI per la Gesture Mode spaziale. Ognuno ha posizione/dimensione
// proprie (dal layout) e si può manovrare a mano (GestiMode) o col mouse (fallback,
// così è usabile e testabile anche senza camera). Attributi data-gesti per l'hit-test.

export type Rett = { x: number; y: number; w: number; h: number; z: number };
export type Layout = Record<string, Rett>;

export const MIN_W = 280;
export const MIN_H = 180;

export function SpatialStage({
  viste,
  layout,
  attivo,
  onSposta,
  onRidimensiona,
  onPortaAvanti,
  onChiudi,
  onSnapHint,
  onSnapApplica,
}: {
  viste: Vista[];
  layout: Layout;
  attivo: string | null;
  onSposta: (tipo: string, x: number, y: number) => void;
  onRidimensiona: (tipo: string, w: number, h: number) => void;
  onPortaAvanti: (tipo: string) => void;
  onChiudi: (tipo: string) => void;
  onSnapHint: (x: number, y: number) => void;
  onSnapApplica: (tipo: string) => void;
}) {
  return (
    <div data-gesti-stage className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {viste.map((v) => {
        const r = layout[v.tipo];
        if (!r) return null;
        return (
          <FloatingPanel
            key={v.tipo}
            vista={v}
            r={r}
            attivo={attivo === v.tipo}
            onSposta={onSposta}
            onRidimensiona={onRidimensiona}
            onPortaAvanti={onPortaAvanti}
            onChiudi={onChiudi}
            onSnapHint={onSnapHint}
            onSnapApplica={onSnapApplica}
          />
        );
      })}
    </div>
  );
}

function FloatingPanel({
  vista,
  r,
  attivo,
  onSposta,
  onRidimensiona,
  onPortaAvanti,
  onChiudi,
  onSnapHint,
  onSnapApplica,
}: {
  vista: Vista;
  r: Rett;
  attivo: boolean;
  onSposta: (tipo: string, x: number, y: number) => void;
  onRidimensiona: (tipo: string, w: number, h: number) => void;
  onPortaAvanti: (tipo: string) => void;
  onChiudi: (tipo: string) => void;
  onSnapHint: (x: number, y: number) => void;
  onSnapApplica: (tipo: string) => void;
}) {
  const tipo = vista.tipo;
  const drag = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);

  // Trascinamento col mouse dalla barra del titolo.
  const iniziaDrag = (e: React.PointerEvent) => {
    onPortaAvanti(tipo);
    drag.current = { ox: r.x, oy: r.y, px: e.clientX, py: e.clientY };
    const muovi = (ev: PointerEvent) => {
      if (!drag.current) return;
      onSposta(tipo, drag.current.ox + (ev.clientX - drag.current.px), drag.current.oy + (ev.clientY - drag.current.py));
      onSnapHint(ev.clientX, ev.clientY); // anteprima della zona di snap
    };
    const su = () => {
      drag.current = null;
      onSnapApplica(tipo); // se sopra una zona, aggancia
      window.removeEventListener("pointermove", muovi);
      window.removeEventListener("pointerup", su);
    };
    window.addEventListener("pointermove", muovi);
    window.addEventListener("pointerup", su);
  };

  // Ridimensionamento col mouse dall'angolo.
  const iniziaResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    onPortaAvanti(tipo);
    const start = { w: r.w, h: r.h, px: e.clientX, py: e.clientY };
    const muovi = (ev: PointerEvent) => {
      onRidimensiona(tipo, start.w + (ev.clientX - start.px), start.h + (ev.clientY - start.py));
    };
    const su = () => {
      window.removeEventListener("pointermove", muovi);
      window.removeEventListener("pointerup", su);
    };
    window.addEventListener("pointermove", muovi);
    window.addEventListener("pointerup", su);
  };

  return (
    <div
      data-gesti={tipo}
      onPointerDown={() => onPortaAvanti(tipo)}
      className={`panel-enter glass pointer-events-auto fixed flex flex-col overflow-hidden rounded-2xl ${
        attivo ? "ring-2 ring-cyan-400/60 shadow-[0_0_40px] shadow-cyan-500/20" : "ring-1 ring-white/10"
      }`}
      style={{ left: r.x, top: r.y, width: r.w, height: r.h, zIndex: r.z }}
    >
      {/* Barra del titolo: maniglia di trascinamento + chiusura */}
      <div
        onPointerDown={iniziaDrag}
        className="flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-white/8 px-3 py-2 active:cursor-grabbing"
      >
        <span className="select-none truncate text-xs font-medium uppercase tracking-wider text-slate-400">{tipo}</span>
        <button
          data-gesti-close={tipo}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onChiudi(tipo)}
          className="grid size-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-200"
          aria-label="Chiudi"
        >
          <IconClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Contenuto del pannello (riuso dei pannelli esistenti) */}
      <div className="min-h-0 flex-1 overflow-hidden p-4">{renderPanel(vista)}</div>

      {/* Maniglia di ridimensionamento (mouse) */}
      <div
        onPointerDown={iniziaResize}
        className="absolute bottom-0 right-0 size-4 cursor-nwse-resize"
        style={{
          background: "linear-gradient(135deg, transparent 50%, rgba(34,211,238,0.5) 50%)",
        }}
      />
    </div>
  );
}
