"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import createGlobe from "cobe";
import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "mappa" }>["dati"];

// Stile vettoriale (CARTO dark-matter): gratis, senza chiave, 3D-capace. Lo ricoloriamo.
const STILE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// Colori come nel video: acqua blu navy, parchi/vegetazione verdi.
function colora(map: maplibregl.Map) {
  const set = (id: string, prop: string, val: string) => {
    try {
      if (map.getLayer(id)) map.setPaintProperty(id, prop, val);
    } catch {
      /* layer assente: ignora */
    }
  };
  set("background", "background-color", "#0a0f16");
  set("water", "fill-color", "#0e2a47");
  set("landcover", "fill-color", "#0c2018");
  set("park_national_park", "fill-color", "#103a2c");
  set("park_nature_reserve", "fill-color", "#103a2c");
}

// Strade come nel video: arterie rosa al neon, principali blu chiaro, minori grigio-blu.
function strade(map: maplibregl.Map) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "line") continue;
    const id = layer.id;
    try {
      if (/(mot|trunk)_fill/.test(id)) {
        map.setPaintProperty(id, "line-color", "#e879f9");
        map.setPaintProperty(id, "line-blur", 0.5);
      } else if (/(pri|sec)_fill/.test(id)) {
        map.setPaintProperty(id, "line-color", "#9fb2d6");
      } else if (/(minor|service)_fill/.test(id)) {
        map.setPaintProperty(id, "line-color", "#5c6e93");
      }
    } catch {
      /* layer non ricolorabile: ignora */
    }
  }
}

// Edifici estrusi per il look 3D "Jarvis".
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
          "fill-extrusion-color": "#13314a",
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
  const globeHostRef = useRef<HTMLDivElement | null>(null);
  const [mostraMappa, setMostraMappa] = useState(false);

  // GLOBO a puntini cyan (COBE), come nel video. Canvas creata a mano e rimossa
  // nel cleanup: ogni mount ha un contesto WebGL fresco (sopravvive a Strict Mode).
  useEffect(() => {
    const host = globeHostRef.current;
    if (!host) return;
    const cv = document.createElement("canvas");
    cv.style.position = "absolute";
    host.appendChild(cv);

    const targetPhi = -(dati.lon * Math.PI) / 180;
    let phi = targetPhi - 0.7;
    const theta = Math.max(-0.5, Math.min(0.5, (dati.lat / 90) * 0.6));
    let lato = Math.min(host.clientWidth, host.clientHeight) * 0.72 || 260;
    const applica = () => {
      lato = Math.min(host.clientWidth, host.clientHeight) * 0.72 || 260;
      cv.style.width = `${lato}px`;
      cv.style.height = `${lato}px`;
      cv.style.left = `${(host.clientWidth - lato) / 2}px`;
      cv.style.top = `${(host.clientHeight - lato) / 2}px`;
    };
    applica();
    const ro = new ResizeObserver(applica);
    ro.observe(host);

    const globe = createGlobe(cv, {
      devicePixelRatio: 2,
      width: lato * 2,
      height: lato * 2,
      phi,
      theta,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 7,
      baseColor: [0.22, 0.55, 0.78],
      markerColor: [0.4, 0.92, 1],
      glowColor: [0.16, 0.5, 0.8],
      markers: [{ location: [dati.lat, dati.lon], size: 0.1 }],
      onRender: (state) => {
        phi += (targetPhi - phi) * 0.045 + 0.004;
        state.phi = phi;
        state.width = lato * 2;
        state.height = lato * 2;
      },
    });

    return () => {
      globe.destroy();
      ro.disconnect();
      cv.remove();
    };
  }, [dati]);

  // MAPPA 3D (MapLibre) colorata. Si rivela dopo il globo con un "tuffo" nella città.
  useEffect(() => {
    if (!mapRef.current) return;
    setMostraMappa(false); // il pannello è riusato tra una mappa e l'altra: riparti dal globo
    let revealTimer: ReturnType<typeof setTimeout>;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: STILE,
      center: [dati.lon, dati.lat],
      zoom: Math.max(3, dati.zoom - 3),
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapRef.current);

    map.on("load", () => {
      map.resize();
      colora(map);
      strade(map);
      edifici3D(map);

      const c = document.createElement("div");
      c.className = "orion-mark orion-mark-center";
      new maplibregl.Marker({ element: c })
        .setLngLat([dati.lon, dati.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${esc(dati.luogo)}</b>`))
        .addTo(map);

      for (const p of dati.poi) {
        const el = document.createElement("div");
        el.className = "orion-mark orion-mark-poi";
        new maplibregl.Marker({ element: el })
          .setLngLat([p.lon, p.lat])
          .setPopup(new maplibregl.Popup({ offset: 12 }).setText(p.nome))
          .addTo(map);
      }

      // Dopo l'intro del globo: rivela e "tuffati" nella città.
      revealTimer = setTimeout(() => {
        setMostraMappa(true);
        map.flyTo({
          center: [dati.lon, dati.lat],
          zoom: dati.zoom,
          pitch: 55,
          bearing: -18,
          duration: 2600,
          essential: true,
        });
      }, 2000);
    });

    return () => {
      clearTimeout(revealTimer);
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
        {/* Mappa (sotto). MapLibre forza position:relative → uso h-full w-full. */}
        <div ref={mapRef} className="h-full w-full" />

        {/* Sfondo scuro dell'intro: copre la mappa finché c'è il globo */}
        <div
          className="pointer-events-none absolute inset-0 bg-[#070b12] transition-opacity duration-700"
          style={{ opacity: mostraMappa ? 0 : 1 }}
        />

        {/* Globo a puntini (sopra), canvas montata via ref host */}
        <div
          ref={globeHostRef}
          className="pointer-events-none absolute inset-0 transition-all duration-700 ease-out"
          style={{ opacity: mostraMappa ? 0 : 1, transform: mostraMappa ? "scale(2.4)" : "scale(1)" }}
        />
      </div>
    </div>
  );
}

export default MappaPanel;
