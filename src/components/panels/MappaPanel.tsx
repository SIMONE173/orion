"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "mappa" }>["dati"];

export function MappaPanel({ dati }: { dati: Dati }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { zoomControl: true, attributionControl: true }).setView(
      [dati.lat, dati.lon],
      dati.zoom
    );
    // Tile scure (CARTO dark) per restare in tema con ORION — gratis, senza chiave.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap, © CARTO",
      maxZoom: 20,
    }).addTo(map);

    // Centro (luogo richiesto)
    L.circleMarker([dati.lat, dati.lon], {
      radius: 9,
      color: "#67e8f9",
      weight: 2,
      fillColor: "#22d3ee",
      fillOpacity: 0.9,
    })
      .addTo(map)
      .bindPopup(`<b>${dati.luogo}</b>`);

    // Posti trovati
    for (const p of dati.poi) {
      L.circleMarker([p.lat, p.lon], {
        radius: 6,
        color: "#f0abfc",
        weight: 1,
        fillColor: "#e879f9",
        fillOpacity: 0.85,
      })
        .addTo(map)
        .bindPopup(p.nome);
    }
    if (dati.poi.length) {
      const gruppo = L.featureGroup([
        L.marker([dati.lat, dati.lon]),
        ...dati.poi.map((p) => L.marker([p.lat, p.lon])),
      ]);
      map.fitBounds(gruppo.getBounds().pad(0.2));
    }

    // Leaflet a volte calcola male le dimensioni dentro un flex: forziamo.
    setTimeout(() => map.invalidateSize(), 80);

    return () => {
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
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10" />
    </div>
  );
}

export default MappaPanel;
