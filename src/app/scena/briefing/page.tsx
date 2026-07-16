"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { suona, impostaSuoni } from "@/components/DemoFunzioni";

// ──────────────────────────────────────────────────────────────────────────
// SET CINEMATOGRAFICO · "Il briefing del mattino" — /scena/briefing
// La scena che gira sullo schermo del Mac per il video marketing (ripresa
// col telefono → transizione → dentro lo schermo). NON linkata dal sito.
//
// Regia: SPAZIO (o click) = ciak con conto alla rovescia 3‑2‑1 → azione
// (~30s, una sola volta, poi resta sull'ultima inquadratura). R = si rigira.
// Il cursore sparisce durante l'azione. Suoni compresi (il microfono del
// telefono li cattura dal Mac: alza un po' il volume).
//
// Sceneggiatura: il dottore chiede il briefing → ORION apre AGENDA piena e
// GESTIONALE, indica le cose che ha GIÀ fatto (cartella pronta, buco delle
// 11 riempito dalla lista d'attesa, solleciti), riassume e stampa.
// ──────────────────────────────────────────────────────────────────────────

const FINE = 30_000;

const fra = (t: number, a: number, b: number) => t >= a && t < b;
function digita(testo: string, t: number, inizio: number, cps = 26): string {
  if (t < inizio) return "";
  return testo.slice(0, Math.floor(((t - inizio) / 1000) * cps));
}

function El({ on, da = "translateY(14px)", style, children }: { on: boolean; da?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "translate(0,0) scale(1)" : da,
        transition: "opacity .6s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Il nucleo di ORION, grande e vivo (versione da palcoscenico).
function Nucleo({ parla, size }: { parla: boolean; size: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div style={{ position: "absolute", inset: "-18%", borderRadius: "50%", background: "radial-gradient(circle, rgba(56,232,255,.22) 0%, transparent 65%)", animation: parla ? "sb-alone .9s ease-in-out infinite" : "sb-alone 2.6s ease-in-out infinite" }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2.5px solid rgba(210,245,255,.8)" }} />
      <div style={{ position: "absolute", inset: "9%", borderRadius: "50%", border: "2px solid rgba(150,225,245,.45)", animation: "sb-gira 11s linear infinite" }} />
      <div style={{ position: "absolute", inset: "17%", borderRadius: "50%", border: "1.5px solid rgba(120,205,230,.3)", animation: "sb-gira 17s linear infinite reverse" }} />
      <div style={{ position: "absolute", inset: "27%", borderRadius: "50%", background: "radial-gradient(circle at 36% 30%, #b9f4ff 0%, #4fd6ee 45%, #0b4358 100%)", boxShadow: "0 0 44px rgba(86,224,255,.75)", animation: parla ? "sb-batte .5s ease-in-out infinite" : "sb-batte 2.4s ease-in-out infinite" }} />
    </div>
  );
}

function Bolla({ mia, on, style, children }: { mia?: boolean; on: boolean; style?: CSSProperties; children: ReactNode }) {
  return (
    <div
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "translateY(0) scale(1)" : "translateY(14px) scale(.96)",
        transition: "all .5s cubic-bezier(.16,1,.3,1)",
        padding: "16px 22px",
        borderRadius: 20,
        fontSize: 23,
        lineHeight: 1.45,
        fontWeight: 500,
        boxShadow: "0 18px 50px rgba(0,0,0,.45)",
        ...(mia
          ? { background: "rgba(56,232,255,.14)", border: "1.5px solid rgba(56,232,255,.45)", color: "#eafcff", borderBottomRightRadius: 7 }
          : { background: "rgba(13,24,33,.94)", border: "1.5px solid rgba(255,255,255,.14)", color: "#e2f2f9", borderBottomLeftRadius: 7 }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Finestra({ label, tinta = "56,232,255", style, children }: { label: string; tinta?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div style={{ borderRadius: 18, border: `1.5px solid rgba(${tinta},.28)`, background: "rgba(9,16,23,.96)", boxShadow: "0 30px 90px rgba(0,0,0,.55)", overflow: "hidden", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)" }}>
        <span style={{ width: 11, height: 11, borderRadius: 99, background: "#ff5f57" }} />
        <span style={{ width: 11, height: 11, borderRadius: 99, background: "#febc2e" }} />
        <span style={{ width: 11, height: 11, borderRadius: 99, background: "#28c840" }} />
        <span style={{ marginLeft: 10, fontSize: 14.5, letterSpacing: ".16em", color: "#8fb2c4", fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ position: "relative", height: "calc(100% - 44px)" }}>{children}</div>
    </div>
  );
}

// Spunti sonori one-shot sull'orologio della scena.
function useSuoniScena(t: number, attivo: boolean) {
  const prima = useRef(-1);
  useEffect(() => {
    if (!attivo) {
      prima.current = -1;
      return;
    }
    const spunti: [number, Parameters<typeof suona>[0]][] = [
      [80, "avvio"],
      [800, "pop"],
      [2600, "pop"],
      [4600, "whoosh"],
      [5000, "tick"], [5480, "tick"], [5960, "tick"], [6440, "tick"],
      [7300, "whoosh"],
      [7800, "tick"], [8300, "tick"],
      [9600, "pop"],
      [11400, "ding"], // cartella PRONTA
      [13400, "pop"],
      [15600, "ding"], // Sara Neri conferma
      [17300, "whoosh"],
      [18400, "ding"], // solleciti
      [20200, "tada"], // riassunto
      [23000, "pop"],
      [24800, "ding"], // stampata
      [26200, "pop"],
      [27700, "tada"], // lockup finale
    ];
    const p = prima.current;
    prima.current = t;
    if (p < 0) return;
    for (const [quando, nome] of spunti) if (quando > p && quando <= t) suona(nome);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, attivo]);
}

export default function ScenaBriefing() {
  const [fase, setFase] = useState<"attesa" | "ciak" | "azione">("attesa");
  const [conteggio, setConteggio] = useState(3);
  const [t, setT] = useState(0);
  const [scala, setScala] = useState(1);
  const boxRef = useRef<HTMLDivElement>(null);

  // Sul set i suoni sono SEMPRE accesi (il carosello della home li ammutolisce).
  useEffect(() => {
    impostaSuoni(true, false);
  }, []);

  // Il palco è 1440×900 e si adatta a qualsiasi schermo (lettera-box nero).
  useEffect(() => {
    const misura = () => setScala(Math.min(window.innerWidth / 1440, window.innerHeight / 900));
    misura();
    window.addEventListener("resize", misura);
    return () => window.removeEventListener("resize", misura);
  }, []);

  // CIAK: 3‑2‑1 poi azione.
  const ciak = useCallback(() => {
    setFase((f) => {
      if (f !== "attesa") return f;
      setConteggio(3);
      return "ciak";
    });
  }, []);
  useEffect(() => {
    if (fase !== "ciak") return;
    suona("tick");
    if (conteggio === 0) {
      setFase("azione");
      return;
    }
    const timer = setTimeout(() => setConteggio((c) => c - 1), 850);
    return () => clearTimeout(timer);
  }, [fase, conteggio]);

  // L'orologio dell'azione: una sola ripresa, poi resta sull'ultimo fotogramma.
  useEffect(() => {
    if (fase !== "azione") return;
    let raf = 0;
    const inizio = performance.now();
    const tick = (ora: number) => {
      const e = Math.min(FINE, ora - inizio);
      setT(e);
      if (e < FINE) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fase]);

  // Tasti: SPAZIO/click = ciak · R = si rigira.
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        ciak();
      }
      if (e.key.toLowerCase() === "r") {
        setT(0);
        setFase("attesa");
      }
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, [ciak]);

  useSuoniScena(t, fase === "azione");

  const azione = fase === "azione";
  // L'orbe si sposta in alto a destra quando si apre il lavoro.
  const orbeInAngolo = azione && t >= 4300 && t < 26000;
  const finale = azione && t >= 26000;
  const riassunto = azione && fra(t, 20000, 26000);

  return (
    <main
      onClick={fase === "attesa" ? ciak : undefined}
      style={{ position: "fixed", inset: 0, background: "#000", display: "grid", placeItems: "center", overflow: "hidden", cursor: azione ? "none" : "pointer", userSelect: "none" }}
    >
      <div style={{ position: "relative", width: 1440, height: 900, transform: `scale(${scala})`, transformOrigin: "center", background: "radial-gradient(1100px 640px at 50% -8%, #12283a 0%, #060b11 58%, #04070c 100%)", overflow: "hidden" }}>

        {/* Le stelle di casa */}
        {[...Array(40)].map((_, i) => (
          <span key={i} style={{ position: "absolute", left: `${(i * 137) % 1440}px`, top: `${(i * 289) % 900}px`, width: i % 5 ? 1.6 : 2.6, height: i % 5 ? 1.6 : 2.6, borderRadius: 99, background: "rgba(190,235,250,.5)", opacity: 0.16 + ((i * 7) % 10) / 22 }} />
        ))}

        {/* Barra alta del "computer" */}
        <El on={azione} da="translateY(-16px)" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 26px", background: "rgba(4,8,12,.55)", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 16.5, color: "#9db9c8" }}>
            <span style={{ width: 12, height: 12, borderRadius: 99, background: "#38e8ff", boxShadow: "0 0 12px rgba(56,232,255,.9)" }} />
            <span style={{ letterSpacing: ".3em", fontWeight: 800, color: "#e8fbff", fontSize: 15 }}>ORION</span>
            <span style={{ opacity: 0.6 }}>·</span>
            <span>Studio Medico</span>
            <span style={{ marginLeft: "auto" }}>mercoledì 16 luglio · 08:27</span>
          </div>
        </El>

        {/* Il nucleo: al centro all'inizio, in alto a destra durante il lavoro */}
        <div
          style={{
            position: "absolute",
            left: orbeInAngolo ? 1250 : 610,
            top: orbeInAngolo ? 70 : finale ? 250 : 200,
            width: orbeInAngolo ? 110 : 220,
            height: orbeInAngolo ? 110 : 220,
            transition: "all 1.1s cubic-bezier(.4,0,.2,1)",
            zIndex: 20,
            opacity: azione ? 1 : 0,
          }}
        >
          <Nucleo parla={azione && (fra(t, 2600, 4400) || fra(t, 9600, 12400) || fra(t, 13400, 16400) || fra(t, 17400, 19400) || fra(t, 20200, 22600) || fra(t, 26200, 28000))} size={orbeInAngolo ? 110 : 220} />
        </div>

        {/* ── DIALOGO D'APERTURA ── */}
        <Bolla mia on={azione && fra(t, 800, 4300)} style={{ position: "absolute", left: 470, top: 560, maxWidth: 560 }}>
          🎙 «{digita("Buongiorno ORION. Fammi il briefing.", t, 900)}»
        </Bolla>
        <Bolla on={azione && fra(t, 2600, 4400)} style={{ position: "absolute", left: 440, top: 660, maxWidth: 640 }}>
          {digita("Buongiorno, dottore. Ecco la sua giornata:", t, 2700)}
        </Bolla>

        {/* ── L'AGENDA DEL MEDICO (piena) ── */}
        <El on={azione && t >= 4600 && !finale} da="translateX(-60px)" style={{ position: "absolute", left: 46, top: 84, width: 620, zIndex: 5 }}>
          <Finestra label="AGENDA · MERCOLEDÌ 16 LUGLIO" style={{ width: "100%" }}>
            <div style={{ padding: 16, display: "grid", gap: 9 }}>
              {[
                { ora: "08:30", chi: "Sig.ra Riva", tipo: "Controllo", stato: "ok" },
                { ora: "09:15", chi: "Sig. Bianchi", tipo: "PRIMA VISITA", stato: "nuovo" },
                { ora: "10:00", chi: "Sig.ra Galli", tipo: "Medicazione", stato: "ok" },
                { ora: "10:30", chi: "Sig. Ferri", tipo: "Controllo", stato: "ok" },
                { ora: "11:00", chi: "Sig. Conti", tipo: "Controllo", stato: "disdetto" },
                { ora: "12:00", chi: "Sig.ra Landi", tipo: "Vaccinazione", stato: "ok" },
                { ora: "15:00", chi: "Sig. Mauri", tipo: "Controllo", stato: "ok" },
                { ora: "16:30", chi: "Sig.ra Orsini", tipo: "Visita di controllo", stato: "ok" },
              ].map((r, i) => {
                const evidenziaNuovo = r.stato === "nuovo" && azione && t >= 9600;
                const riempito = r.stato === "disdetto" && azione && t >= 15400;
                const rosso = r.stato === "disdetto" && azione && t >= 13400 && !riempito;
                return (
                  <El key={r.ora} on={azione && t >= 4900 + i * 240} da="translateX(-18px)">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "12px 16px",
                        borderRadius: 12,
                        fontSize: 19,
                        transition: "all .6s",
                        background: riempito ? "rgba(52,211,153,.13)" : rosso ? "rgba(244,63,94,.12)" : evidenziaNuovo ? "rgba(56,232,255,.1)" : "rgba(255,255,255,.045)",
                        border: `1.5px solid ${riempito ? "rgba(52,211,153,.55)" : rosso ? "rgba(244,63,94,.55)" : evidenziaNuovo ? "rgba(56,232,255,.6)" : "rgba(255,255,255,.08)"}`,
                        boxShadow: evidenziaNuovo || rosso || riempito ? "0 0 26px rgba(56,232,255,.1)" : "none",
                      }}
                    >
                      <span style={{ color: "#38e8ff", fontWeight: 800, fontSize: 18 }}>{r.ora}</span>
                      <span style={{ color: "#e6f4fa", fontWeight: 600, textDecoration: rosso ? "line-through" : "none" }}>{riempito ? "Sara Neri" : r.chi}</span>
                      <span style={{ marginLeft: "auto", fontSize: 14.5, fontWeight: 700, letterSpacing: ".04em", color: riempito ? "#6ee7b7" : rosso ? "#fb7185" : r.stato === "nuovo" ? "#7ff0ff" : "#7fa5b5" }}>
                        {riempito ? "CONFERMATO ✓" : rosso ? "DISDETTO" : r.tipo}
                      </span>
                    </div>
                  </El>
                );
              })}
            </div>
          </Finestra>
        </El>

        {/* ── IL GESTIONALE (finto ma credibile) ── */}
        <El on={azione && t >= 7300 && !finale} da="translateX(60px)" style={{ position: "absolute", right: 46, top: 150, width: 600, zIndex: 5 }}>
          <Finestra label="MEDIGEST · CARTELLE CLINICHE" tinta="167,139,250" style={{ width: "100%" }}>
            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 8, padding: "6px 12px", fontSize: 13.5, color: "#8f9fc4", letterSpacing: ".08em", fontWeight: 700 }}>
                <span>PAZIENTE</span><span>ULTIMA VISITA</span><span>CARTELLA</span>
              </div>
              {[
                { chi: "Riva Anna", ultima: "12/06", cartella: "aggiornata", ev: false },
                { chi: "Bianchi Marco", ultima: "— nuovo —", cartella: "da preparare", ev: true },
                { chi: "Galli Sofia", ultima: "30/06", cartella: "aggiornata", ev: false },
                { chi: "Ferri Luca", ultima: "18/06", cartella: "aggiornata", ev: false },
                { chi: "Landi Elena", ultima: "02/07", cartella: "aggiornata", ev: false },
              ].map((r, i) => {
                const pronta = r.ev && azione && t >= 11400;
                const acceso = r.ev && azione && t >= 9800;
                return (
                  <El key={r.chi} on={azione && t >= 7700 + i * 220} da="translateX(16px)">
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.3fr 1fr 1fr",
                        gap: 8,
                        padding: "12px 12px",
                        borderRadius: 10,
                        fontSize: 18,
                        marginTop: 6,
                        transition: "all .6s",
                        background: acceso ? "rgba(167,139,250,.14)" : "rgba(255,255,255,.04)",
                        border: `1.5px solid ${acceso ? "rgba(167,139,250,.6)" : "rgba(255,255,255,.07)"}`,
                      }}
                    >
                      <span style={{ color: "#e9e4fa", fontWeight: 600 }}>{r.chi}</span>
                      <span style={{ color: "#9b93bd" }}>{r.ultima}</span>
                      <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: ".05em", color: pronta ? "#6ee7b7" : r.ev ? "#f0c674" : "#8fa0b5", transition: "color .5s" }}>
                        {pronta ? "PRONTA ✓ (ORION)" : r.cartella.toUpperCase()}
                      </span>
                    </div>
                  </El>
                );
              })}
            </div>
          </Finestra>
        </El>

        {/* Il filo che collega agenda ↔ gestionale durante il callout 1 */}
        <svg width="1440" height="900" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6, opacity: azione && fra(t, 9800, 12800) ? 1 : 0, transition: "opacity .6s" }}>
          <path d="M 668 258 C 800 258, 800 300, 838 300" fill="none" stroke="rgba(56,232,255,.75)" strokeWidth="3" strokeDasharray="8 9" className="sb-flusso" />
        </svg>

        {/* ── LE VOCI DI ORION durante il lavoro (in alto, vicino al nucleo) ── */}
        <Bolla on={azione && fra(t, 9600, 13200)} style={{ position: "absolute", left: 700, top: 60, maxWidth: 520, zIndex: 21 }}>
          {digita("Alle 9:15 ha una prima visita: le ho già preparato io la cartella.", t, 9700)}
        </Bolla>
        <Bolla on={azione && fra(t, 13400, 17200)} style={{ position: "absolute", left: 700, top: 60, maxWidth: 540, zIndex: 21 }}>
          {digita("Conti ha disdetto ieri sera: ho offerto l'ora alla lista d'attesa. Sara Neri ha accettato.", t, 13500)}
        </Bolla>
        <Bolla on={azione && fra(t, 17400, 20000)} style={{ position: "absolute", left: 700, top: 60, maxWidth: 520, zIndex: 21 }}>
          {digita("Due pagamenti erano in ritardo: solleciti già partiti.", t, 17500)}
        </Bolla>

        {/* ── PAGAMENTI (pannellino in basso a sinistra) ── */}
        <El on={azione && t >= 17300 && !finale} da="translateY(40px)" style={{ position: "absolute", left: 46, bottom: 26, width: 430, zIndex: 7 }}>
          <Finestra label="PAGAMENTI" tinta="245,198,107" style={{ width: "100%" }}>
            <div style={{ padding: "14px 16px", display: "grid", gap: 8 }}>
              {[
                ["Sig. Ferri — fattura n. 208", "sollecito inviato ✓"],
                ["Sig.ra Galli — fattura n. 214", "sollecito inviato ✓"],
              ].map(([chi, stato], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 17, padding: "9px 12px", borderRadius: 10, background: "rgba(245,198,107,.07)", border: "1px solid rgba(245,198,107,.3)" }}>
                  <span style={{ color: "#f2e5c8" }}>{chi}</span>
                  <span style={{ color: "#6ee7b7", fontWeight: 800, fontSize: 14.5, opacity: t >= 18400 + i * 250 ? 1 : 0.25, transition: "opacity .5s" }}>{stato}</span>
                </div>
              ))}
            </div>
          </Finestra>
        </El>

        {/* ── IL RIASSUNTO ── */}
        <El on={riassunto} da="scale(.9)" style={{ position: "absolute", left: 0, right: 0, top: 300, display: "grid", placeItems: "center", zIndex: 30 }}>
          <div style={{ width: 720, borderRadius: 22, border: "1.5px solid rgba(56,232,255,.4)", background: "rgba(7,14,20,.97)", boxShadow: "0 40px 120px rgba(0,0,0,.65), 0 0 70px rgba(56,232,255,.1)", padding: "28px 34px" }}>
            <div style={{ fontSize: 15, letterSpacing: ".22em", color: "#7fd7ea", fontWeight: 800, marginBottom: 14 }}>OGGI, IN BREVE</div>
            {[
              ["🗓", "8 pazienti — giornata piena, nessuna sovrapposizione"],
              ["🆕", "1 prima visita alle 9:15 — cartella già pronta"],
              ["♻️", "Il buco delle 11:00 è già riempito (lista d'attesa)"],
              ["💶", "2 pagamenti in ritardo — solleciti già inviati"],
            ].map(([ico, testo], i) => (
              <div key={i} style={{ display: "flex", gap: 14, alignItems: "center", padding: "10px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,.07)" : "none", fontSize: 21, color: "#dff0f8", opacity: t >= 20400 + i * 300 ? 1 : 0, transform: t >= 20400 + i * 300 ? "none" : "translateX(-10px)", transition: "all .5s" }}>
                <span style={{ fontSize: 24 }}>{ico}</span>
                {testo}
              </div>
            ))}
            <div style={{ marginTop: 16, fontSize: 20, color: "#9fdcec", opacity: t >= 21800 ? 1 : 0, transition: "opacity .5s" }}>
              {digita("Le stampo l'agenda di oggi?", t, 21900)}
            </div>
          </div>
        </El>
        <Bolla mia on={azione && fra(t, 23000, 26000)} style={{ position: "absolute", left: 590, top: 700, zIndex: 31 }}>
          🎙 «{digita("Sì, stampa.", t, 23100)}»
        </Bolla>
        <El on={azione && fra(t, 24300, 26000)} da="scale(.7)" style={{ position: "absolute", left: 840, top: 700, zIndex: 31 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderRadius: 14, background: "rgba(52,211,153,.13)", border: "1.5px solid rgba(52,211,153,.55)", color: "#a7f3d0", fontSize: 19, fontWeight: 800 }}>
            🖨 STAMPATA ✓
          </div>
        </El>

        {/* ── FINALE: saluto e sigla ── */}
        <Bolla on={azione && fra(t, 26200, 27600)} style={{ position: "absolute", left: 560, top: 520, zIndex: 40 }}>
          {digita("Buona giornata, dottore.", t, 26300)}
        </Bolla>
        <El on={azione && t >= 27600} da="translateY(16px)" style={{ position: "absolute", left: 0, right: 0, top: 520, textAlign: "center", zIndex: 40 }}>
          <div style={{ fontSize: 54, letterSpacing: ".3em", fontWeight: 800, color: "#f2fbff" }}>ORION</div>
          <div style={{ fontSize: 22, color: "#9fdcec", marginTop: 10 }}>Il primo Sistema Operativo Conversazionale</div>
          <div style={{ fontSize: 19, color: "#5e8798", marginTop: 16 }}>orionvision.it · si apre il 21 luglio, ore 19:00</div>
        </El>

        {/* ── REGIA: attesa e ciak ── */}
        {fase === "attesa" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(2,5,8,.82)", zIndex: 60 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, letterSpacing: ".28em", color: "#7fd7ea", fontWeight: 800 }}>SCENA 1 · IL BRIEFING DEL MATTINO</div>
              <div style={{ fontSize: 40, color: "#f2fbff", fontWeight: 800, margin: "18px 0 8px" }}>Premi SPAZIO per il ciak</div>
              <div style={{ fontSize: 17, color: "#6f8c9c" }}>3‑2‑1 e l&apos;azione parte da sola (~30 secondi) · R = si rigira · alza il volume 🔊</div>
            </div>
          </div>
        )}
        {fase === "ciak" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(2,5,8,.9)", zIndex: 60 }}>
            <div key={conteggio} style={{ fontSize: 190, fontWeight: 800, color: "#38e8ff", textShadow: "0 0 80px rgba(56,232,255,.6)", animation: "sb-conto .8s ease-out both" }}>
              {conteggio === 0 ? "🎬" : conteggio}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes sb-alone { 0%,100% { transform: scale(1); opacity:.8 } 50% { transform: scale(1.12); opacity: 1 } }
        @keyframes sb-batte { 0%,100% { transform: scale(1) } 50% { transform: scale(.9) } }
        @keyframes sb-gira { to { transform: rotate(360deg) } }
        @keyframes sb-conto { from { transform: scale(1.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes sb-scorri { to { stroke-dashoffset: -34 } }
        .sb-flusso { animation: sb-scorri 1s linear infinite; }
      `}</style>
    </main>
  );
}
