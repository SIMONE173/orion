"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { OrionCore } from "./OrionCore";

// ──────────────────────────────────────────────────────────────────────────
// IL CINEMA DELLA VETRINA: clicchi una funzione e vedi ORION al lavoro.
// Sei scene animate NATIVE (niente file video): si caricano all'istante,
// sono nitide su ogni schermo, girano in loop senza timeline né controlli.
// Ogni scena è coreografata su un orologio (ms) che riparte da capo da solo.
// ──────────────────────────────────────────────────────────────────────────

export type DemoId = "agenda" | "segreteria" | "posta" | "team" | "strumenti" | "mano" | "fortezza" | "voce" | "misura";

const TITOLI: Record<DemoId, string> = {
  agenda: "Un'agenda che si difende da sola",
  segreteria: "Risponde ai clienti al posto tuo",
  posta: "La posta che si annuncia da sola",
  team: "Il tuo team, dentro",
  strumenti: "Si aggancia ai tuoi strumenti",
  mano: "La Mano: usa i tuoi programmi lui",
  fortezza: "Una fortezza per i tuoi dati",
  voce: "Tutto il computer, a voce",
  misura: "Il tuo ORION, su misura",
};

// ── IL SUONO DELLE SCENE ─────────────────────────────────────────────────────
// Effetti gioiosi sintetizzati al volo (niente file): pop delle bolle,
// campanelline dei successi, whoosh dei movimenti, trillo dei timbri.
// Il click che apre la modale è il "gesto" che sblocca l'audio nel browser.

type NomeSuono = "avvio" | "pop" | "tick" | "ding" | "whoosh" | "tada" | "bonk";

let ctxAudio: AudioContext | null = null;
let mutoSuoni = false;
export function suoniAttivi(): boolean {
  return !mutoSuoni;
}
export function impostaSuoni(attivi: boolean, ricorda = true) {
  mutoSuoni = !attivi;
  if (!ricorda) return;
  try {
    localStorage.setItem("orion-demo-suoni", attivi ? "si" : "no");
  } catch {
    /* noop */
  }
}

export function suona(nome: NomeSuono) {
  if (mutoSuoni || typeof window === "undefined") return;
  try {
    if (!ctxAudio) ctxAudio = new AudioContext();
    const ctx = ctxAudio;
    if (ctx.state === "suspended") void ctx.resume();
    const ora = ctx.currentTime;

    // Una nota morbida: seno + inviluppo dolce (attacco rapido, coda lunga).
    const nota = (freq: number, t0: number, durata: number, vol: number, verso?: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, t0);
      if (verso) o.frequency.exponentialRampToValueAtTime(verso, t0 + durata);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + durata);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + durata + 0.05);
    };
    // Il soffio: rumore filtrato che scivola (per i movimenti).
    const soffio = (t0: number, durata: number, da: number, a: number, vol: number) => {
      const n = Math.floor(ctx.sampleRate * durata);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 1.1;
      f.frequency.setValueAtTime(da, t0);
      f.frequency.exponentialRampToValueAtTime(a, t0 + durata);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + durata);
      src.connect(f).connect(g).connect(ctx.destination);
      src.start(t0);
    };

    switch (nome) {
      case "avvio": // il sipario si apre: dolce salita
        nota(220, ora, 0.5, 0.045, 440);
        soffio(ora, 0.5, 300, 900, 0.02);
        break;
      case "pop": // una bolla che appare
        nota(520, ora, 0.1, 0.06, 760);
        break;
      case "tick": // un dettaglio che scatta
        nota(1320, ora, 0.05, 0.035);
        break;
      case "ding": // un successo: terza maggiore che brilla
        nota(1047, ora, 0.3, 0.055);
        nota(1319, ora + 0.09, 0.34, 0.05);
        break;
      case "whoosh": // qualcosa che vola
        soffio(ora, 0.38, 350, 1400, 0.05);
        break;
      case "tada": // il timbro finale: arpeggio felice
        nota(523, ora, 0.22, 0.05);
        nota(659, ora + 0.09, 0.22, 0.05);
        nota(784, ora + 0.18, 0.34, 0.055);
        nota(1047, ora + 0.27, 0.42, 0.045);
        break;
      case "bonk": // l'intruso respinto: tonfo simpatico
        nota(180, ora, 0.16, 0.07, 90);
        break;
    }
  } catch {
    /* l'audio non deve mai rompere la scena */
  }
}

// Suona gli spunti quando l'orologio li attraversa (gestendo il giro del loop).
function useSuoni(t: number, spunti: [number, NomeSuono][]) {
  const prima = useRef(-1);
  useEffect(() => {
    const p = prima.current;
    prima.current = t;
    if (p < 0 || t < p) return; // primo giro di clock o loop ripartito
    for (const [quando, nome] of spunti) if (quando > p && quando <= t) suona(nome);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
}

// Orologio in loop: torna i millisecondi trascorsi (0..durata), ~30fps.
function useOrologio(durataMs: number): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    let ultimoFrame = -1;
    const tick = (ora: number) => {
      const e = (ora - start) % durataMs;
      const frame = Math.floor(e / 33);
      if (frame !== ultimoFrame) {
        ultimoFrame = frame;
        setT(e);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durataMs]);
  return t;
}

const fra = (t: number, a: number, b: number) => t >= a && t < b;

// Effetto macchina da scrivere: il testo appare battuto in tempo reale.
function digita(testo: string, t: number, inizio: number, cps = 30): string {
  if (t < inizio) return "";
  return testo.slice(0, Math.floor(((t - inizio) / 1000) * cps));
}

// Elemento che entra/esce con dissolvenza + piccolo movimento.
function El({
  on,
  da = "translateY(10px)",
  style,
  children,
}: {
  on: boolean;
  da?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "translate(0,0) scale(1)" : da,
        transition: "opacity .5s cubic-bezier(.16,1,.3,1), transform .5s cubic-bezier(.16,1,.3,1)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Bolla di chat (utente o ORION).
function Bolla({
  mia,
  on,
  style,
  children,
}: {
  mia?: boolean;
  on: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "translateY(0) scale(1)" : "translateY(10px) scale(.96)",
        transition: "all .45s cubic-bezier(.16,1,.3,1)",
        maxWidth: 320,
        padding: "10px 14px",
        borderRadius: 15,
        fontSize: 14,
        lineHeight: 1.5,
        ...(mia
          ? {
              background: "rgba(56,232,255,.13)",
              border: "1px solid rgba(56,232,255,.3)",
              color: "#e8fbff",
              borderBottomRightRadius: 5,
              marginLeft: "auto",
            }
          : {
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: "#d5edf6",
              borderBottomLeftRadius: 5,
            }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Cornice-finestra dell'app (vetro scuro con barra e puntini).
function Finestra({ label, style, children }: { label: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,.1)",
        background: "rgba(9,16,23,.92)",
        boxShadow: "0 24px 70px rgba(0,0,0,.5)",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 13px",
          borderBottom: "1px solid rgba(255,255,255,.07)",
          background: "rgba(255,255,255,.03)",
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: 99, background: "#ff5f57" }} />
        <span style={{ width: 9, height: 9, borderRadius: 99, background: "#febc2e" }} />
        <span style={{ width: 9, height: 9, borderRadius: 99, background: "#28c840" }} />
        <span style={{ marginLeft: 8, fontSize: 11, letterSpacing: ".14em", color: "#7fa5b5", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ position: "relative", height: "calc(100% - 34px)" }}>{children}</div>
    </div>
  );
}

// Timbro "successo" che appare con un colpo di scala.
function Timbro({ on, style, children }: { on: boolean; style?: CSSProperties; children: ReactNode }) {
  return (
    <div
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "scale(1) rotate(-4deg)" : "scale(1.7) rotate(-4deg)",
        transition: "all .4s cubic-bezier(.34,1.56,.64,1)",
        border: "2px solid rgba(52,211,153,.75)",
        color: "#6ee7b7",
        borderRadius: 10,
        padding: "5px 12px",
        fontWeight: 800,
        fontSize: 13,
        letterSpacing: ".12em",
        background: "rgba(6,78,59,.35)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── SCENA 1 · L'agenda che si difende da sola ────────────────────────────────
function ScenaAgenda() {
  const T = 14500;
  const t = useOrologio(T);
  useSuoni(t, [
    [250, "avvio"],
    [1900, "pop"], // la notifica della disdetta
    [3400, "pop"], // ORION prende la parola
    [6500, "tick"],
    [6700, "tick"],
    [6900, "tick"], // la lista d'attesa avvisata
    [8300, "ding"], // Sara Neri accetta
    [9600, "ding"], // lo slot torna verde
    [10400, "pop"],
    [12300, "tada"], // TUTTO DA SOLA ✓
  ]);
  const uscita = t > T - 900; // dissolvenza finale per riagganciare il loop

  const righe = [
    { ora: "09:00", chi: "Sig.ra Riva", stato: "ok" },
    { ora: "10:30", chi: "Sig. Ferri", stato: "ok" },
    { ora: "12:00", chi: "Sig.ra Galli", stato: "ok" },
  ];
  const disdetto = t >= 2600;
  const riempito = t >= 9600;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: uscita ? 0 : 1, transition: "opacity .8s" }}>
      {/* Agenda a sinistra */}
      <El on={t >= 300} style={{ position: "absolute", left: 34, top: 26, width: 330, height: 330 }}>
        <Finestra label="AGENDA · OGGI" style={{ width: "100%", height: "100%" }}>
          <div style={{ padding: 14, display: "grid", gap: 9 }}>
            {righe.map((r, i) => (
              <El key={r.ora} on={t >= 600 + i * 180} da="translateX(-14px)">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,.045)",
                    border: "1px solid rgba(255,255,255,.08)",
                  }}
                >
                  <span style={{ color: "#38e8ff", fontWeight: 700, fontSize: 13 }}>{r.ora}</span>
                  <span style={{ color: "#d5edf6", fontSize: 13.5 }}>{r.chi}</span>
                  <span style={{ marginLeft: "auto", color: "#6ee7b7", fontSize: 12 }}>✓</span>
                </div>
              </El>
            ))}
            {/* Lo slot delle 15:00: confermato → disdetto → riempito da ORION */}
            <El on={t >= 1140} da="translateX(-14px)">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  transition: "all .6s cubic-bezier(.16,1,.3,1)",
                  background: riempito ? "rgba(52,211,153,.12)" : disdetto ? "rgba(244,63,94,.1)" : "rgba(255,255,255,.045)",
                  border: `1px solid ${riempito ? "rgba(52,211,153,.45)" : disdetto ? "rgba(244,63,94,.4)" : "rgba(255,255,255,.08)"}`,
                }}
              >
                <span style={{ color: "#38e8ff", fontWeight: 700, fontSize: 13 }}>15:00</span>
                <span
                  style={{
                    color: riempito ? "#d1fae5" : disdetto ? "#fda4af" : "#d5edf6",
                    fontSize: 13.5,
                    textDecoration: disdetto && !riempito ? "line-through" : "none",
                    transition: "all .4s",
                  }}
                >
                  {riempito ? "Sara Neri" : "Sig. Bianchi"}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: riempito ? "#6ee7b7" : disdetto ? "#fb7185" : "#6ee7b7" }}>
                  {riempito ? "CONFERMATO ✓" : disdetto ? "DISDETTO" : "✓"}
                </span>
              </div>
            </El>
            <El on={t >= 1300} da="translateX(-14px)">
              <div style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)" }}>
                <span style={{ color: "#38e8ff", fontWeight: 700, fontSize: 13 }}>16:30</span>
                <span style={{ color: "#d5edf6", fontSize: 13.5 }}>Sig. Verdi</span>
                <span style={{ marginLeft: "auto", color: "#6ee7b7", fontSize: 12 }}>✓</span>
              </div>
            </El>
          </div>
        </Finestra>
      </El>

      {/* Notifica della disdetta */}
      <El on={fra(t, 1900, 5200)} da="translateY(-16px)" style={{ position: "absolute", left: 60, top: 6, zIndex: 3 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 14px", borderRadius: 12, background: "rgba(244,63,94,.14)", border: "1px solid rgba(244,63,94,.4)", color: "#fecdd3", fontSize: 13, boxShadow: "0 10px 30px rgba(0,0,0,.4)" }}>
          📩 <strong>Il sig. Bianchi ha disdetto</strong>&nbsp;l&apos;appuntamento delle 15:00
        </div>
      </El>

      {/* ORION a destra: nucleo + conversazione */}
      <div style={{ position: "absolute", right: 40, top: 30, width: 380 }}>
        <div style={{ display: "grid", placeItems: "center", marginBottom: 10 }}>
          <OrionCore state={fra(t, 3300, 6200) || fra(t, 10300, 13400) ? "speaking" : "idle"} size={72} />
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <Bolla on={t >= 3400}>
            {digita("Bianchi ha disdetto le 15:00. Ci penso io: offro lo slot alla lista d'attesa.", t, 3500)}
          </Bolla>
          {/* Lista d'attesa contattata */}
          <El on={t >= 6400} da="translateY(8px)">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["Sara Neri", "M. Galli", "P. Riva"].map((n, i) => (
                <span
                  key={n}
                  style={{
                    padding: "5px 11px",
                    borderRadius: 99,
                    fontSize: 12.5,
                    transition: "all .5s",
                    border: `1px solid ${i === 0 && t >= 8300 ? "rgba(52,211,153,.6)" : "rgba(56,232,255,.35)"}`,
                    background: i === 0 && t >= 8300 ? "rgba(52,211,153,.15)" : "rgba(56,232,255,.08)",
                    color: i === 0 && t >= 8300 ? "#a7f3d0" : "#bfe9f5",
                    opacity: t >= 6500 + i * 200 ? 1 : 0,
                  }}
                >
                  {i === 0 && t >= 8300 ? "Sara Neri · ha accettato ✓" : `${n} · avvisata ✈`}
                </span>
              ))}
            </div>
          </El>
          <Bolla on={t >= 10400}>
            {digita("Fatto: Sara Neri ha preso il posto. Non hai perso l'ora.", t, 10500)}
          </Bolla>
        </div>
      </div>

      <Timbro on={t >= 12300} style={{ position: "absolute", right: 96, bottom: 34 }}>
        TUTTO DA SOLA ✓
      </Timbro>
    </div>
  );
}

// ── SCENA 2 · Il tuo team, dentro ────────────────────────────────────────────
function ScenaTeam() {
  const T = 14000;
  const t = useOrologio(T);
  useSuoni(t, [
    [250, "avvio"],
    [500, "pop"], // la richiesta del titolare
    [2600, "ding"], // il codice nasce
    [3600, "whoosh"], // le linee raggiungono i pc
    [4200, "tick"],
    [4580, "tick"],
    [4960, "tick"], // i tre computer si accendono
    [6300, "pop"], // permessi per ruolo
    [8600, "whoosh"], // la staffetta parte
    [10800, "ding"], // consegnata a Marco
    [12400, "tada"], // UN'AZIENDA, UN SOLO CERVELLO
  ]);
  const uscita = t > T - 900;

  const pc = [
    { x: 70, y: 300, nome: "Reception", ruolo: "Agenda ✓ · Cassa —" },
    { x: 355, y: 340, nome: "Dott.ssa Landi", ruolo: "Tutto ✓" },
    { x: 640, y: 300, nome: "Magazzino", ruolo: "Ordini ✓ · Clienti —" },
  ];

  return (
    <div style={{ position: "absolute", inset: 0, opacity: uscita ? 0 : 1, transition: "opacity .8s" }}>
      {/* Nucleo in alto al centro */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 24, display: "grid", placeItems: "center" }}>
        <OrionCore state={fra(t, 1800, 3400) ? "thinking" : "idle"} size={78} />
      </div>

      <Bolla mia on={t >= 500} style={{ position: "absolute", right: 60, top: 40 }}>
        {digita("ORION, un codice per il mio team.", t, 600)}
      </Bolla>

      {/* Il codice aziendale che nasce */}
      <El on={t >= 2600} da="scale(.6)" style={{ position: "absolute", left: 0, right: 0, top: 130, display: "grid", placeItems: "center" }}>
        <div
          style={{
            padding: "10px 22px",
            borderRadius: 12,
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: ".22em",
            color: "#9ff2ff",
            background: "rgba(56,232,255,.1)",
            border: "1px solid rgba(56,232,255,.5)",
            boxShadow: "0 0 34px rgba(56,232,255,.3)",
          }}
        >
          VELA-52-KR
        </div>
      </El>

      {/* Linee verso i tre computer */}
      <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} width="880" height="550">
        {pc.map((p, i) => (
          <line
            key={p.nome}
            x1={440}
            y1={185}
            x2={p.x + 85}
            y2={p.y + 10}
            stroke="rgba(56,232,255,.4)"
            strokeWidth="1.6"
            strokeDasharray="6 8"
            className="demo-flusso"
            style={{ opacity: t >= 3600 + i * 380 ? 1 : 0, transition: "opacity .5s" }}
          />
        ))}
        {/* Il messaggio che viaggia da Reception → ORION → Magazzino */}
        <circle
          r="5"
          fill="#38e8ff"
          style={{
            opacity: fra(t, 8600, 10600) ? 1 : 0,
            transition: "opacity .3s, cx 1s linear, cy 1s linear",
            cx: t < 9600 ? 155 : t < 10600 ? 440 : 725,
            cy: t < 9600 ? 305 : t < 10600 ? 185 : 305,
          } as CSSProperties}
        />
      </svg>

      {/* I tre computer del team */}
      {pc.map((p, i) => {
        const acceso = t >= 4200 + i * 380;
        return (
          <El key={p.nome} on={t >= 3400 + i * 300} da="translateY(16px)" style={{ position: "absolute", left: p.x, top: p.y, width: 170 }}>
            <div
              style={{
                borderRadius: 12,
                border: `1px solid ${acceso ? "rgba(56,232,255,.45)" : "rgba(255,255,255,.12)"}`,
                background: acceso ? "rgba(11,26,36,.95)" : "rgba(9,16,23,.9)",
                transition: "all .5s",
                padding: "10px 12px",
                boxShadow: acceso ? "0 0 26px rgba(56,232,255,.12)" : "none",
              }}
            >
              <div style={{ fontSize: 12.5, color: "#dff6fc", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                🖥 {p.nome}
                <span style={{ marginLeft: "auto", color: "#6ee7b7", opacity: acceso ? 1 : 0, transition: "opacity .4s" }}>✓</span>
              </div>
              <div style={{ marginTop: 5, fontSize: 11, color: "#8fb2c2", opacity: t >= 6300 ? 1 : 0, transition: "opacity .5s" }}>{p.ruolo}</div>
            </div>
            <div style={{ height: 8, width: 46, margin: "0 auto", background: "rgba(255,255,255,.08)", borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }} />
          </El>
        );
      })}

      <El on={t >= 6300} da="translateY(6px)" style={{ position: "absolute", left: 0, right: 0, top: 246, textAlign: "center" }}>
        <span style={{ fontSize: 12.5, color: "#7fd7ea", letterSpacing: ".08em" }}>PERMESSI VERI, PER RUOLO</span>
      </El>

      {/* La staffetta: Reception detta, il Magazzino riceve a voce */}
      <Bolla mia on={fra(t, 8200, 12800)} style={{ position: "absolute", left: 30, top: 402, maxWidth: 260 }}>
        🎙 «Di&apos; a Marco che è arrivato il fornitore»
      </Bolla>
      <El on={t >= 10800} da="translateY(10px)" style={{ position: "absolute", left: 590, top: 402 }}>
        <div style={{ padding: "9px 13px", borderRadius: 12, background: "rgba(52,211,153,.12)", border: "1px solid rgba(52,211,153,.45)", color: "#d1fae5", fontSize: 13, maxWidth: 260 }}>
          🔔 ORION riferisce a Marco: <strong>«È arrivato il fornitore»</strong>
        </div>
      </El>

      <Timbro on={t >= 12400} style={{ position: "absolute", left: 0, right: 0, bottom: 22, width: "fit-content", margin: "0 auto" }}>
        UN&apos;AZIENDA, UN SOLO CERVELLO
      </Timbro>
    </div>
  );
}

// ── SCENA 3 · Si aggancia ai tuoi strumenti ──────────────────────────────────
function ScenaStrumenti() {
  const T = 14000;
  const t = useOrologio(T);
  useSuoni(t, [
    [250, "avvio"],
    [500, "pop"], // l'utente racconta i suoi strumenti
    [3100, "pop"], // "mi collego io"
    [4700, "tick"],
    [5020, "tick"],
    [5340, "tick"], // le carte degli strumenti
    [5700, "ding"], // collegato ✓
    [7700, "whoosh"], // l'appuntamento vola nel gestionale
    [9700, "tada"], // FIRMATO ORION ✓
    [10900, "whoosh"], // il ritorno a due vie
    [12500, "pop"],
  ]);
  const uscita = t > T - 900;

  const strumenti = [
    { x: 60, y: 210, icona: "📅", nome: "Google Calendar" },
    { x: 640, y: 210, icona: "🗂", nome: "Il tuo gestionale" },
    { x: 350, y: 400, icona: "📄", nome: "Fatture" },
  ];

  return (
    <div style={{ position: "absolute", inset: 0, opacity: uscita ? 0 : 1, transition: "opacity .8s" }}>
      <Bolla mia on={t >= 400} style={{ position: "absolute", right: 70, top: 26 }}>
        {digita("Io uso Google Calendar e il gestionale dello studio.", t, 500)}
      </Bolla>
      <Bolla on={t >= 3000} style={{ position: "absolute", left: 70, top: 26 }}>
        {digita("Perfetto: mi collego io. Tu non cambi nulla.", t, 3100)}
      </Bolla>

      {/* Nucleo al centro */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 200, display: "grid", placeItems: "center" }}>
        <OrionCore state={fra(t, 3000, 5200) ? "speaking" : "idle"} size={88} />
      </div>

      {/* Linee di collegamento con flusso a due vie */}
      <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} width="880" height="550">
        {strumenti.map((s, i) => (
          <g key={s.nome} style={{ opacity: t >= 4900 + i * 320 ? 1 : 0, transition: "opacity .6s" }}>
            <line x1={440} y1={248} x2={s.x + 90} y2={s.y + 34} stroke="rgba(56,232,255,.45)" strokeWidth="1.8" strokeDasharray="6 8" className="demo-flusso" />
            <line x1={440} y1={256} x2={s.x + 90} y2={s.y + 42} stroke="rgba(52,211,153,.35)" strokeWidth="1.4" strokeDasharray="5 9" className="demo-flusso-inverso" />
          </g>
        ))}
      </svg>

      {/* Le carte degli strumenti */}
      {strumenti.map((s, i) => (
        <El key={s.nome} on={t >= 4700 + i * 320} da="scale(.8)" style={{ position: "absolute", left: s.x, top: s.y, width: 180 }}>
          <div style={{ borderRadius: 13, border: "1px solid rgba(255,255,255,.14)", background: "rgba(11,22,31,.95)", padding: "12px 14px", textAlign: "center", boxShadow: "0 14px 40px rgba(0,0,0,.35)" }}>
            <div style={{ fontSize: 26 }}>{s.icona}</div>
            <div style={{ fontSize: 12.5, color: "#dff6fc", fontWeight: 700, marginTop: 4 }}>{s.nome}</div>
            <div style={{ fontSize: 10.5, color: "#6ee7b7", marginTop: 4, opacity: t >= 5700 + i * 320 ? 1 : 0, transition: "opacity .5s" }}>collegato ✓</div>
          </div>
        </El>
      ))}

      {/* L'appuntamento che ORION scrive NEL gestionale */}
      <div
        style={{
          position: "absolute",
          left: t < 8300 ? 400 : 655,
          top: t < 8300 ? 258 : 300,
          transition: "left 1.2s cubic-bezier(.4,0,.2,1), top 1.2s cubic-bezier(.4,0,.2,1)",
          opacity: fra(t, 7700, 11200) ? 1 : 0,
          zIndex: 4,
        }}
      >
        <div style={{ padding: "7px 11px", borderRadius: 10, background: "rgba(56,232,255,.14)", border: "1px solid rgba(56,232,255,.5)", color: "#e8fbff", fontSize: 12, boxShadow: "0 8px 26px rgba(0,0,0,.45)" }}>
          📌 Ricci · gio 10:00
        </div>
      </div>
      <Timbro on={fra(t, 9700, 12400)} style={{ position: "absolute", left: 648, top: 348 }}>
        FIRMATO ORION ✓
      </Timbro>

      {/* Il ritorno: dal calendario verso ORION (due vie) */}
      <div
        style={{
          position: "absolute",
          left: t < 11400 ? 80 : 396,
          top: t < 11400 ? 300 : 262,
          transition: "left 1.1s cubic-bezier(.4,0,.2,1), top 1.1s cubic-bezier(.4,0,.2,1)",
          opacity: fra(t, 10900, 12600) ? 1 : 0,
        }}
      >
        <div style={{ padding: "7px 11px", borderRadius: 10, background: "rgba(52,211,153,.13)", border: "1px solid rgba(52,211,153,.5)", color: "#d1fae5", fontSize: 12 }}>
          📅 Nuovo evento → ORION
        </div>
      </div>

      <El on={t >= 12500} da="translateY(8px)" style={{ position: "absolute", left: 0, right: 0, bottom: 20, textAlign: "center" }}>
        <span style={{ color: "#bfe9f5", fontSize: 14.5 }}>
          Le tue abitudini restano. <strong style={{ color: "#e8fbff" }}>ORION si adatta.</strong>
        </span>
      </El>
    </div>
  );
}

// ── SCENA 4 · Una fortezza per i tuoi dati ───────────────────────────────────
function ScenaFortezza() {
  const T = 14500;
  const t = useOrologio(T);
  useSuoni(t, [
    [250, "avvio"],
    [2200, "tick"],
    [2450, "tick"],
    [2700, "tick"], // i dati si cifrano riga per riga
    [4200, "whoosh"], // lo scudo si disegna
    [6400, "whoosh"], // il pacco vola fuori sede
    [7900, "ding"], // copia al sicuro ✓
    [9400, "bonk"], // intruso respinto
    [11800, "tada"], // LA RISERVATEZZA È NEL CODICE ✓
  ]);
  const uscita = t > T - 900;
  const cifrato = t >= 2200;

  const dati = [
    { chiaro: "Mario Rossi · 333 812 4477", cifrato: "M••••  R••••  ·  ••• ••• ••77  🔒" },
    { chiaro: "Cartella clinica n. 5512", cifrato: "C••••••• •••••••  n. ••12  🔒" },
    { chiaro: "IBAN IT60 X054 2811 1010", cifrato: "IBAN  IT•• •••• •••• ••10  🔒" },
  ];

  return (
    <div style={{ position: "absolute", inset: 0, opacity: uscita ? 0 : 1, transition: "opacity .8s" }}>
      {/* Lo scudo che si disegna attorno ai dati */}
      <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} width="880" height="550">
        <circle
          cx="330"
          cy="270"
          r="180"
          fill="none"
          stroke={fra(t, 9200, 10200) ? "rgba(56,232,255,.9)" : "rgba(56,232,255,.4)"}
          strokeWidth={fra(t, 9200, 10200) ? 3 : 1.8}
          strokeDasharray="1131"
          strokeDashoffset={t >= 4200 ? 0 : 1131}
          style={{ transition: "stroke-dashoffset 1.6s ease-out, stroke .3s, stroke-width .3s" }}
        />
        {/* La freccia-intruso che rimbalza */}
        <line
          x1={t < 9200 ? -60 : 122}
          y1={t < 9200 ? 180 : 213}
          x2={t < 9200 ? 20 : 42}
          y2={t < 9200 ? 158 : 191}
          stroke="#fb7185"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ opacity: fra(t, 8400, 10400) ? 1 : 0, transition: "all .8s cubic-bezier(.3,0,.2,1)" }}
        />
      </svg>

      {/* Il forziere dei dati */}
      <El on={t >= 300} style={{ position: "absolute", left: 190, top: 170, width: 280 }}>
        <Finestra label="I TUOI DATI" style={{ width: "100%" }}>
          <div style={{ padding: 13, display: "grid", gap: 9 }}>
            {dati.map((d, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 11px",
                  borderRadius: 9,
                  fontSize: 12,
                  fontFamily: "ui-monospace, monospace",
                  transition: "all .7s",
                  transitionDelay: `${i * 0.25}s`,
                  background: cifrato ? "rgba(56,232,255,.07)" : "rgba(255,255,255,.05)",
                  border: `1px solid ${cifrato ? "rgba(56,232,255,.3)" : "rgba(255,255,255,.09)"}`,
                  color: cifrato ? "#9ff2ff" : "#d5edf6",
                }}
              >
                {cifrato ? d.cifrato : d.chiaro}
              </div>
            ))}
          </div>
        </Finestra>
      </El>

      <El on={fra(t, 2400, 4600)} da="translateY(-10px)" style={{ position: "absolute", left: 236, top: 128 }}>
        <span style={{ fontSize: 12.5, color: "#9ff2ff", letterSpacing: ".1em", fontWeight: 700 }}>🔐 CIFRATURA ATTIVA</span>
      </El>
      <El on={t >= 5600} da="translateY(8px)" style={{ position: "absolute", left: 218, top: 452, textAlign: "center" }}>
        <span style={{ fontSize: 12, color: "#7fd7ea", letterSpacing: ".08em" }}>SCUDO: AREE RISERVATE PER RUOLO</span>
      </El>

      {/* Il pacco-backup che vola fuori sede, di notte */}
      <El on={t >= 6200} da="scale(.6)" style={{ position: "absolute", left: 620, top: 60 }}>
        <span style={{ fontSize: 22 }}>🌙</span>
        <span style={{ fontSize: 11.5, color: "#8fb2c2", marginLeft: 6 }}>ore 03:00</span>
      </El>
      <div
        style={{
          position: "absolute",
          left: t < 6800 ? 330 : 660,
          top: t < 6800 ? 260 : 120,
          transition: "left 1.4s cubic-bezier(.4,0,.2,1), top 1.4s cubic-bezier(.4,0,.2,1)",
          opacity: fra(t, 6400, 8600) ? 1 : 0,
          fontSize: 24,
          zIndex: 4,
        }}
      >
        📦<span style={{ fontSize: 13, marginLeft: -8 }}>🔒</span>
      </div>
      <El on={t >= 7900} da="scale(.75)" style={{ position: "absolute", left: 600, top: 150 }}>
        <div style={{ padding: "8px 13px", borderRadius: 12, background: "rgba(56,232,255,.09)", border: "1px solid rgba(56,232,255,.4)", color: "#bfe9f5", fontSize: 12.5 }}>
          ☁️ Copia cifrata <strong>fuori sede</strong> ✓<br />
          <span style={{ fontSize: 11, color: "#7fd7ea" }}>ogni notte, ripristino collaudato</span>
        </div>
      </El>

      {/* L'attacco respinto */}
      <El on={fra(t, 9400, 11400)} da="scale(1.6)" style={{ position: "absolute", left: 96, top: 236 }}>
        <div style={{ padding: "5px 11px", borderRadius: 99, background: "rgba(244,63,94,.15)", border: "1px solid rgba(244,63,94,.55)", color: "#fda4af", fontSize: 12, fontWeight: 800, letterSpacing: ".1em" }}>
          RESPINTO
        </div>
      </El>

      <Timbro on={t >= 11800} style={{ position: "absolute", right: 70, bottom: 40 }}>
        LA RISERVATEZZA È NEL CODICE ✓
      </Timbro>
    </div>
  );
}

// ── SCENA 5 · Tutto il computer, a voce ──────────────────────────────────────
function ScenaVoce() {
  const T = 15000;
  const t = useOrologio(T);
  useSuoni(t, [
    [250, "avvio"],
    [800, "pop"], // «stampami l'agenda di domani»
    [2600, "pop"], // «subito, la mando in stampa»
    [3400, "tick"], // la stampante appare
    [4300, "whoosh"], // il foglio esce
    [5200, "ding"], // STAMPA VERA ✓
    [5600, "pop"], // «apri il gestionale»
    [6800, "pop"],
    [7300, "whoosh"], // la finestra si apre
    [9000, "tick"], // la mano compare
    [10600, "whoosh"], // il gesto trascina la finestra
    [12800, "pop"],
  ]);
  const uscita = t > T - 900;
  const manoAfferra = fra(t, 9800, 12400);
  const finestraSpostata = t >= 10600;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: uscita ? 0 : 1, transition: "opacity .8s" }}>
      {/* Il desktop */}
      <El on={t >= 200} style={{ position: "absolute", left: 60, top: 40, width: 560, height: 400 }}>
        <Finestra label="IL TUO COMPUTER" style={{ width: "100%", height: "100%" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, rgba(14,26,38,.9), rgba(8,14,20,.95))" }}>
            {/* La stampa vera */}
            <El on={fra(t, 3400, 8300)} da="scale(.7)" style={{ position: "absolute", left: 40, top: 56 }}>
              <div style={{ fontSize: 40, textAlign: "center" }}>🖨</div>
              <div
                style={{
                  width: 86,
                  margin: "0 auto",
                  borderRadius: 4,
                  background: "#eef6f9",
                  color: "#123",
                  fontSize: 7.5,
                  lineHeight: 1.7,
                  padding: "5px 7px",
                  height: t >= 4300 ? 84 : 0,
                  overflow: "hidden",
                  transition: "height 1.6s ease-out",
                  boxShadow: "0 8px 20px rgba(0,0,0,.4)",
                }}
              >
                <strong>AGENDA · DOMANI</strong>
                <br />
                09:00 — Sig.ra Riva
                <br />
                10:30 — Sig. Ferri
                <br />
                12:00 — Sig.ra Galli
                <br />
                15:00 — Sara Neri
              </div>
            </El>
            <El on={fra(t, 5200, 8300)} da="translateY(6px)" style={{ position: "absolute", left: 30, top: 210 }}>
              <span style={{ fontSize: 11, color: "#6ee7b7", fontWeight: 700, letterSpacing: ".08em" }}>STAMPA VERA ✓</span>
            </El>

            {/* Il gestionale che si apre a voce e poi si sposta con la mano */}
            <div
              style={{
                position: "absolute",
                left: finestraSpostata ? 300 : 180,
                top: finestraSpostata ? 170 : 90,
                width: 230,
                transition: "left 1.5s cubic-bezier(.4,0,.2,1), top 1.5s cubic-bezier(.4,0,.2,1)",
                opacity: t >= 7300 ? 1 : 0,
                transform: t >= 7300 ? "scale(1)" : "scale(.75)",
                transitionProperty: "left, top, opacity, transform",
                transitionDuration: "1.5s, 1.5s, .5s, .5s",
                zIndex: 3,
              }}
            >
              <div style={{ borderRadius: 10, border: `1px solid ${manoAfferra ? "rgba(56,232,255,.7)" : "rgba(255,255,255,.16)"}`, background: "rgba(13,24,34,.98)", boxShadow: manoAfferra ? "0 0 30px rgba(56,232,255,.25)" : "0 16px 44px rgba(0,0,0,.5)", overflow: "hidden", transition: "all .4s" }}>
                <div style={{ padding: "6px 10px", fontSize: 10.5, color: "#7fa5b5", borderBottom: "1px solid rgba(255,255,255,.07)", fontWeight: 700, letterSpacing: ".1em" }}>
                  🗂 GESTIONALE
                </div>
                <div style={{ padding: 9, display: "grid", gap: 5 }}>
                  {[86, 64, 74].map((w, i) => (
                    <div key={i} style={{ height: 7, width: `${w}%`, borderRadius: 4, background: "rgba(120,170,195,.25)" }} />
                  ))}
                </div>
              </div>
            </div>

            {/* La mano che comanda coi gesti */}
            <div
              style={{
                position: "absolute",
                left: finestraSpostata ? 390 : 250,
                top: finestraSpostata ? 240 : 150,
                transition: "left 1.5s cubic-bezier(.4,0,.2,1), top 1.5s cubic-bezier(.4,0,.2,1)",
                opacity: fra(t, 9000, 12800) ? 1 : 0,
                fontSize: 34,
                zIndex: 5,
                transform: manoAfferra ? "scale(.85) rotate(-8deg)" : "scale(1)",
                filter: "drop-shadow(0 0 12px rgba(56,232,255,.6))",
              }}
            >
              {manoAfferra ? "🤏" : "✋"}
            </div>
          </div>
        </Finestra>
      </El>

      {/* La colonna della voce, a destra */}
      <div style={{ position: "absolute", right: 26, top: 50, width: 230 }}>
        <div style={{ display: "grid", placeItems: "center", marginBottom: 8 }}>
          <OrionCore state={fra(t, 2400, 4200) || fra(t, 6600, 8200) ? "speaking" : fra(t, 600, 2400) || fra(t, 5400, 6600) ? "listening" : "idle"} size={64} />
        </div>
        {/* Le barre della voce */}
        <div style={{ display: "flex", gap: 3, justifyContent: "center", height: 20, alignItems: "center", opacity: fra(t, 600, 2400) || fra(t, 5400, 6600) ? 1 : 0.15, transition: "opacity .4s" }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span key={i} className="demo-onda-voce" style={{ width: 3.5, borderRadius: 3, background: "#38e8ff", animationDelay: `${i * 0.09}s` }} />
          ))}
        </div>
        <div style={{ display: "grid", gap: 9, marginTop: 8 }}>
          <Bolla mia on={t >= 800} style={{ maxWidth: 230 }}>
            🎙 «{digita("Stampami l'agenda di domani", t, 900, 24)}»
          </Bolla>
          <Bolla on={t >= 2600} style={{ maxWidth: 230 }}>
            {digita("Subito. La mando in stampa.", t, 2700)}
          </Bolla>
          <Bolla mia on={t >= 5600} style={{ maxWidth: 230 }}>
            🎙 «{digita("Apri il gestionale", t, 5700, 24)}»
          </Bolla>
          <Bolla on={t >= 6800} style={{ maxWidth: 230 }}>
            {digita("Aperto. Eccolo.", t, 6900)}
          </Bolla>
        </div>
      </div>

      <El on={t >= 12800} da="translateY(8px)" style={{ position: "absolute", left: 0, right: 0, bottom: 18, textAlign: "center" }}>
        <span style={{ color: "#bfe9f5", fontSize: 14.5 }}>
          Parla. O <strong style={{ color: "#e8fbff" }}>muovi le mani</strong>: obbedisce anche ai gesti.
        </span>
      </El>
    </div>
  );
}

// ── SCENA 6 · Il tuo ORION, su misura ────────────────────────────────────────
function ScenaMisura() {
  const T = 13000;
  const t = useOrologio(T);
  useSuoni(t, [
    [250, "avvio"],
    [400, "pop"], // «mettimi rosso Ferrari»
    [2600, "whoosh"],
    [2700, "ding"], // l'onda rossa
    [5200, "whoosh"], // verde bosco
    [5500, "pop"],
    [7400, "whoosh"], // viola notte
    [9600, "whoosh"], // oro studio
    [11600, "whoosh"], // ritorno al blu → loop perfetto
  ]);
  const uscita = t > T - 900;

  // I temi si susseguono con un'onda di colore; si chiude tornando al blu → loop perfetto.
  const TEMI = [
    { da: 0, nome: "ORION blu", acc: "#38e8ff", alone: "rgba(56,232,255" },
    { da: 2600, nome: "Rosso Ferrari", acc: "#ff4b55", alone: "rgba(255,75,85" },
    { da: 5200, nome: "Verde bosco", acc: "#3ddc97", alone: "rgba(61,220,151" },
    { da: 7400, nome: "Viola notte", acc: "#a78bfa", alone: "rgba(167,139,250" },
    { da: 9600, nome: "Oro studio", acc: "#f5c66b", alone: "rgba(245,198,107" },
    { da: 11600, nome: "ORION blu", acc: "#38e8ff", alone: "rgba(56,232,255" },
  ];
  const tema = [...TEMI].reverse().find((x) => t >= x.da) ?? TEMI[0];

  return (
    <div style={{ position: "absolute", inset: 0, opacity: uscita ? 0 : 1, transition: "opacity .8s" }}>
      <Bolla mia on={fra(t, 300, 4800)} style={{ position: "absolute", right: 70, top: 20, zIndex: 6 }}>
        🎙 «{digita("Mettimi rosso Ferrari", t, 400, 24)}»
      </Bolla>

      {/* La mini-app che si trasforma */}
      <El on={t >= 200} style={{ position: "absolute", left: 120, top: 70, width: 640, height: 380 }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: 18,
            overflow: "hidden",
            border: `1px solid ${tema.alone},.4)`,
            background: "rgba(8,14,20,.96)",
            boxShadow: `0 0 60px ${tema.alone},.14)`,
            transition: "all 1s",
          }}
        >
          {/* L'onda di colore a ogni cambio tema */}
          <div
            key={tema.nome + tema.da}
            className="demo-onda-tema"
            style={{ position: "absolute", left: "50%", top: "50%", width: 300, height: 300, marginLeft: -150, marginTop: -150, borderRadius: "50%", background: `radial-gradient(circle, ${tema.alone},.4) 0%, transparent 70%)`, pointerEvents: "none", zIndex: 5 }}
          />

          {/* Barra alta */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: tema.acc, boxShadow: `0 0 12px ${tema.alone},.8)`, transition: "all 1s" }} />
            <span style={{ letterSpacing: ".3em", fontWeight: 700, fontSize: 12.5, color: "#e8fbff" }}>ORION</span>
            <span style={{ marginLeft: "auto", fontSize: 11.5, padding: "4px 11px", borderRadius: 99, border: `1px solid ${tema.alone},.5)`, color: tema.acc, transition: "all 1s", fontWeight: 700 }}>
              {tema.nome}
            </span>
          </div>

          {/* Il nucleo ricolorato */}
          <div style={{ display: "grid", placeItems: "center", padding: "22px 0 10px" }}>
            <div style={{ position: "relative", width: 86, height: 86 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${tema.alone},.5)`, transition: "all 1s" }} />
              <div style={{ position: "absolute", inset: "14%", borderRadius: "50%", border: `1.6px solid ${tema.alone},.35)`, transition: "all 1s" }} className="demo-gira" />
              <div style={{ position: "absolute", inset: "31%", borderRadius: "50%", background: `radial-gradient(circle, ${tema.alone},.95) 0%, ${tema.alone},.25) 70%)`, boxShadow: `0 0 34px ${tema.alone},.7)`, transition: "all 1s" }} className="demo-batte" />
            </div>
          </div>

          {/* Due pannelli che si ricolorano */}
          <div style={{ display: "flex", gap: 14, padding: "12px 26px" }}>
            {[
              ["Agenda di oggi", ["09:00 · Riva", "10:30 · Ferri", "15:00 · Neri"]],
              ["Promemoria", ["Richiamare Galli", "Ordine lenti", "Fattura n. 214"]],
            ].map(([titolo, righe]) => (
              <div key={titolo as string} style={{ flex: 1, borderRadius: 12, border: `1px solid ${tema.alone},.28)`, background: `${tema.alone},.05)`, padding: "11px 13px", transition: "all 1s" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: tema.acc, transition: "color 1s", letterSpacing: ".06em" }}>{titolo as string}</div>
                <div style={{ marginTop: 7, display: "grid", gap: 5 }}>
                  {(righe as string[]).map((r) => (
                    <div key={r} style={{ fontSize: 11.5, color: "#c6dfe9", padding: "5px 8px", borderRadius: 7, background: "rgba(255,255,255,.04)" }}>
                      {r}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, padding: "4px 26px" }}>
            <span style={{ padding: "7px 16px", borderRadius: 10, background: tema.acc, color: "#0b1117", fontSize: 12, fontWeight: 800, transition: "all 1s" }}>Parla con ORION</span>
            <span style={{ padding: "7px 16px", borderRadius: 10, border: `1px solid ${tema.alone},.45)`, color: tema.acc, fontSize: 12, fontWeight: 700, transition: "all 1s" }}>Briefing</span>
          </div>
        </div>
      </El>

      <El on={t >= 5400} da="translateY(8px)" style={{ position: "absolute", left: 0, right: 0, bottom: 26, textAlign: "center" }}>
        <span style={{ color: "#bfe9f5", fontSize: 14.5 }}>
          Colori, briefing, modi di fare: <strong style={{ color: "#e8fbff" }}>ogni professionista ha il suo ORION.</strong>
        </span>
      </El>
    </div>
  );
}

// ── SCENA 1-bis · Risponde ai clienti al posto tuo ───────────────────────────
function ScenaSegreteria() {
  const T = 14500;
  const t = useOrologio(T);
  useSuoni(t, [
    [250, "avvio"],
    [1000, "pop"], // il cliente scrive
    [4200, "pop"], // ORION risponde
    [5600, "tick"], // lo slot si libera (rosso)
    [6600, "whoosh"], // offerta alla lista d'attesa
    [8600, "pop"], // Sara accetta
    [10100, "ding"], // slot riempito
    [11000, "ding"], // push al professionista
    [12300, "tada"], // timbro finale
  ]);
  const uscita = t > T - 900;
  const disdetto = t >= 5600;
  const riempito = t >= 10000;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: uscita ? 0 : 1, transition: "opacity .8s" }}>
      {/* È notte: luna e didascalia */}
      <El on={t >= 250} da="translateY(-8px)" style={{ position: "absolute", left: 0, right: 0, top: 14, textAlign: "center" }}>
        <span style={{ fontSize: 15, color: "#8fb2c4", letterSpacing: ".08em" }}>
          🌙 ore 21:34 — <strong style={{ color: "#dff6fc" }}>il computer dello studio è spento</strong>
        </span>
      </El>

      {/* Il telefono del cliente (WhatsApp) */}
      <El on={t >= 500} da="translateX(-40px)" style={{ position: "absolute", left: 60, top: 62, width: 330 }}>
        <Finestra label="WHATSAPP · STUDIO DOTT. LANDI" style={{ width: "100%", minHeight: 300 }}>
          <div style={{ padding: 14, display: "grid", gap: 10 }}>
            <Bolla mia on={t >= 1000} style={{ maxWidth: 250, fontSize: 13.5 }}>
              {digita("Buonasera, purtroppo devo disdire l'appuntamento di domani 😔", t, 1100)}
            </Bolla>
            <Bolla on={t >= 4200} style={{ maxWidth: 260, fontSize: 13.5 }}>
              {digita("Nessun problema, ci penso io: libero l'orario e la ricontatto per riprogrammare. Buona serata!", t, 4300)}
            </Bolla>
            <Bolla on={t >= 8600} style={{ maxWidth: 250, fontSize: 13.5, borderColor: "rgba(52,211,153,.5)" }}>
              <span style={{ fontSize: 11, color: "#6ee7b7", display: "block", marginBottom: 2 }}>Sara Neri (lista d&apos;attesa)</span>
              {digita("Sì! Lo prendo io, grazie! 🙌", t, 8700)}
            </Bolla>
          </div>
        </Finestra>
      </El>

      {/* Il nucleo che lavora, al centro */}
      <div style={{ position: "absolute", left: 430, top: 120, opacity: t >= 800 ? 1 : 0, transition: "opacity .6s" }}>
        <OrionCore state={fra(t, 3400, 5200) || fra(t, 6400, 8200) ? "thinking" : "idle"} size={74} />
      </div>
      <El on={fra(t, 6600, 10000)} da="translateY(8px)" style={{ position: "absolute", left: 396, top: 210 }}>
        <span style={{ fontSize: 12, color: "#7fd7ea", letterSpacing: ".08em", fontWeight: 700 }}>OFFRO L&apos;ORA ALLA LISTA D&apos;ATTESA…</span>
      </El>

      {/* L'agenda che si sistema da sola */}
      <El on={t >= 500} da="translateX(40px)" style={{ position: "absolute", right: 52, top: 62, width: 300 }}>
        <Finestra label="AGENDA · DOMANI" style={{ width: "100%" }}>
          <div style={{ padding: 12, display: "grid", gap: 8 }}>
            {[
              { ora: "09:00", chi: "Sig.ra Riva" },
              { ora: "11:30", chi: "Sig. Ferri" },
            ].map((r) => (
              <div key={r.ora} style={{ display: "flex", gap: 10, padding: "9px 11px", borderRadius: 10, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)", fontSize: 13.5 }}>
                <span style={{ color: "#38e8ff", fontWeight: 700 }}>{r.ora}</span>
                <span style={{ color: "#d5edf6" }}>{r.chi}</span>
                <span style={{ marginLeft: "auto", color: "#6ee7b7", fontSize: 11.5 }}>✓</span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                gap: 10,
                padding: "9px 11px",
                borderRadius: 10,
                fontSize: 13.5,
                transition: "all .6s",
                background: riempito ? "rgba(52,211,153,.13)" : disdetto ? "rgba(244,63,94,.11)" : "rgba(255,255,255,.045)",
                border: `1.5px solid ${riempito ? "rgba(52,211,153,.55)" : disdetto ? "rgba(244,63,94,.5)" : "rgba(255,255,255,.08)"}`,
              }}
            >
              <span style={{ color: "#38e8ff", fontWeight: 700 }}>10:00</span>
              <span style={{ color: riempito ? "#d1fae5" : disdetto ? "#fda4af" : "#d5edf6", textDecoration: disdetto && !riempito ? "line-through" : "none", transition: "all .4s" }}>
                {riempito ? "Sara Neri" : "Sig. Conti"}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: riempito ? "#6ee7b7" : disdetto ? "#fb7185" : "#6ee7b7" }}>
                {riempito ? "CONFERMATO ✓" : disdetto ? "DISDETTO" : "✓"}
              </span>
            </div>
          </div>
        </Finestra>
      </El>

      {/* La push sul telefono del professionista, a cose fatte */}
      <El on={t >= 11000} da="translateY(16px)" style={{ position: "absolute", right: 52, top: 300, width: 330 }}>
        <div style={{ borderRadius: 14, border: "1px solid rgba(56,232,255,.4)", background: "rgba(10,20,28,.97)", padding: "12px 14px", boxShadow: "0 16px 50px rgba(0,0,0,.5)" }}>
          <div style={{ fontSize: 11, color: "#7fd7ea", letterSpacing: ".1em", fontWeight: 800 }}>📲 SUL TUO TELEFONO</div>
          <div style={{ fontSize: 13.5, color: "#dff6fc", marginTop: 5, lineHeight: 1.5 }}>
            <strong>ORION</strong> · Disdetta gestita: Conti ha disdetto le 10:00, Sara Neri ha preso il posto. Buona cena! 🍝
          </div>
        </div>
      </El>

      <Timbro on={t >= 12300} style={{ position: "absolute", left: 400, bottom: 40 }}>
        TU NON HAI MOSSO UN DITO ✓
      </Timbro>
    </div>
  );
}

// ── SCENA · La posta che si annuncia da sola (email filtrate + annuncio) ─────
function ScenaPosta() {
  const T = 15000;
  const t = useOrologio(T);
  useSuoni(t, [
    [250, "avvio"],
    [800, "pop"], // arriva la newsletter
    [2000, "bonk"], // silenziata
    [2600, "pop"], // arriva lo spam
    [3800, "bonk"], // silenziato
    [4400, "pop"], // arriva la mail vera
    [5400, "ding"], // IMPORTANTE
    [6300, "pop"], // ORION annuncia
    [8300, "pop"], // «sì, aprila»
    [9100, "whoosh"], // la mail si apre
    [11900, "pop"], // la risposta dettata
    [13000, "ding"], // inviata
    [13600, "tada"], // timbro
  ]);
  const uscita = t > T - 900;
  const m1Silenziata = t >= 2000;
  const m2Silenziato = t >= 3800;
  const m3Importante = t >= 5400;

  const rigaMail = (
    on: boolean,
    da: string,
    oggetto: string,
    stato: "attesa" | "silenziata" | "importante"
  ) => (
    <div
      style={{
        display: on ? "block" : "none",
        padding: "9px 11px",
        borderRadius: 10,
        transition: "all .5s",
        opacity: stato === "silenziata" ? 0.45 : 1,
        background: stato === "importante" ? "rgba(56,232,255,.12)" : "rgba(255,255,255,.045)",
        border: `1.5px solid ${stato === "importante" ? "rgba(56,232,255,.6)" : "rgba(255,255,255,.08)"}`,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
        <span style={{ color: stato === "importante" ? "#7ff0ff" : "#8fb2c4", fontWeight: 700 }}>{da}</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: ".06em",
            color: stato === "importante" ? "#38e8ff" : stato === "silenziata" ? "#64748b" : "#7fa5b5",
          }}
        >
          {stato === "importante" ? "IMPORTANTE ⚡" : stato === "silenziata" ? "SILENZIATA 🔕" : ""}
        </span>
      </div>
      <div style={{ fontSize: 13.5, color: stato === "silenziata" ? "#7c8ea0" : "#e6f4fa", textDecoration: stato === "silenziata" ? "line-through" : "none", transition: "all .4s" }}>
        {oggetto}
      </div>
    </div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, opacity: uscita ? 0 : 1, transition: "opacity .8s" }}>
      <El on={t >= 250} da="translateY(-8px)" style={{ position: "absolute", left: 0, right: 0, top: 14, textAlign: "center" }}>
        <span style={{ fontSize: 15, color: "#8fb2c4", letterSpacing: ".08em" }}>
          📬 la tua posta, <strong style={{ color: "#dff6fc" }}>filtrata e annunciata da ORION</strong>
        </span>
      </El>

      {/* La casella: ORION separa il rumore da ciò che conta */}
      <El on={t >= 500} da="translateX(-40px)" style={{ position: "absolute", left: 56, top: 62, width: 330 }}>
        <Finestra label="EMAIL · IN ARRIVO" style={{ width: "100%", minHeight: 240 }}>
          <div style={{ padding: 12, display: "grid", gap: 8 }}>
            {rigaMail(t >= 800, "newsletter@offerte.it", "SOLO OGGI −50% SU TUTTO!!!", m1Silenziata ? "silenziata" : "attesa")}
            {rigaMail(t >= 2600, "premi@lotteria.win", "Hai vinto un iPhone 🎁", m2Silenziato ? "silenziata" : "attesa")}
            {rigaMail(t >= 4400, "Avv. Marchi", "Preventivo urgente — pratica Rossi", m3Importante ? "importante" : "attesa")}
          </div>
        </Finestra>
      </El>

      {/* Il nucleo annuncia SOLO ciò che conta */}
      <div style={{ position: "absolute", left: 430, top: 96, opacity: t >= 800 ? 1 : 0, transition: "opacity .6s" }}>
        <OrionCore state={fra(t, 4400, 6200) ? "thinking" : fra(t, 6300, 8200) ? "speaking" : "idle"} size={74} />
      </div>
      <El on={t >= 6300} da="translateY(10px)" style={{ position: "absolute", left: 350, top: 196, width: 240 }}>
        <Bolla on style={{ fontSize: 13, textAlign: "center" }}>
          «È arrivata una mail importante dall&apos;avvocato Marchi. Vuoi aprirla?»
        </Bolla>
      </El>
      <El on={t >= 8300} da="translateY(10px)" style={{ position: "absolute", left: 404, top: 288, width: 130 }}>
        <Bolla mia on style={{ fontSize: 13, textAlign: "center" }}>
          «Sì, aprila»
        </Bolla>
      </El>

      {/* La mail aperta + la risposta con le parole del titolare */}
      <El on={t >= 9100} da="translateX(40px)" style={{ position: "absolute", right: 48, top: 62, width: 320 }}>
        <Finestra label="✉️ AVV. MARCHI · Re: automatico" style={{ width: "100%" }}>
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#f2fbff" }}>Preventivo urgente — pratica Rossi</div>
            <div style={{ fontSize: 12.5, color: "#c9dee8", marginTop: 6, lineHeight: 1.5 }}>
              {digita("Gentile dottore, mi conferma il preventivo entro venerdì? Cordiali saluti.", t, 9300)}
            </div>
            <div style={{ marginTop: 10, display: t >= 11900 ? "block" : "none" }}>
              <div style={{ fontSize: 10.5, color: "#7fd7ea", letterSpacing: ".1em", fontWeight: 800 }}>🎙 LA TUA RISPOSTA, DETTATA</div>
              <div style={{ fontSize: 12.5, color: "#dff6fc", marginTop: 4 }}>{digita("«Confermato: lo invio venerdì mattina.»", t, 12000)}</div>
            </div>
            <div style={{ marginTop: 8, display: t >= 13000 ? "inline-block" : "none", padding: "5px 10px", borderRadius: 999, border: "1.5px solid rgba(52,211,153,.55)", background: "rgba(52,211,153,.13)", fontSize: 11, fontWeight: 800, color: "#6ee7b7" }}>
              INVIATA · Re: Preventivo urgente ✓
            </div>
          </div>
        </Finestra>
      </El>

      {/* Il digest del silenzio: il regalo nascosto */}
      <El on={t >= 13000} da="translateY(12px)" style={{ position: "absolute", left: 56, top: 330, width: 330 }}>
        <div style={{ borderRadius: 14, border: "1px solid rgba(56,232,255,.35)", background: "rgba(10,20,28,.96)", padding: "10px 14px", fontSize: 12.5, color: "#bfe9f5" }}>
          Oggi ORION ti ha tolto di torno <strong style={{ color: "#f2fbff" }}>12 mail inutili</strong>. Tu hai letto solo quella che conta.
        </div>
      </El>

      <Timbro on={t >= 13600} style={{ position: "absolute", left: 400, bottom: 36 }}>
        SOLO CIÒ CHE CONTA ✓
      </Timbro>
    </div>
  );
}

// ── SCENA · La Mano: ORION usa i programmi del professionista ────────────────
function ScenaMano() {
  const T = 14500;
  const t = useOrologio(T);
  useSuoni(t, [
    [250, "avvio"],
    [400, "pop"], // il comando a voce
    [2700, "pop"], // "faccio io: guardami"
    [4300, "whoosh"], // si apre il gestionale
    [4700, "tick"], // il mini-nucleo si presenta
    [6100, "tick"], // clic sul campo esercizio
    [9200, "ding"], // esercizio sostituito
    [9600, "tick"], // clic sui chili
    [10600, "ding"], // 20 kg
    [11500, "tick"], // salva
    [11900, "ding"],
    [12400, "tada"], // fatto e verificato
  ]);
  const uscita = t > T - 900;

  // Il passo che il mini-nucleo sta raccontando.
  const passo =
    t < 6000 ? "apro la scheda di Mario" : t < 9500 ? "sostituisco l'esercizio" : t < 11400 ? "metto 20 kg" : "verifico e salvo";
  // Il cursore della Mano: si muove da solo sui campi.
  const cursore = t < 6000 ? { x: 640, y: 205 } : t < 9500 ? { x: 620, y: 258 } : t < 11400 ? { x: 585, y: 318 } : { x: 700, y: 388 };
  const esercizioNuovo = t >= 8800;
  const chiliNuovi = t >= 10400;
  const salvato = t >= 11900;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: uscita ? 0 : 1, transition: "opacity .8s" }}>
      <Bolla mia on={fra(t, 400, 4200)} style={{ position: "absolute", right: 50, top: 22 }}>
        🎙 «{digita("Cambia l'esercizio a Mario Rossi: spinte su panca inclinata, 20 kg", t, 500, 30)}»
      </Bolla>
      <Bolla on={fra(t, 2700, 4600)} style={{ position: "absolute", left: 60, top: 22 }}>
        {digita("Apro il tuo programma e faccio io: guardami.", t, 2800)}
      </Bolla>

      {/* Il MINI-NUCLEO in alto a sinistra che racconta i passi */}
      <El on={t >= 4700} da="scale(.6)" style={{ position: "absolute", left: 46, top: 120 }}>
        <div style={{ display: "grid", placeItems: "center", gap: 8 }}>
          <OrionCore state="thinking" size={72} />
          <div key={passo} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 99, border: "1px solid rgba(56,232,255,.45)", background: "rgba(8,16,22,.92)", fontSize: 12, color: "#c9ecf7", fontWeight: 700, animation: "demo-battito 1.4s ease-in-out infinite" }}>
            🖱 {passo}
          </div>
        </div>
      </El>

      {/* Il gestionale del professionista (qualsiasi: qui, le schede del PT) */}
      <El on={t >= 4300} da="translateX(50px)" style={{ position: "absolute", left: 330, top: 120, width: 480 }}>
        <Finestra label="IL TUO GESTIONALE · SCHEDA DI MARIO ROSSI" style={{ width: "100%" }}>
          <div style={{ padding: 16, display: "grid", gap: 10 }}>
            {[
              ["Cliente", "Mario Rossi", false, false],
              ["Esercizio", esercizioNuovo ? "Spinte panca inclinata" : "Panca piana", t >= 6000 && t < 9500, esercizioNuovo],
              ["Carico", chiliNuovi ? "20 kg" : "15 kg", t >= 9500 && t < 11400, chiliNuovi],
              ["Serie", "3 × 10", false, false],
            ].map(([campo, valore, attivo, cambiato]) => (
              <div key={campo as string} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 13px", borderRadius: 10, fontSize: 16, transition: "all .5s", background: attivo ? "rgba(56,232,255,.1)" : "rgba(255,255,255,.045)", border: `1.5px solid ${attivo ? "rgba(56,232,255,.65)" : cambiato ? "rgba(52,211,153,.5)" : "rgba(255,255,255,.09)"}` }}>
                <span style={{ color: "#7fa5b5", width: 90, fontSize: 13 }}>{campo as string}</span>
                <span style={{ color: cambiato ? "#a7f3d0" : "#e6f4fa", fontWeight: 600, transition: "color .4s" }}>{valore as string}</span>
                {cambiato ? <span style={{ marginLeft: "auto", color: "#6ee7b7", fontSize: 13, fontWeight: 800 }}>✓</span> : null}
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
              <span style={{ padding: "8px 20px", borderRadius: 10, fontSize: 14, fontWeight: 800, transition: "all .4s", background: salvato ? "rgba(52,211,153,.2)" : t >= 11400 ? "rgba(56,232,255,.2)" : "rgba(255,255,255,.07)", border: `1.5px solid ${salvato ? "rgba(52,211,153,.6)" : "rgba(255,255,255,.14)"}`, color: salvato ? "#a7f3d0" : "#dff6fc" }}>
                {salvato ? "SALVATO ✓" : "Salva"}
              </span>
            </div>
          </div>
        </Finestra>
      </El>

      {/* Il cursore della Mano: si muove e clicca da solo */}
      <div
        style={{
          position: "absolute",
          left: cursore.x,
          top: cursore.y,
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "2.5px solid rgba(56,232,255,.95)",
          background: "rgba(56,232,255,.2)",
          boxShadow: "0 0 18px rgba(56,232,255,.8)",
          transition: "left .9s cubic-bezier(.4,0,.2,1), top .9s cubic-bezier(.4,0,.2,1)",
          opacity: fra(t, 5200, 12600) ? 1 : 0,
          zIndex: 9,
          pointerEvents: "none",
        }}
      />

      <Timbro on={t >= 12400} style={{ position: "absolute", left: 330, bottom: 40 }}>
        FATTO — E VERIFICATO ✓
      </Timbro>
      <El on={t >= 12800} da="translateY(8px)" style={{ position: "absolute", left: 0, right: 0, bottom: 14, textAlign: "center" }}>
        <span style={{ color: "#bfe9f5", fontSize: 14 }}>
          Qualsiasi professione, qualsiasi programma. <strong style={{ color: "#e8fbff" }}>Tu lo dici, lui lo fa.</strong>
        </span>
      </El>
    </div>
  );
}

const SCENE: Record<DemoId, () => ReactNode> = {
  agenda: () => <ScenaAgenda />,
  segreteria: () => <ScenaSegreteria />,
  posta: () => <ScenaPosta />,
  mano: () => <ScenaMano />,
  team: () => <ScenaTeam />,
  strumenti: () => <ScenaStrumenti />,
  fortezza: () => <ScenaFortezza />,
  voce: () => <ScenaVoce />,
  misura: () => <ScenaMisura />,
};

// ── Il proiettore: modale a schermo pieno, si chiude con ✕ / fuori / Esc ─────
export function DemoFunzioni({ id, onClose }: { id: DemoId; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scala, setScala] = useState(1);
  const [audioOn, setAudioOn] = useState(true);

  // Ricorda la scelta audio dell'utente (di default: suoni accesi).
  useEffect(() => {
    try {
      if (localStorage.getItem("orion-demo-suoni") === "no") {
        impostaSuoni(false);
        setAudioOn(false);
      } else {
        impostaSuoni(true);
      }
    } catch {
      /* noop */
    }
  }, []);

  // La scena è disegnata su un palco fisso 880×550 e scalata al contenitore.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const misura = () => setScala(el.clientWidth / 880);
    misura();
    const ro = new ResizeObserver(misura);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", suTasto);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", suTasto);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Portal sul body: le sezioni della vetrina hanno trasformazioni (tilt,
  // animazioni di comparsa) che catturerebbero il position:fixed — da qui la
  // modale vive sopra TUTTA la pagina, sempre, ovunque venga usata.
  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-label={TITOLI[id]}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: "rgba(2,6,10,.78)",
        backdropFilter: "blur(10px)",
        animation: "demo-apparsa .35s ease-out",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(940px, 96vw)" }}>
        {/* Intestazione del proiettore */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "0 4px" }}>
          <span className="demo-batte" style={{ width: 9, height: 9, borderRadius: 99, background: "#38e8ff", boxShadow: "0 0 12px rgba(56,232,255,.9)" }} />
          <span style={{ color: "#e8fbff", fontWeight: 700, fontSize: "clamp(14px,2.4vw,17px)" }}>{TITOLI[id]}</span>
          <span style={{ color: "#5e8798", fontSize: 12, marginLeft: 4 }}>· ORION al lavoro, in loop</span>
          <button
            onClick={() => {
              const nuovo = !audioOn;
              setAudioOn(nuovo);
              impostaSuoni(nuovo);
              if (nuovo) suona("pop"); // conferma immediata che l'audio è vivo
            }}
            aria-label={audioOn ? "Silenzia i suoni" : "Attiva i suoni"}
            title={audioOn ? "Suoni attivi" : "Suoni spenti"}
            style={{
              marginLeft: "auto",
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.16)",
              background: audioOn ? "rgba(56,232,255,.12)" : "rgba(255,255,255,.06)",
              color: "#dff6fc",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            {audioOn ? "🔊" : "🔇"}
          </button>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            style={{
              marginLeft: "auto",
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.16)",
              background: "rgba(255,255,255,.06)",
              color: "#dff6fc",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Il palco */}
        <div
          ref={boxRef}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "880 / 550",
            borderRadius: 20,
            overflow: "hidden",
            border: "1px solid rgba(56,232,255,.22)",
            background: "radial-gradient(1200px 600px at 50% -10%, rgba(23,50,68,.55), rgba(5,10,15,.98))",
            boxShadow: "0 40px 120px rgba(0,0,0,.6), 0 0 80px rgba(56,232,255,.06)",
          }}
        >
          <div style={{ position: "absolute", left: 0, top: 0, width: 880, height: 550, transform: `scale(${scala})`, transformOrigin: "top left" }}>
            {SCENE[id]()}
          </div>
        </div>
        <p style={{ textAlign: "center", color: "#5e8798", fontSize: 12, marginTop: 10 }}>
          Gira da sola, all&apos;infinito · Esc o ✕ per chiudere
        </p>
      </div>

      {/* Le coreografie condivise */}
      <style>{`
        @keyframes demo-apparsa { from { opacity: 0 } to { opacity: 1 } }
        @keyframes demo-scorri { to { stroke-dashoffset: -28 } }
        .demo-flusso { animation: demo-scorri 1.1s linear infinite; }
        .demo-flusso-inverso { animation: demo-scorri 1.3s linear infinite reverse; }
        @keyframes demo-battito { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(.82); opacity: .7 } }
        .demo-batte { animation: demo-battito 1.6s ease-in-out infinite; }
        @keyframes demo-rotazione { to { transform: rotate(360deg) } }
        .demo-gira { animation: demo-rotazione 9s linear infinite; }
        @keyframes demo-voce { 0%,100% { height: 5px } 50% { height: 18px } }
        .demo-onda-voce { animation: demo-voce .8s ease-in-out infinite; }
        @keyframes demo-onda-espansa { from { transform: scale(.1); opacity: .9 } to { transform: scale(4.2); opacity: 0 } }
        .demo-onda-tema { animation: demo-onda-espansa 1.3s ease-out forwards; }
      `}</style>
    </div>,
    document.body
  );
}

// ──────────────────────────────────────────────────────────────────────────
// IL CINEMA IN PRIMO PIANO: la sfilata delle funzioni sulla vetrina.
// Una scena alla volta, grande, che gira da sola; finito il giro passa alla
// successiva con una dissolvenza scorrevole. Accanto (sotto, su mobile) la
// carta con emoji, titolo e testo — gli stessi dei riquadri di prima.
// Parte MUTO (niente suoni a sorpresa sulla home): 🔊 sul palco per accenderli.
// ──────────────────────────────────────────────────────────────────────────

const DURATE_SCENE: Record<DemoId, number> = {
  agenda: 14500,
  segreteria: 14500,
  posta: 15000,
  mano: 14500,
  team: 14000,
  strumenti: 14000,
  fortezza: 14500,
  voce: 15000,
  misura: 13000,
};

export function CinemaFunzioni({
  funzioni,
}: {
  funzioni: { icona: string; titolo: string; testo: string; demo: DemoId }[];
}) {
  const [indice, setIndice] = useState(0);
  const [prima, setPrima] = useState<number | null>(null); // la scena uscente, per la dissolvenza
  const [audioOn, setAudioOn] = useState(false);
  const [scala, setScala] = useState(1);
  const boxRef = useRef<HTMLDivElement>(null);
  const corrente = funzioni[indice];

  // La home non deve suonare da sola: il carosello nasce muto.
  useEffect(() => {
    impostaSuoni(false, false);
  }, []);

  // Palco fisso 880×550 scalato alla larghezza disponibile.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const misura = () => setScala(el.clientWidth / 880);
    misura();
    const ro = new ResizeObserver(misura);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const vai = useCallback(
    (dove: number) => {
      setIndice((cur) => {
        const nuovo = ((dove % funzioni.length) + funzioni.length) % funzioni.length;
        if (nuovo === cur) return cur;
        setPrima(cur);
        return nuovo;
      });
    },
    [funzioni.length]
  );

  // Fine dissolvenza: la scena uscente esce di scena davvero.
  useEffect(() => {
    if (prima === null) return;
    const timer = setTimeout(() => setPrima(null), 800);
    return () => clearTimeout(timer);
  }, [prima]);

  // Auto-avanzamento: un giro completo della scena, poi la prossima.
  useEffect(() => {
    const timer = setTimeout(() => vai(indice + 1), DURATE_SCENE[corrente.demo] + 400);
    return () => clearTimeout(timer);
  }, [indice, corrente.demo, vai]);

  const palcoScena = (demo: DemoId) => (
    <div style={{ position: "absolute", left: 0, top: 0, width: 880, height: 550, transform: `scale(${scala})`, transformOrigin: "top left" }}>
      {SCENE[demo]()}
    </div>
  );

  const bottoneTondo: CSSProperties = {
    width: 42,
    height: 42,
    borderRadius: 99,
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(8,14,20,.78)",
    color: "#dff6fc",
    fontSize: 17,
    cursor: "pointer",
    backdropFilter: "blur(6px)",
  };

  return (
    <div className="cin-griglia" style={{ display: "grid", gap: 20, marginTop: 26, alignItems: "center" }}>
      {/* IL PALCO */}
      <div style={{ position: "relative" }}>
        <div
          ref={boxRef}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "880 / 550",
            borderRadius: 20,
            overflow: "hidden",
            border: "1px solid rgba(56,232,255,.24)",
            background: "radial-gradient(1200px 600px at 50% -10%, rgba(23,50,68,.55), rgba(5,10,15,.98))",
            boxShadow: "0 34px 100px rgba(0,0,0,.55), 0 0 70px rgba(56,232,255,.06)",
          }}
        >
          {prima !== null && (
            <div key={`esce-${prima}`} style={{ position: "absolute", inset: 0, animation: "cin-esce .8s cubic-bezier(.4,0,.2,1) both" }}>
              {palcoScena(funzioni[prima].demo)}
            </div>
          )}
          <div key={`entra-${corrente.demo}`} style={{ position: "absolute", inset: 0, animation: prima !== null ? "cin-entra .8s cubic-bezier(.16,1,.3,1) both" : undefined }}>
            {palcoScena(corrente.demo)}
          </div>

          {/* Frecce di regia */}
          <button aria-label="Scena precedente" onClick={() => vai(indice - 1)} style={{ ...bottoneTondo, position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", zIndex: 8 }}>
            ‹
          </button>
          <button aria-label="Scena successiva" onClick={() => vai(indice + 1)} style={{ ...bottoneTondo, position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", zIndex: 8 }}>
            ›
          </button>
          {/* Audio del cinema (nasce muto) */}
          <button
            aria-label={audioOn ? "Silenzia le scene" : "Attiva i suoni delle scene"}
            title={audioOn ? "Suoni attivi" : "Suoni spenti"}
            onClick={() => {
              const nuovo = !audioOn;
              setAudioOn(nuovo);
              impostaSuoni(nuovo, false);
              if (nuovo) suona("pop");
            }}
            style={{ ...bottoneTondo, position: "absolute", right: 12, bottom: 12, zIndex: 8, fontSize: 15, background: audioOn ? "rgba(56,232,255,.16)" : "rgba(8,14,20,.78)" }}
          >
            {audioOn ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      {/* LA CARTA DELLA SCENA IN ONDA + LA SCALETTA */}
      <div>
        <div key={corrente.demo} className="glass" style={{ borderRadius: 18, padding: "24px 24px 20px", position: "relative", overflow: "hidden", animation: "cin-carta .6s cubic-bezier(.16,1,.3,1) both" }}>
          {/* Il tempo della scena che scorre */}
          <div key={`barra-${indice}`} style={{ position: "absolute", top: 0, left: 0, height: 3, background: "linear-gradient(90deg, rgba(56,232,255,.9), rgba(56,232,255,.35))", animation: `cin-progresso ${DURATE_SCENE[corrente.demo] + 400}ms linear both` }} />
          <div style={{ fontSize: 34 }}>{corrente.icona}</div>
          <h3 style={{ margin: "12px 0 8px", fontSize: 21, color: "#dff6fc" }}>{corrente.titolo}</h3>
          <p style={{ margin: 0, color: "#8fb2c2", fontSize: 15, lineHeight: 1.6 }}>{corrente.testo}</p>
          <div style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: ".08em", color: "#38e8ff" }}>
            <span className="demo-batte" style={{ width: 7, height: 7, borderRadius: 99, background: "#38e8ff", boxShadow: "0 0 10px rgba(56,232,255,.9)" }} />
            IN ONDA · ORION AL LAVORO
          </div>
        </div>

        {/* La scaletta delle sei scene */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {funzioni.map((f, i) => (
            <button
              key={f.demo}
              onClick={() => vai(i)}
              aria-label={f.titolo}
              title={f.titolo}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 13px",
                borderRadius: 99,
                fontSize: 15,
                cursor: "pointer",
                transition: "all .3s",
                border: `1px solid ${i === indice ? "rgba(56,232,255,.65)" : "rgba(255,255,255,.12)"}`,
                background: i === indice ? "rgba(56,232,255,.13)" : "rgba(255,255,255,.04)",
                color: i === indice ? "#e8fbff" : "#7fa5b5",
                boxShadow: i === indice ? "0 0 18px rgba(56,232,255,.18)" : "none",
              }}
            >
              {f.icona}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes cin-entra { from { opacity: 0; transform: translateX(46px) scale(.985) } to { opacity: 1; transform: translateX(0) scale(1) } }
        @keyframes cin-esce { from { opacity: 1; transform: translateX(0) scale(1) } to { opacity: 0; transform: translateX(-46px) scale(.985) } }
        @keyframes cin-carta { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes cin-progresso { from { width: 0 } to { width: 100% } }
        @media (min-width: 900px) { .cin-griglia { grid-template-columns: 1.6fr 1fr; } }
      `}</style>
    </div>
  );
}
