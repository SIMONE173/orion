"use client";

import { useEffect, useRef, useState } from "react";
import { OrionCore, type CoreState } from "@/components/OrionCore";

// ── IL MINI-NUCLEO · /nucleo ─────────────────────────────────────────────────
// La finestrella SEMPRE IN PRIMO PIANO di ORION Desktop: quando l'app viene
// ridotta a icona, resta SOLO il nucleo (trasparente, niente sfondi) in alto
// a sinistra, sopra qualsiasi finestra. Respira con lo stato vero di ORION e
// sotto mostra i "disegnini" di ciò che sta facendo (via BroadcastChannel
// 'orion-nucleo', trasmesso dalla finestra principale). Click = torna a ORION.

const DOODLE: Record<string, { emoji: string; testo: string }> = {
  agenda: { emoji: "🗓", testo: "Agenda" },
  appuntamenti: { emoji: "🗓", testo: "Agenda" },
  cliente: { emoji: "👤", testo: "Scheda cliente" },
  clienti: { emoji: "👥", testo: "Clienti" },
  stampa: { emoji: "🖨", testo: "Sto stampando" },
  documento: { emoji: "📄", testo: "Documento" },
  documenti: { emoji: "📄", testo: "Documenti" },
  email: { emoji: "✉️", testo: "Email" },
  whatsapp: { emoji: "💬", testo: "WhatsApp" },
  comunicazioni: { emoji: "💬", testo: "Messaggi" },
  fattura: { emoji: "🧾", testo: "Fattura" },
  fatture: { emoji: "🧾", testo: "Fatture" },
  pagamenti: { emoji: "💶", testo: "Pagamenti" },
  economia: { emoji: "📊", testo: "Analisi" },
  promemoria: { emoji: "⏰", testo: "Promemoria" },
  attesa: { emoji: "♻️", testo: "Lista d'attesa" },
  apri_app: { emoji: "🚀", testo: "Apro l'app" },
  apri: { emoji: "🚀", testo: "Apro" },
  chiudi_app: { emoji: "🌙", testo: "Chiudo l'app" },
  esegui: { emoji: "⚙️", testo: "Eseguo" },
  file: { emoji: "📁", testo: "File" },
  cartella: { emoji: "📁", testo: "Cartella" },
  briefing: { emoji: "📋", testo: "Briefing" },
  consegne: { emoji: "🌉", testo: "Consegne" },
  calendario: { emoji: "🗓", testo: "Calendario" },
  chiamata: { emoji: "📞", testo: "Chiamata" },
  affianca: { emoji: "👀", testo: "Guardo lo schermo" },
};

function doodleDi(nome: string): { emoji: string; testo: string } {
  const chiave = Object.keys(DOODLE).find((k) => nome.toLowerCase().includes(k));
  return chiave ? DOODLE[chiave] : { emoji: "✨", testo: "Al lavoro" };
}

export default function MiniNucleo() {
  const [core, setCore] = useState<CoreState>("idle");
  const [doodle, setDoodle] = useState<{ emoji: string; testo: string } | null>(null);
  const timerDoodle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Trasparenza totale: questa pagina vive in una finestra senza sfondo.
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    let canale: BroadcastChannel | null = null;
    try {
      canale = new BroadcastChannel("orion-nucleo");
      canale.onmessage = (e) => {
        const m = e.data as { tipo?: string; core?: CoreState; nome?: string };
        if (m?.tipo === "stato" && m.core) setCore(m.core);
        if (m?.tipo === "azione" && m.nome) {
          setDoodle(doodleDi(String(m.nome)));
          if (timerDoodle.current) clearTimeout(timerDoodle.current);
          timerDoodle.current = setTimeout(() => setDoodle(null), 3400);
        }
      };
    } catch {
      /* senza canale resta un nucleo che respira: comunque bello */
    }
    return () => {
      canale?.close();
      if (timerDoodle.current) clearTimeout(timerDoodle.current);
    };
  }, []);

  // Click sul nucleo → la finestra di ORION torna in primo piano.
  const tornaAOrion = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (window as any).orionDesktop;
    if (d?.mostraOrion) d.mostraOrion();
  };

  return (
    <main
      onClick={tornaAOrion}
      title="Torna a ORION"
      style={{
        position: "fixed",
        inset: 0,
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 10,
        cursor: "pointer",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      <OrionCore state={core} size={104} />

      {/* Il disegnino di ciò che sta facendo, sotto il nucleo */}
      {doodle && (
        <div
          key={doodle.testo + doodle.emoji}
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid rgba(56,232,255,.45)",
            background: "rgba(8,16,22,.88)",
            boxShadow: "0 8px 26px rgba(0,0,0,.5), 0 0 18px rgba(56,232,255,.15)",
            animation: "nucleoDoodle .45s cubic-bezier(.34,1.56,.64,1) both",
          }}
        >
          <span style={{ fontSize: 17, animation: "nucleoSaltella 1s ease-in-out infinite" }}>{doodle.emoji}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", color: "#c9ecf7", whiteSpace: "nowrap" }}>{doodle.testo}</span>
        </div>
      )}

      <style>{`
        html, body { background: transparent !important; }
        @keyframes nucleoDoodle { from { opacity: 0; transform: translateY(8px) scale(.7) } to { opacity: 1; transform: none } }
        @keyframes nucleoSaltella { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
      `}</style>
    </main>
  );
}
