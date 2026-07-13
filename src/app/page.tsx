"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OrionCore, type CoreState } from "@/components/OrionCore";
import { NOVITA } from "@/lib/novita";

// ──────────────────────────────────────────────────────────────────────────
// LA VETRINA DI ORION — https://…/  (l'app vive su /app)
// Cielo stellato interattivo con la costellazione di Orione, il nucleo in 3D
// che segue il mouse, la voce che dà il benvenuto ("Bentornato, X" se sei già
// dei nostri), le novità che scorrono, download Mac/Windows e accesso web.
// Il desktop (Electron) apre questa radice: il bridge lo riconosce e lo porta
// dritto all'app senza far vedere la vetrina.
// ──────────────────────────────────────────────────────────────────────────

// La costellazione di Orione (coordinate relative nel riquadro del cielo):
// Betelgeuse, Bellatrix, la cintura (Alnitak-Alnilam-Mintaka), Saiph, Rigel.
const ORIONE = [
  { x: 0.38, y: 0.16, r: 2.6 }, // Betelgeuse
  { x: 0.66, y: 0.2, r: 2.2 }, // Bellatrix
  { x: 0.44, y: 0.48, r: 2.0 }, // Alnitak
  { x: 0.52, y: 0.5, r: 2.0 }, // Alnilam
  { x: 0.6, y: 0.52, r: 2.0 }, // Mintaka
  { x: 0.42, y: 0.82, r: 2.1 }, // Saiph
  { x: 0.68, y: 0.86, r: 2.7 }, // Rigel
];
const LINEE_ORIONE = [
  [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6],
];

export default function Vetrina() {
  const cieloRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const [core, setCore] = useState<CoreState>("idle");
  const [nome, setNome] = useState<string | null>(null);
  const [autenticato, setAutenticato] = useState(false);
  const [voceOn, setVoceOn] = useState(true);
  const [scaricabili, setScaricabili] = useState<{ mac: boolean; win: boolean }>({ mac: false, win: false });
  const salutato = useRef(false);
  const voceOnRef = useRef(true);
  voceOnRef.current = voceOn;

  // Il desktop non deve vedere la vetrina: dritto all'app.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).orionDesktop) window.location.replace("/app");
  }, []);

  // Chi sei? (per il "Bentornato, X" e il pulsante giusto)
  useEffect(() => {
    fetch("/api/state")
      .then((r) => r.json())
      .then((s) => {
        setAutenticato(Boolean(s.autenticato));
        if (s.autenticato && (s.nome || s.utente?.nome)) setNome(String(s.nome || s.utente?.nome));
      })
      .catch(() => {});
    fetch("/api/scarica/stato")
      .then((r) => r.json())
      .then((s) => setScaricabili({ mac: Boolean(s.mac), win: Boolean(s.win) }))
      .catch(() => {});
    try {
      setVoceOn(localStorage.getItem("orion-sito-voce") !== "no");
    } catch {}
  }, []);

  // ── La voce di ORION ────────────────────────────────────────────────────
  const parla = useCallback((testo: string) => {
    if (!voceOnRef.current || !("speechSynthesis" in window)) return;
    const vs = window.speechSynthesis.getVoices().filter((v) => (v.lang ?? "").toLowerCase().startsWith("it"));
    const u = new SpeechSynthesisUtterance(testo);
    u.lang = "it-IT";
    const scelta = vs.find((v) => v.name.toLowerCase().includes("alice")) || vs.find((v) => v.name.toLowerCase().includes("google")) || vs[0];
    if (scelta) u.voice = scelta;
    u.rate = 1.02;
    u.onstart = () => setCore("speaking");
    u.onend = () => setCore("idle");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, []);

  const benvenuto = useCallback(() => {
    if (salutato.current) return;
    salutato.current = true;
    parla(nome ? `Bentornato, ${nome}.` : "Benvenuto. Io sono ORION.");
  }, [nome, parla]);

  // Prova subito (dove il browser lo consente); altrimenti al primo tocco/scroll.
  useEffect(() => {
    const t = setTimeout(benvenuto, 1200);
    const su = () => benvenuto();
    window.addEventListener("pointerdown", su, { once: true });
    window.addEventListener("scroll", su, { once: true, passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", su);
      window.removeEventListener("scroll", su);
    };
  }, [benvenuto]);

  // ── Il cielo: stelle con profondità + Orione, tutto segue il mouse ──────
  useEffect(() => {
    const cv = cieloRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const ridotto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let vivo = true;
    let raf = 0;
    const mouse = { x: 0.5, y: 0.5 };
    const lerp = { x: 0.5, y: 0.5 };
    let W = 0, H = 0, DPR = 1;

    type Stella = { x: number; y: number; z: number; r: number; f: number };
    let stelle: Stella[] = [];
    const semina = () => {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * DPR; cv.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const n = Math.min(420, Math.round((W * H) / 3800));
      stelle = Array.from({ length: n }, () => ({
        x: Math.random(), y: Math.random(),
        z: 0.15 + Math.random() * 0.85,
        r: 0.4 + Math.random() * 1.3,
        f: Math.random() * Math.PI * 2,
      }));
    };
    semina();

    const suMouse = (e: PointerEvent) => {
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = e.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", suMouse, { passive: true });
    window.addEventListener("resize", semina);

    // Il riquadro di Orione: a destra del centro, alto quanto mezzo schermo.
    const disegna = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      lerp.x += (mouse.x - lerp.x) * 0.06;
      lerp.y += (mouse.y - lerp.y) * 0.06;
      const px = (lerp.x - 0.5) * 2; // -1..1
      const py = (lerp.y - 0.5) * 2;

      for (const s of stelle) {
        const deriva = ridotto ? 0 : t * 0.0000045;
        const sx = ((s.x + deriva * s.z) % 1) * W - px * 26 * s.z;
        const sy = s.y * H - py * 18 * s.z;
        const brillio = ridotto ? 0.65 : 0.45 + 0.55 * Math.abs(Math.sin(t * 0.0006 * s.z + s.f));
        ctx.globalAlpha = 0.25 + 0.55 * s.z * brillio;
        ctx.fillStyle = s.z > 0.75 ? "#cfeef7" : "#7f9bb3";
        ctx.beginPath();
        ctx.arc(sx, sy, s.r * s.z, 0, Math.PI * 2);
        ctx.fill();
      }

      // Orione, la firma nel cielo: più vicino di tutto, si muove più di tutto.
      const bx = W * 0.62 - px * 42;
      const by = H * 0.1 - py * 30;
      const bw = Math.min(W * 0.3, 380);
      const bh = Math.min(H * 0.62, 520);
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "rgba(56,232,255,0.35)";
      ctx.lineWidth = 1;
      for (const [a, b] of LINEE_ORIONE) {
        ctx.beginPath();
        ctx.moveTo(bx + ORIONE[a].x * bw, by + ORIONE[a].y * bh);
        ctx.lineTo(bx + ORIONE[b].x * bw, by + ORIONE[b].y * bh);
        ctx.stroke();
      }
      for (const p of ORIONE) {
        const pulse = ridotto ? 0.8 : 0.6 + 0.4 * Math.abs(Math.sin(t * 0.0011 + p.x * 9));
        ctx.globalAlpha = pulse;
        ctx.fillStyle = "#8ef0ff";
        ctx.shadowColor = "#38e8ff";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(bx + p.x * bw, by + p.y * bh, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      // Il nucleo si inclina verso il mouse (3D vero, morbido).
      if (tiltRef.current) {
        tiltRef.current.style.transform = `perspective(900px) rotateY(${px * 10}deg) rotateX(${-py * 8}deg)`;
      }
      if (vivo && !ridotto) raf = requestAnimationFrame(disegna);
    };
    if (ridotto) disegna(0);
    else raf = requestAnimationFrame(disegna);

    return () => {
      vivo = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", suMouse);
      window.removeEventListener("resize", semina);
    };
  }, []);

  // Le sezioni sbocciano quando entrano nello schermo (riusa .reveal dei pannelli).
  useEffect(() => {
    const io = new IntersectionObserver(
      (voci) => voci.forEach((v) => v.isIntersecting && (v.target.classList.add("reveal"), io.unobserve(v.target))),
      { threshold: 0.05, rootMargin: "0px 0px 12% 0px" }
    );
    document.querySelectorAll("[data-sboccia]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Le card si inclinano sotto il mouse (l'effetto "lo tocchi con gli occhi").
  const inclina = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${x * 10}deg) rotateX(${-y * 8}deg) translateY(-4px)`;
  };
  const raddrizza = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = "";
  };

  const toggleVoce = () => {
    const nuovo = !voceOn;
    setVoceOn(nuovo);
    try {
      localStorage.setItem("orion-sito-voce", nuovo ? "si" : "no");
    } catch {}
    if (!nuovo) window.speechSynthesis?.cancel();
  };

  const FUNZIONI = [
    { icona: "🗓", titolo: "Un'agenda che si difende da sola", testo: "Prenota, conferma, ricorda ai clienti l'appuntamento e riempie i buchi offrendo gli slot liberati alla lista d'attesa. Tu parli, lei lavora." },
    { icona: "🏢", titolo: "Il tuo team, dentro", testo: "Codice aziendale per i collaboratori, permessi veri per ruolo, messaggi fra colleghi consegnati a voce, approvazioni che viaggiano da sole e il giornale di bordo della giornata." },
    { icona: "🔗", titolo: "Si aggancia ai tuoi strumenti", testo: "Il gestionale che usi resta: ORION lo capisce, ne riceve i dati e ci scrive dentro — appuntamenti e clienti arrivano anche nel tuo software, firmati. Google Calendar a due vie." },
    { icona: "🛡", titolo: "Una fortezza per i tuoi dati", testo: "Credenziali cifrate, aree riservate per ruolo, backup cifrati fuori sede ogni notte con ripristino collaudato. La riservatezza non è una promessa: è applicata nel codice." },
    { icona: "🖥", titolo: "Tutto il computer, a voce", testo: "Sul desktop apre le app, trova i file, stampa davvero ('stampami l'agenda di domani'), guarda lo schermo per affiancarti sul tuo software e obbedisce anche ai gesti delle mani." },
    { icona: "🎨", titolo: "Il tuo ORION, su misura", testo: "Digli 'mettimi rosso Ferrari' e tutta l'interfaccia si trasforma con un'onda di colore. Ogni professionista ha il suo ORION: colori, briefing e modi su misura." },
  ];

  return (
    <div className="sito">
      {/* Il cielo */}
      <canvas ref={cieloRef} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0 }} />

      {/* Barra alta */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <OrionCore state="idle" size={30} />
          <span style={{ letterSpacing: "0.35em", fontWeight: 700, fontSize: 14 }}>ORION</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={toggleVoce} title={voceOn ? "Voce attiva" : "Voce spenta"} className="glass bottone-tondo">
            {voceOn ? "🔊" : "🔇"}
          </button>
          <a href="/app" className="glass cta-mini">{autenticato ? "Entra" : "Accedi"}</a>
        </div>
      </header>

      {/* ── HERO ── */}
      <section ref={heroRef} style={{ position: "relative", zIndex: 5, minHeight: "100svh", display: "grid", placeItems: "center", padding: "90px 20px 40px" }}>
        <div style={{ textAlign: "center", maxWidth: 900 }}>
          <div ref={tiltRef} style={{ display: "grid", placeItems: "center", transition: "transform 0.08s linear", willChange: "transform", marginBottom: 26 }}>
            <OrionCore state={core} size={250} onClick={benvenuto} title="Tocca: ORION ti saluta" />
          </div>
          <h1 style={{ fontSize: "clamp(42px, 8vw, 84px)", letterSpacing: "0.28em", fontWeight: 700, margin: 0 }}>ORION</h1>
          <p style={{ fontSize: "clamp(17px, 2.6vw, 24px)", color: "#bfe9f5", margin: "14px 0 6px" }}>
            {nome ? `Bentornato, ${nome}.` : "Il primo Sistema Operativo Conversazionale."}
          </p>
          <p style={{ color: "#8aa8b8", maxWidth: 640, margin: "0 auto", fontSize: 15.5 }}>
            Non impari a usarlo: <b>gli parli</b>. Agenda, clienti, fatture, team e il tuo gestionale — una segretaria
            operativa che lavora davvero, 24 ore su 24.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
            <a href="/app" className="cta-primaria">{autenticato ? "Entra in ORION" : "Inizia — è tuo in 2 minuti"}</a>
            <a href="#funzioni" className="glass cta-secondaria">Guarda cosa fa</a>
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", color: "#5b7484", fontSize: 22, animation: "sitoGiu 1.8s ease-in-out infinite" }}>⌄</div>
      </section>

      {/* ── NOVITÀ che scorrono ── */}
      <section style={{ position: "relative", zIndex: 5, padding: "0 0 10px" }}>
        <div className="glass" style={{ overflow: "hidden", borderRadius: 14, margin: "0 18px", padding: "10px 0" }}>
          <div className="nastro">
            {[...NOVITA, ...NOVITA].map((n, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "0 34px", whiteSpace: "nowrap", color: "#a9cbd8", fontSize: 14 }}>
                <span style={{ color: "#38e8ff", fontWeight: 700 }}>●</span>
                <span style={{ color: "#6b8b9b" }}>{n.data.slice(8, 10)}/{n.data.slice(5, 7)}</span> {n.testo}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── GLI PARLI E BASTA ── */}
      <section data-sboccia style={{ position: "relative", zIndex: 5, padding: "90px 20px 30px", maxWidth: 980, margin: "0 auto", opacity: 0 }}>
        <h2 className="titolo-sezione">Niente menu. Niente manuali. Gli parli.</h2>
        <div style={{ display: "grid", gap: 14, marginTop: 26 }}>
          {[
            ["“Segnami la signora Bianchi martedì alle 15.”", "Prenotata, cliente in scheda, conferma via WhatsApp in partenza — e finisce anche nel tuo gestionale."],
            ["“Di' a Marco che il fornitore arriva alle 8.”", "Marco riceve la notifica e ORION glielo riferisce a voce appena apre, col buongiorno."],
            ["“Quanto ho incassato questo mese?”", "Risposta a voce e grafico a schermo. E se lo chiede chi non è autorizzato: «È riservato al titolare.»"],
          ].map(([dici, fa], i) => (
            <div key={i} className="glass" style={{ borderRadius: 16, padding: "18px 20px", display: "grid", gap: 6 }}>
              <span style={{ color: "#e8fbff", fontSize: "clamp(16px,2.4vw,19px)", fontWeight: 600 }}>{dici}</span>
              <span style={{ color: "#8fb2c2", fontSize: 14.5 }}>{fa}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── FUNZIONI ── */}
      <section id="funzioni" data-sboccia style={{ position: "relative", zIndex: 5, padding: "70px 20px", maxWidth: 1120, margin: "0 auto", opacity: 0 }}>
        <h2 className="titolo-sezione">Cosa fa, davvero</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 26 }}>
          {FUNZIONI.map((f) => (
            <div key={f.titolo} className="glass carta" onMouseMove={inclina} onMouseLeave={raddrizza}>
              <div style={{ fontSize: 30 }}>{f.icona}</div>
              <h3 style={{ margin: "10px 0 8px", fontSize: 18, color: "#dff6fc" }}>{f.titolo}</h3>
              <p style={{ margin: 0, color: "#8fb2c2", fontSize: 14.5, lineHeight: 1.55 }}>{f.testo}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── COME SI COMINCIA ── */}
      <section data-sboccia style={{ position: "relative", zIndex: 5, padding: "70px 20px", maxWidth: 980, margin: "0 auto", opacity: 0 }}>
        <h2 className="titolo-sezione">Si comincia parlando</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 26 }}>
          {[
            ["1", "Crea l'account", "Email e password, trenta secondi. Funziona nel browser, e se vuoi anche installato su Mac e Windows."],
            ["2", "La Chiamata 0", "ORION si presenta e ti intervista: che lavoro fai, come lavori, che software usi già. Da solo, a voce."],
            ["3", "Lavorate insieme", "Da quel momento conosce il tuo studio o la tua azienda — e ogni giorno lo conosce meglio."],
          ].map(([n, t, d]) => (
            <div key={n} className="glass" style={{ borderRadius: 16, padding: "22px 20px" }}>
              <div style={{ width: 34, height: 34, borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(56,232,255,0.12)", color: "#38e8ff", fontWeight: 700 }}>{n}</div>
              <h3 style={{ margin: "12px 0 8px", fontSize: 17, color: "#dff6fc" }}>{t}</h3>
              <p style={{ margin: 0, color: "#8fb2c2", fontSize: 14.5, lineHeight: 1.55 }}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── USALO ORA: WEB + DOWNLOAD ── */}
      <section id="scarica" data-sboccia style={{ position: "relative", zIndex: 5, padding: "70px 20px 90px", maxWidth: 980, margin: "0 auto", opacity: 0 }}>
        <h2 className="titolo-sezione">Prendilo con te</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 26 }}>
          <div className="glass carta" onMouseMove={inclina} onMouseLeave={raddrizza} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>🌐</div>
            <h3 style={{ margin: "10px 0 6px", color: "#dff6fc" }}>Nel browser, subito</h3>
            <p style={{ color: "#8fb2c2", fontSize: 14, margin: "0 0 16px" }}>Niente installazioni: apri e parla.</p>
            <a href="/app" className="cta-primaria" style={{ display: "inline-block" }}>Apri ORION</a>
          </div>
          <div className="glass carta" onMouseMove={inclina} onMouseLeave={raddrizza} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 34 }}></div>
            <h3 style={{ margin: "10px 0 6px", color: "#dff6fc" }}>ORION per Mac</h3>
            <p style={{ color: "#8fb2c2", fontSize: 14, margin: "0 0 16px" }}>Con i superpoteri: stampa, app, file, gesti, affiancamento.</p>
            {scaricabili.mac ? (
              <a href="/api/scarica?os=mac" className="cta-primaria" style={{ display: "inline-block" }}>Scarica per Mac</a>
            ) : (
              <span className="glass cta-secondaria" style={{ display: "inline-block", opacity: 0.7 }}>In arrivo</span>
            )}
          </div>
          <div className="glass carta" onMouseMove={inclina} onMouseLeave={raddrizza} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>🪟</div>
            <h3 style={{ margin: "10px 0 6px", color: "#dff6fc" }}>ORION per Windows</h3>
            <p style={{ color: "#8fb2c2", fontSize: 14, margin: "0 0 16px" }}>Stessa potenza, sul tuo PC.</p>
            {scaricabili.win ? (
              <a href="/api/scarica?os=win" className="cta-primaria" style={{ display: "inline-block" }}>Scarica per Windows</a>
            ) : (
              <span className="glass cta-secondaria" style={{ display: "inline-block", opacity: 0.7 }}>In arrivo</span>
            )}
          </div>
        </div>
      </section>

      {/* ── FOOTER LEGALE ── */}
      <footer style={{ position: "relative", zIndex: 5, borderTop: "1px solid rgba(255,255,255,0.08)", padding: "26px 22px", display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#6b8b9b", fontSize: 13 }}>
          <OrionCore state="idle" size={22} />
          © 2026 ORION — Il Sistema Operativo Conversazionale
        </div>
        <nav style={{ display: "flex", gap: 18, fontSize: 13.5 }}>
          <a href="/privacy" style={{ color: "#8fb2c2" }}>Privacy</a>
          <a href="/termini" style={{ color: "#8fb2c2" }}>Termini di servizio</a>
          <a href="mailto:orion@orion.app" style={{ color: "#8fb2c2" }}>Contatti</a>
        </nav>
      </footer>

      {/* Stili della vetrina */}
      <style>{`
        /* Il body resta bloccato (serve all'app): la vetrina scorre DENTRO
           il proprio contenitore a tutto schermo. */
        .sito { position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden; }
        .sito .bottone-tondo { width: 38px; height: 38px; border-radius: 999px; display: grid; place-items: center; cursor: pointer; border: 1px solid rgba(255,255,255,0.12); font-size: 15px; }
        .sito .cta-mini { padding: 9px 18px; border-radius: 999px; color: #dff6fc; font-size: 14px; border: 1px solid rgba(56,232,255,0.35); }
        .sito .cta-primaria { padding: 13px 26px; border-radius: 999px; background: linear-gradient(135deg, #17b6d4, #38e8ff); color: #04222b; font-weight: 700; font-size: 15.5px; box-shadow: 0 0 30px rgba(56,232,255,0.35); transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .sito .cta-primaria:hover { transform: translateY(-2px); box-shadow: 0 0 44px rgba(56,232,255,0.55); }
        .sito .cta-secondaria { padding: 13px 26px; border-radius: 999px; color: #bfe9f5; font-size: 15px; border: 1px solid rgba(255,255,255,0.14); }
        .sito .titolo-sezione { font-size: clamp(26px, 4.6vw, 40px); margin: 0; color: #eafcff; text-align: center; letter-spacing: 0.01em; }
        .sito .carta { border-radius: 18px; padding: 24px 22px; transition: transform 0.12s ease, border-color 0.2s ease; will-change: transform; border: 1px solid rgba(255,255,255,0.09); }
        .sito .carta:hover { border-color: rgba(56,232,255,0.35); }
        .sito .nastro { display: inline-flex; animation: sitoNastro 46s linear infinite; }
        .sito .nastro:hover { animation-play-state: paused; }
        [data-sboccia] { transition: none; }
        @keyframes sitoNastro { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes sitoGiu { 0%,100% { transform: translate(-50%, 0); opacity: 0.5; } 50% { transform: translate(-50%, 7px); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .sito .nastro { animation: none; } }
      `}</style>
    </div>
  );
}
