"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "mappa" }>["dati"];

// Stile vettoriale scuro (CARTO dark-matter): gratis, senza chiave, 3D-capace.
const STILE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// Colora le strade come nel video: neon fucsia per autostrade, cyan per le principali.
function strade(map: maplibregl.Map) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "line") continue;
    const id = layer.id;
    try {
      if (/(mot|trunk)_fill/.test(id)) {
        map.setPaintProperty(id, "line-color", "#e879f9");
        map.setPaintProperty(id, "line-blur", 0.6);
      } else if (/(pri|sec)_fill/.test(id)) {
        map.setPaintProperty(id, "line-color", "#22d3ee");
        map.setPaintProperty(id, "line-blur", 0.4);
      } else if (/(minor|service)_fill/.test(id)) {
        map.setPaintProperty(id, "line-color", "#0e7490");
      }
    } catch {
      /* layer non ricolorabile: ignora */
    }
  }
}

// Estrude gli edifici per il look 3D "Jarvis".
function edifici3D(map: maplibregl.Map) {
  let primoSimbolo: string | undefined;
  for (const l of map.getStyle().layers ?? []) {
    if (l.type === "symbol") {
      primoSimbolo = l.id;
      break;
    }
  }
  try {
    map.addLayer(
      {
        id: "orion-edifici-3d",
        type: "fill-extrusion",
        source: "carto",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": "#0f2a3a",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 12],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.7,
        },
      },
      primoSimbolo
    );
  } catch {
    /* la sorgente potrebbe non avere gli edifici: pazienza */
  }
}

export function MappaPanel({ dati }: { dati: Dati }) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Si parte dalla Terra come GLOBO 3D scuro (proiezione nativa MapLibre)…
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: STILE,
      center: [dati.lon, dati.lat],
      zoom: 1.6,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");

    // Il pannello a volte non ha ancora la dimensione finale all'init: forziamo il resize.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapRef.current);

    let voloTimer: ReturnType<typeof setTimeout>;

    map.on("load", () => {
      map.resize();
      // La proiezione globo va impostata a stile caricato.
      try {
        map.setProjection({ type: "globe" });
      } catch {
        /* versione senza globo: resta mappa piatta */
      }
      strade(map);
      edifici3D(map);

      // Alone atmosferico attorno al globo (effetto "spazio").
      try {
        map.setSky({
          "sky-color": "#0a1018",
          "horizon-color": "#0e7490",
          "fog-color": "#0a0e14",
          "horizon-fog-blend": 0.5,
          "sky-horizon-blend": 0.6,
          "atmosphere-blend": 0.5,
        });
      } catch {
        /* alcune versioni non hanno setSky: pazienza */
      }

      // Marker centro
      const c = document.createElement("div");
      c.className = "orion-mark orion-mark-center";
      new maplibregl.Marker({ element: c })
        .setLngLat([dati.lon, dati.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${esc(dati.luogo)}</b>`))
        .addTo(map);

      // Marker posti trovati
      for (const p of dati.poi) {
        const el = document.createElement("div");
        el.className = "orion-mark orion-mark-poi";
        new maplibregl.Marker({ element: el })
          .setLngLat([p.lon, p.lat])
          .setPopup(new maplibregl.Popup({ offset: 12 }).setText(p.nome))
          .addTo(map);
      }

      // …e ci si "tuffa" nella città con un volo continuo (il globo si appiattisce da solo).
      voloTimer = setTimeout(() => {
        map.flyTo({
          center: [dati.lon, dati.lat],
          zoom: dati.zoom,
          pitch: 55,
          bearing: -18,
          duration: 4200,
          essential: true,
        });
      }, 700);
    });

    return () => {
      clearTimeout(voloTimer);
      ro.disconnect();
      map.remove();
    };
  }, [dati]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-cyan-300/70">Mappa</div>
          <div className="truncate text-lg font-semibold text-slate-100">{dati.luogo}</div>
        </div>
        {dati.cerca && (
          <span className="shrink-0 rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-1 text-xs text-fuchsia-200">
            {dati.poi.length} {dati.cerca}
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10">
        {/* MapLibre forza position:relative sul container: niente "absolute inset-0"
            (collasserebbe l'altezza), uso h-full w-full. */}
        <div ref={mapRef} className="h-full w-full" />
      </div>
    </div>
  );
}

export default MappaPanel;
