"use client";

import { useEffect, useRef, useState } from "react";
import { OrionCore, type CoreState } from "@/components/OrionCore";

// ── IL MINI-NUCLEO · /nucleo ─────────────────────────────────────────────────
// La finestrella SEMPRE IN PRIMO PIANO di ORION Desktop: quando l'app viene
// ridotta a icona, resta SOLO il nucleo (trasparente, niente sfondi) in alto
// a sinistra, sopra qualsiasi finestra. Respira con lo stato vero di ORION e
// sotto mostra i "disegnini" di ciò che sta facendo (via BroadcastChannel
// 'orion-nucleo', trasmesso dalla finestra principale). Click = torna a ORION.

// Il logo VERO di WhatsApp (tracciato Simple Icons, CC0) per i messaggi dei
// clienti: sul mini-nucleo si vede il simbolo giusto, non un'emoji qualsiasi.
function LogoWhatsApp({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path
        fill="#25D366"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
      />
    </svg>
  );
}

const DOODLE: Record<string, { emoji: string; testo: string; wa?: boolean }> = {
  agenda: { emoji: "🗓", testo: "Agenda" },
  appuntamenti: { emoji: "🗓", testo: "Agenda" },
  cliente: { emoji: "👤", testo: "Scheda cliente" },
  clienti: { emoji: "👥", testo: "Clienti" },
  stampa: { emoji: "🖨", testo: "Sto stampando" },
  documento: { emoji: "📄", testo: "Documento" },
  documenti: { emoji: "📄", testo: "Documenti" },
  email: { emoji: "✉️", testo: "Email" },
  mail: { emoji: "✉️", testo: "Email" },
  whatsapp: { emoji: "", testo: "WhatsApp", wa: true },
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
  mano: { emoji: "🖱", testo: "Uso il tuo software" },
};

function doodleDi(nome: string): { emoji: string; testo: string; wa?: boolean } {
  const chiave = Object.keys(DOODLE).find((k) => nome.toLowerCase().includes(k));
  return chiave ? DOODLE[chiave] : { emoji: "✨", testo: "Al lavoro" };
}

export default function MiniNucleo() {
  const [core, setCore] = useState<CoreState>("idle");
  const [doodle, setDoodle] = useState<{ emoji: string; testo: string; wa?: boolean } | null>(null);
  const timerDoodle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Trasparenza totale: questa pagina vive in una finestra senza sfondo.
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    let canale: BroadcastChannel | null = null;
    try {
      canale = new BroadcastChannel("orion-nucleo");
      canale.onmessage = (e) => {
        const m = e.data as { tipo?: string; core?: CoreState; nome?: string; testo?: string };
        if (m?.tipo === "stato" && m.core) setCore(m.core);
        if (m?.tipo === "azione" && m.nome) {
          const base = doodleDi(String(m.nome));
          // La Mano manda anche la spiegazione del passo: la mostriamo viva.
          setDoodle({ emoji: base.emoji, wa: base.wa, testo: m.testo ? String(m.testo).slice(0, 30) : base.testo });
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
          <span style={{ fontSize: 17, display: "inline-flex", animation: "nucleoSaltella 1s ease-in-out infinite" }}>
            {doodle.wa ? <LogoWhatsApp size={17} /> : doodle.emoji}
          </span>
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
