"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OrionCore } from "@/components/OrionCore";

// ════════════════════════════════════════════════════════════════════════════
// TRAILER UFFICIALE DI ORION — sequenza cinematografica costruita in codice con
// l'IDENTITÀ VISIVA REALE del prodotto (nucleo cyan, tema dark, glass, tipografia,
// le stesse animazioni). Pensata per essere registrata a schermo in 4K e poi
// montata con voce narrante + musica. Nessuna interfaccia inventata: usa il nucleo
// vero (OrionCore) e i veri stili del prodotto. ~2:30. Apri a tutto schermo (F).
// Comandi: ▶ avvia · Spazio pausa · R riavvia · F schermo intero · C sottotitoli.
// ════════════════════════════════════════════════════════════════════════════

const OV = 650; // sovrapposizione fra scene → dissolvenza incrociata
const FADE = 650;

type Win = { start: number; end: number };

// Costruisce la timeline: ogni scena dura `dur`, le scene si sovrappongono di OV.
function costruisciTimeline(scene: [string, number][]) {
  const w: Record<string, Win> = {};
  let cur = 0;
  for (const [nome, dur] of scene) {
    w[nome] = { start: cur, end: cur + dur };
    cur += dur - OV;
  }
  const total = cur + OV;
  return { w, total };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export default function Trailer() {
  const { w, total } = useMemo(
    () =>
      costruisciTimeline([
        ["risveglio", 13000],
        ["trecose", 13500],
        ["lavoro", 4200],
        ["medico", 8200],
        ["avvocato", 8000],
        ["azienda", 9000],
        ["studente", 9200],
        ["tecnico", 9200],
        ["comunicazioni", 12500],
        ["computer", 13500],
        ["spazio", 11000],
        ["impara", 12000],
        ["briefing", 13000],
        ["finale", 17000],
      ]),
    []
  );

  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sub, setSub] = useState(true);
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const restart = useCallback(() => {
    tRef.current = 0;
    setT(0);
    lastRef.current = 0;
  }, []);

  useEffect(() => {
    if (!started) return;
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (!lastRef.current) lastRef.current = ts;
      const dt = ts - lastRef.current;
      lastRef.current = ts;
      if (pausedRef.current) return;
      tRef.current = Math.min(total, tRef.current + dt);
      setT(tRef.current);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key.toLowerCase() === "r") {
        restart();
      } else if (e.key.toLowerCase() === "c") {
        setSub((s) => !s);
      } else if (e.key.toLowerCase() === "f") {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
        else document.exitFullscreen?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restart]);

  // Opacità di una scena (dissolvenza in/out dentro la sua finestra).
  const op = (win: Win) => {
    if (t <= win.start - FADE || t >= win.end + FADE) return 0;
    if (t < win.start) return clamp01((t - (win.start - FADE)) / FADE);
    if (t < win.start + FADE) return clamp01((t - win.start) / FADE);
    if (t > win.end) return clamp01(1 - (t - win.end) / FADE);
    return 1;
  };
  // Progresso 0..1 dentro la scena (per i micro-movimenti "Ken Burns").
  const pr = (win: Win) => clamp01((t - win.start) / (win.end - win.start));
  const attiva = (win: Win) => t > win.start - FADE - 200 && t < win.end + FADE + 200;

  if (!started) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[#05070d] text-center">
        <div className="fade-in">
          <div className="mb-8 flex justify-center">
            <OrionCore state="idle" size={120} />
          </div>
          <button
            onClick={() => {
              document.documentElement.requestFullscreen?.().catch(() => {});
              setStarted(true);
            }}
            className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-7 py-3 text-cyan-100 hover:bg-cyan-400/20"
          >
            ▶ Avvia il trailer
          </button>
          <p className="mt-6 text-xs tracking-wider text-slate-500">
            Schermo intero per registrare in 4K · Spazio: pausa · R: riavvia · C: sottotitoli
          </p>
        </div>
      </div>
    );
  }

  const sottotitolo = CAPTIONS.find((c) => t >= c.start && t < c.end)?.text ?? "";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05070d] text-slate-100" style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      {/* Glow ambientale che respira (identità del prodotto) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 800px at 50% -10%, rgba(56,232,255,0.10), transparent 60%), radial-gradient(900px 700px at 100% 110%, rgba(99,102,241,0.10), transparent 55%)",
        }}
      />

      {/* ── SCENE ─────────────────────────────────────────────────────────── */}

      {/* 1 — RISVEGLIO: impulso di luce → il nucleo appare */}
      {attiva(w.risveglio) && (
        <Scene opacity={op(w.risveglio)}>
          <div className="relative grid h-full w-full place-items-center">
            <div
              className="absolute left-0 h-px w-full bg-cyan-300/80"
              style={{
                top: "50%",
                opacity: pr(w.risveglio) < 0.12 ? 1 : 0,
                boxShadow: "0 0 40px 8px rgba(56,232,255,0.8)",
                transform: `scaleX(${Math.min(1, pr(w.risveglio) / 0.1)})`,
                transition: "opacity 0.4s ease",
              }}
            />
            <div style={{ opacity: clamp01((pr(w.risveglio) - 0.08) / 0.12), transform: `scale(${0.7 + 0.3 * clamp01(pr(w.risveglio) / 0.25)})` }}>
              <OrionCore state={pr(w.risveglio) > 0.5 ? "speaking" : "idle"} size={260} />
            </div>
          </div>
        </Scene>
      )}

      {/* 2 — LE TRE COSE (briefing teaser) */}
      {attiva(w.trecose) && (
        <Scene opacity={op(w.trecose)}>
          <div className="grid h-full w-full grid-cols-[auto_1fr] items-center gap-16 px-[10%]">
            <OrionCore state="speaking" size={170} />
            <div className="max-w-xl space-y-3">
              {[
                "Il cliente Bianchi attende una risposta da 5 giorni.",
                "Domani hai una riunione importante: ho preparato il materiale.",
                "Conflitto in agenda venerdì — ho già una proposta.",
              ].map((s, i) => (
                <Card key={i} delay={i * 1.6} prog={pr(w.trecose)}>
                  <span className="mr-3 text-cyan-300/80">0{i + 1}</span>
                  {s}
                </Card>
              ))}
            </div>
          </div>
        </Scene>
      )}

      {/* 3 — "CHE LAVORO SVOLGE?" */}
      {attiva(w.lavoro) && (
        <Scene opacity={op(w.lavoro)}>
          <Centro>
            <Etichetta>IL PRIMO GIORNO</Etichetta>
            <h2 className="text-4xl font-light tracking-tight text-slate-100 md:text-5xl">“Che lavoro svolge?”</h2>
          </Centro>
        </Scene>
      )}

      {/* 4 — MEDICO (agenda) */}
      {attiva(w.medico) && (
        <Scene opacity={op(w.medico)}>
          <Contesto etichetta="MEDICO" prog={pr(w.medico)}>
            <PanelMock titolo="Agenda · Oggi">
              {[
                ["09:00", "Marco Rossi — Visita di controllo", "confermato"],
                ["10:00", "Giulia Bianchi — Prima visita", "da confermare"],
                ["11:30", "Anna Esposito — Consulto", "da confermare"],
              ].map((r, i) => (
                <Riga key={i} sx={r[0]} dx={r[2]}>
                  {r[1]}
                </Riga>
              ))}
              <Nota>Nuovi esami di Rossi ricevuti ieri sera — riepilogo pronto.</Nota>
            </PanelMock>
          </Contesto>
        </Scene>
      )}

      {/* 5 — AVVOCATO (fascicolo) */}
      {attiva(w.avvocato) && (
        <Scene opacity={op(w.avvocato)}>
          <Contesto etichetta="AVVOCATO" prog={pr(w.avvocato)}>
            <PanelMock titolo="Fascicolo Rossi · Udienza domani">
              {["Memoria difensiva — aggiornata", "Allegati (12) — ordinati", "Scadenze — nessun conflitto"].map((r, i) => (
                <Riga key={i} sx="" dx="">
                  {r}
                </Riga>
              ))}
              <Nota>Fascicolo pronto con gli ultimi aggiornamenti.</Nota>
            </PanelMock>
          </Contesto>
        </Scene>
      )}

      {/* 6 — AZIENDA (organigramma + codice) */}
      {attiva(w.azienda) && (
        <Scene opacity={op(w.azienda)}>
          <Contesto etichetta="AZIENDA" prog={pr(w.azienda)}>
            <PanelMock titolo="ORION · Rossi S.r.l.">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Produzione", "Marco — Responsabile · 12 operatori"],
                  ["Commerciale", "Paolo — Vendite"],
                  ["Amministrazione", "Giulia — Contabilità"],
                  ["Tecnico", "Luca — Cantieri"],
                ].map((r, i) => (
                  <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{r[0]}</div>
                    <div className="mt-1 text-sm text-slate-200">{r[1]}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.07] px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-cyan-300/70">Codice aziendale</div>
                <div className="mt-0.5 font-mono text-xl tracking-widest text-cyan-100">ORION-RSSI7F</div>
                <div className="mt-1 text-xs text-slate-400">Un dipendente lo inserisce → ruolo e ambiente riconosciuti.</div>
              </div>
            </PanelMock>
          </Contesto>
        </Scene>
      )}

      {/* 7 — STUDENTE (lavagna) */}
      {attiva(w.studente) && (
        <Scene opacity={op(w.studente)}>
          <Contesto etichetta="STUDENTE" prog={pr(w.studente)}>
            <PanelMock titolo="Lavagna · Integrali">
              <div className="grid grid-cols-[1fr_auto] items-center gap-6">
                <div className="space-y-3 font-serif text-slate-100">
                  <div className="text-2xl">∫ x² dx = x³⁄3 + C</div>
                  <div className="text-sm text-slate-400">1 · porta giù l’esponente come fattore</div>
                  <div className="text-sm text-slate-400">2 · aumenta l’esponente di uno</div>
                  <div className="text-sm text-slate-400">3 · dividi per il nuovo esponente</div>
                </div>
                <svg width="160" height="110" viewBox="0 0 160 110">
                  <path d="M10 100 Q 80 100 150 10" fill="none" stroke="#22d3ee" strokeWidth="2.5" className="fin-linea" />
                  <line x1="10" y1="100" x2="150" y2="100" stroke="rgba(255,255,255,0.2)" />
                  <line x1="10" y1="100" x2="10" y2="10" stroke="rgba(255,255,255,0.2)" />
                </svg>
              </div>
            </PanelMock>
          </Contesto>
        </Scene>
      )}

      {/* 8 — TECNICO (visione) */}
      {attiva(w.tecnico) && (
        <Scene opacity={op(w.tecnico)}>
          <Contesto etichetta="SUL CAMPO · VISIONE" prog={pr(w.tecnico)}>
            <div className="glass relative h-[58vh] w-[78vw] max-w-4xl overflow-hidden rounded-2xl">
              <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 60%, #11202b, #060a10)" }} />
              {/* riquadri evidenziati come la modalità visione reale */}
              <Evidenzia x="34%" y="42%" w={130} h={84} label="controlla il collegamento" />
              <Evidenzia x="60%" y="58%" w={72} h={72} label="questa vite" alert />
              <div className="absolute bottom-4 left-4 rounded-lg bg-black/55 px-3 py-1.5 text-sm text-cyan-100">
                “Prima di procedere, controlli il collegamento sul lato destro.”
              </div>
            </div>
          </Contesto>
        </Scene>
      )}

      {/* 9 — COMUNICAZIONI */}
      {attiva(w.comunicazioni) && (
        <Scene opacity={op(w.comunicazioni)}>
          <Contesto etichetta="COMUNICAZIONI" prog={pr(w.comunicazioni)}>
            <PanelMock titolo="WhatsApp · Marco">
              <div className="space-y-2">
                <Bolla in>Domani riusciamo per le 15?</Bolla>
                <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] p-3 text-sm text-slate-200">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-cyan-300/70">Bozza pronta</div>
                  Buongiorno Marco, confermo per domani alle 15. A presto.
                </div>
                <Bolla>Inviato ✓</Bolla>
              </div>
              <Nota>Email, allegati, documenti e chiamate — gestiti senza toccare nulla.</Nota>
            </PanelMock>
          </Contesto>
        </Scene>
      )}

      {/* 10 — IL COMPUTER OBBEDISCE */}
      {attiva(w.computer) && (
        <Scene opacity={op(w.computer)}>
          <Contesto etichetta="CONTROLLO DEL COMPUTER" prog={pr(w.computer)}>
            <PanelMock titolo="ORION sta lavorando">
              <div className="space-y-3 font-mono text-sm">
                {[
                  ["apri Blender — progetta una piccola casa con giardino", 0],
                  ["apri VS Code — crea il sito per il nuovo cliente", 1.6],
                  ["trova il contratto di Rossi → rinomina → invia all’avvocato", 3.2],
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-3" style={{ opacity: clamp01((pr(w.computer) - (r[1] as number) / 13) * 4) }}>
                    <span className="text-cyan-300">›</span>
                    <span className="text-slate-200">{r[0]}</span>
                    <span className="ml-auto text-emerald-300/80" style={{ opacity: clamp01((pr(w.computer) - ((r[1] as number) + 0.8) / 13) * 4) }}>
                      ✓ fatto
                    </span>
                  </div>
                ))}
              </div>
            </PanelMock>
          </Contesto>
        </Scene>
      )}

      {/* 11 — CONTROLLO DELLO SPAZIO (gesti) */}
      {attiva(w.spazio) && (
        <Scene opacity={op(w.spazio)}>
          <div className="relative h-full w-full">
            {[
              { l: "12%", tp: "26%", wd: 300, label: "AGENDA", p: 0 },
              { l: "44%", tp: "40%", wd: 320, label: "WHATSAPP", p: 0.2 },
              { l: "62%", tp: "20%", wd: 300, label: "DOCUMENTO", p: 0.4 },
            ].map((s, i) => (
              <div
                key={i}
                className="glass absolute rounded-2xl p-4"
                style={{
                  left: s.l,
                  top: s.tp,
                  width: s.wd,
                  height: 200,
                  transform: `translateX(${Math.sin((pr(w.spazio) + s.p) * Math.PI) * 40}px)`,
                  outline: i === 1 ? "2px solid rgba(34,211,238,0.5)" : "none",
                }}
              >
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
                {i === 1 && (
                  <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-cyan-400" style={{ boxShadow: "0 0 12px #22d3ee", opacity: 0.4 + 0.6 * Math.abs(Math.sin(t / 280)) }} />
                )}
              </div>
            ))}
            {/* cursore della mano */}
            <div
              className="absolute h-8 w-8 rounded-full border-2 border-cyan-300"
              style={{
                left: `${44 + Math.sin(pr(w.spazio) * Math.PI) * 6}%`,
                top: `${48}%`,
                background: "rgba(34,211,238,0.25)",
                boxShadow: "0 0 18px rgba(34,211,238,0.6)",
              }}
            />
          </div>
        </Scene>
      )}

      {/* 12 — IMPARA NEL TEMPO */}
      {attiva(w.impara) && (
        <Scene opacity={op(w.impara)}>
          <Contesto etichetta="GIORNI · MESI · ANNI" prog={pr(w.impara)}>
            <PanelMock titolo="Memoria viva">
              <div className="text-base text-slate-200">
                “Ho notato che ogni venerdì preferisce lasciare libero l’ultimo appuntamento, per gli eventuali ritardi. Vuole che diventi una regola permanente?”
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">Sì</span>
                <span className="text-sm text-slate-500">→ Perfetto. Lo terrò in considerazione da ora in avanti.</span>
              </div>
            </PanelMock>
          </Contesto>
        </Scene>
      )}

      {/* 13 — BRIEFING DEL MATTINO (versione massima) */}
      {attiva(w.briefing) && (
        <Scene opacity={op(w.briefing)}>
          <div className="grid h-full w-full grid-cols-[auto_1fr] items-center gap-14 px-[9%]">
            <OrionCore state="speaking" size={150} />
            <div className="max-w-2xl">
              <Etichetta>BUONGIORNO, SIMONE</Etichetta>
              <div className="mt-3 space-y-2.5">
                {[
                  "Il cliente Bianchi attende da 5 giorni — meglio ricontattarlo oggi.",
                  "Riunione importante domani — materiale già pronto.",
                  "Conflitto in agenda venerdì — proposta di soluzione pronta.",
                ].map((s, i) => (
                  <Card key={i} delay={i * 1.4} prog={pr(w.briefing)}>
                    {s}
                  </Card>
                ))}
              </div>
              <button className="mt-5 rounded-xl bg-cyan-500/90 px-6 py-3 font-medium text-slate-900">CONFERMA MODIFICHE</button>
            </div>
          </div>
        </Scene>
      )}

      {/* 14 — FINALE: resta il nucleo → si illumina → logo + tagline */}
      {attiva(w.finale) && (
        <Scene opacity={op(w.finale)}>
          <Centro>
            <div style={{ transform: `scale(${1 + 0.18 * clamp01((pr(w.finale) - 0.1) / 0.3)})`, filter: `brightness(${1 + 0.6 * clamp01((pr(w.finale) - 0.15) / 0.25)})`, transition: "transform 0.1s linear" }}>
              <OrionCore state="idle" size={170} />
            </div>
            <div style={{ opacity: clamp01((pr(w.finale) - 0.42) / 0.18) }}>
              <div className="mt-10 text-5xl font-semibold tracking-[0.45em] text-slate-100 md:text-6xl">ORION</div>
              <div className="mt-4 text-sm tracking-[0.25em] text-cyan-200/80">LA PRIMA SEGRETERIA OPERATIVA INTELLIGENTE</div>
              <div className="mt-8 text-lg text-slate-300" style={{ opacity: clamp01((pr(w.finale) - 0.62) / 0.18) }}>
                Non imparare un software. <span className="text-cyan-100">Parla con ORION.</span>
              </div>
            </div>
          </Centro>
        </Scene>
      )}

      {/* Barre cinematografiche (letterbox) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[6vh] bg-black" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[6vh] bg-black" />

      {/* Sottotitoli voce narrante (cronometrati, in stile elegante) */}
      {sub && sottotitolo && (
        <div className="pointer-events-none absolute bottom-[9vh] left-1/2 max-w-3xl -translate-x-1/2 px-6 text-center">
          <p className="text-balance text-lg font-light leading-snug text-slate-200/95 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">{sottotitolo}</p>
        </div>
      )}

      {/* Indicatore fine / barra di avanzamento sottile */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-cyan-400/70" style={{ width: `${(t / total) * 100}%`, transition: "width 0.1s linear" }} />
    </div>
  );
}

// ── Sottocomponenti faithful al design ──────────────────────────────────────

function Scene({ opacity, children }: { opacity: number; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0" style={{ opacity, transition: "opacity 0.12s linear", pointerEvents: "none" }}>
      {children}
    </div>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full w-full place-items-center text-center">{children}</div>;
}

function Etichetta({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium uppercase tracking-[0.3em] text-cyan-300/70">{children}</div>;
}

function Contesto({ etichetta, prog, children }: { etichetta: string; prog: number; children: React.ReactNode }) {
  return (
    <div className="grid h-full w-full place-items-center" style={{ transform: `scale(${1 + 0.03 * prog})`, transition: "transform 0.1s linear" }}>
      <div className="w-[80vw] max-w-3xl">
        <div className="mb-4"><Etichetta>{etichetta}</Etichetta></div>
        {children}
      </div>
    </div>
  );
}

function PanelMock({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="reveal glass rounded-2xl p-6">
      <h3 className="mb-4 text-lg font-semibold tracking-tight text-cyan-100">{titolo}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Riga({ sx, dx, children }: { sx: string; dx: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/6 pb-2 text-sm last:border-0">
      {sx && <span className="w-14 shrink-0 text-xs text-slate-500">{sx}</span>}
      <span className="flex-1 text-slate-200">{children}</span>
      {dx && <span className={`shrink-0 text-xs ${dx === "confermato" ? "text-emerald-300/80" : "text-amber-300/80"}`}>{dx}</span>}
    </div>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-2.5 text-sm text-amber-100/90">{children}</div>;
}

function Card({ children, delay, prog }: { children: React.ReactNode; delay: number; prog: number }) {
  const show = clamp01((prog * 13.5 - delay) * 1.2);
  return (
    <div
      className="glass rounded-xl px-4 py-3 text-base text-slate-200"
      style={{ opacity: show, transform: `translateY(${(1 - show) * 14}px)`, transition: "none" }}
    >
      {children}
    </div>
  );
}

function Bolla({ in: entrante, children }: { in?: boolean; children: React.ReactNode }) {
  return (
    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${entrante ? "rounded-bl-sm bg-white/8 text-slate-100" : "ml-auto rounded-br-sm bg-cyan-500/20 text-cyan-50"}`}>{children}</div>
  );
}

function Evidenzia({ x, y, w, h, label, alert }: { x: string; y: string; w: number; h: number; label: string; alert?: boolean }) {
  const c = alert ? "#fbbf24" : "#22d3ee";
  return (
    <div className="absolute" style={{ left: x, top: y, width: w, height: h, transform: "translate(-50%,-50%)" }}>
      <div className="h-full w-full rounded-lg" style={{ border: `2px solid ${c}`, boxShadow: `0 0 18px ${c}66` }} />
      <span className="absolute -top-6 left-0 rounded bg-black/60 px-2 py-0.5 text-xs" style={{ color: c }}>{label}</span>
    </div>
  );
}

// Sottotitoli = copione voce narrante / battute di ORION, cronometrati (ms).
const CAPTIONS: { start: number; end: number; text: string }[] = [
  { start: 2200, end: 9000, text: "Buongiorno Simone. Prima che inizi, ci sono tre cose da sistemare." },
  { start: 26200, end: 30000, text: "Che lavoro svolge?" },
  { start: 30500, end: 37500, text: "Dottore, il paziente Rossi ha una visita stamattina. Ieri sera ha inviato nuovi esami: ho già preparato un riepilogo." },
  { start: 38200, end: 45200, text: "Domani è prevista l’udienza Rossi. Ho preparato il fascicolo con gli ultimi aggiornamenti." },
  { start: 46500, end: 54000, text: "In azienda, ogni persona col proprio codice ritrova subito il suo ruolo e il suo ambiente." },
  { start: 55500, end: 63000, text: "Non cerca solo informazioni. Ti aiuta a capire." },
  { start: 64500, end: 72000, text: "Non lavora solo sul computer. Lavora accanto a te." },
  { start: 74000, end: 85000, text: "Le tue comunicazioni, gestite con la voce. Senza toccare nulla." },
  { start: 87000, end: 99000, text: "Non imparare un nuovo software. Parla con il tuo computer." },
  { start: 100500, end: 110000, text: "La tecnologia deve adattarsi a te. Non il contrario." },
  { start: 112000, end: 122000, text: "Ogni giorno ti conosce un po’ di più." },
  { start: 137500, end: 144000, text: "Per anni abbiamo imparato ad usare i computer." },
  { start: 145500, end: 152000, text: "Forse è arrivato il momento che siano loro ad imparare a lavorare con noi." },
];
