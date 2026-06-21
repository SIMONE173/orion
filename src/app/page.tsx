"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OrionCore, type CoreState } from "@/components/OrionCore";
import { PanelStage } from "@/components/PanelStage";
import { CameraCapture } from "@/components/CameraCapture";
import { Notifiche } from "@/components/Notifiche";
import { AuthScreen } from "@/components/AuthScreen";
import { AppuntiPanel } from "@/components/AppuntiPanel";
import { DocumentoViewer, type DocVisore } from "@/components/DocumentoViewer";
import { scaricaTestoPdf } from "@/components/panels/pdf";
import { useSpeech } from "@/components/useSpeech";
import { useSnapToggle } from "@/components/useSnapToggle";
import { useClapWake } from "@/components/useClapWake";
import { IconMic, IconKeyboard, IconDoc, IconClose, IconSound, IconMute, IconChat, IconLogout } from "@/components/icons";
import type { Vista, Azione } from "@/lib/orion/views";

type Msg = { role: "user" | "assistant"; content: string };

type StatoAbb = {
  configurato: boolean;
  stato: "demo" | "prova" | "attivo" | "scaduto" | "annullato";
  inProva: boolean;
  giorniProvaRimasti: number;
  attivo: boolean;
  accessoConsentito: boolean;
  periodoFine: string | null;
};

type EsitoOS = { ok: boolean; nome?: string; app?: string; errore?: string };
type OrionDesktop = {
  versione: string;
  piattaforma: string;
  apriFile: (q: string) => Promise<EsitoOS>;
  cestina: (q: string) => Promise<EsitoOS>;
  apriApp: (n: string) => Promise<EsitoOS>;
};
declare global {
  interface Window {
    orionDesktop?: OrionDesktop;
  }
}

const desktopBridge = (): OrionDesktop | null =>
  typeof window !== "undefined" && window.orionDesktop ? window.orionDesktop : null;

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [viste, setViste] = useState<Vista[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasKey, setHasKey] = useState(true);
  const [testoInput, setTestoInput] = useState("");
  const [modoTesto, setModoTesto] = useState(false);
  const [mostraStorico, setMostraStorico] = useState(false);
  const [mostraCamera, setMostraCamera] = useState(false);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [notifica, setNotifica] = useState<{ testo: string; cliente: string } | null>(null);
  const [autenticato, setAutenticato] = useState<boolean | null>(null);
  const [abbonamento, setAbbonamento] = useState<StatoAbb | null>(null);
  const [appunti, setAppunti] = useState<{ titolo: string; cliente_id: number | null; testo: string } | null>(null);
  const [appuntiStato, setAppuntiStato] = useState<"idle" | "salvando" | "salvato">("idle");
  const [docView, setDocView] = useState<{ doc: DocVisore; zoom: number; cerca: string } | null>(null);
  const [standby, setStandby] = useState(false);
  const standbyDa = useRef<string>(new Date().toISOString());
  const ultimaAttivita = useRef<number>(Date.now());

  const avviato = useRef(false);
  const salutato = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ultimoCheck = useRef<string>(new Date().toISOString());
  const messaggiVisti = useRef<Set<number>>(new Set());

  const ultimoAssistente = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";

  const inviaAOrion = useCallback(
    async (testo?: string, avvio = false, allegato?: string) => {
      setLoading(true);
      cancelSpeakRef.current?.();

      const storico: Msg[] = testo ? [...messagesRef.current, { role: "user", content: testo }] : messagesRef.current;
      if (testo) setMessages(storico);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: storico,
            avvio,
            allegato: allegato ? { dataUrl: allegato } : undefined,
            desktop: !!desktopBridge(),
          }),
        });
        const data: { testo: string; viste: Vista[]; azioni?: Azione[]; errore?: string } =
          await res.json();

        if (data.errore === "no_key") {
          setHasKey(false);
          setAvviso(null);
        } else if (data.errore === "credito" || data.errore === "auth") {
          setAvviso(data.testo);
        } else if (!data.errore) {
          setAvviso(null);
        }
        if (data.testo) {
          setMessages((m) => [...m, { role: "assistant", content: data.testo }]);
          speakRef.current?.(data.testo);
        }
        if (Array.isArray(data.viste) && data.viste.length) setViste(data.viste);
        if (Array.isArray(data.azioni)) data.azioni.forEach((a) => eseguiAzioneRef.current?.(a));
      } catch {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "Connessione interrotta. Riprova." },
        ]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Tieni i riferimenti aggiornati per evitare closure stantie nel callback vocale.
  const messagesRef = useRef<Msg[]>(messages);
  messagesRef.current = messages;
  const appuntiRef = useRef(appunti);
  appuntiRef.current = appunti;
  // Router della voce: in modalità appunti la dettatura va agli appunti, altrimenti a ORION.
  const gestisciVoceRef = useRef<(t: string) => void>(() => {});

  const { supported, listening, speaking, interim, voiceOn, setVoiceOn, speak, cancelSpeak, micAttivo, toggleMic, setBusy } =
    useSpeech((t) => gestisciVoceRef.current(t));

  const speakRef = useRef(speak);
  speakRef.current = speak;
  const cancelSpeakRef = useRef(cancelSpeak);
  cancelSpeakRef.current = cancelSpeak;
  const micAttivoRef = useRef(micAttivo);
  micAttivoRef.current = micAttivo;
  const standbyRef = useRef(standby);
  standbyRef.current = standby;
  const occupatoRef = useRef(false);
  occupatoRef.current = loading || speaking;
  const docViewRef = useRef(docView);
  docViewRef.current = docView;
  const nomeUtenteRef = useRef<string | null>(null);

  // Entrando in modalità appunti, accendo il microfono (così si detta subito).
  const appuntiAperti = !!appunti;
  useEffect(() => {
    if (appuntiAperti && supported && !micAttivoRef.current) toggleMic();
  }, [appuntiAperti, supported, toggleMic]);

  // Esegue le azioni che ORION comanda sullo schermo (apri sito, appunti, foto…).
  const eseguiAzione = useCallback((a: Azione) => {
    switch (a.tipo) {
      case "apri_url":
        if (a.url) window.open(a.url, "_blank", "noopener,noreferrer");
        break;
      case "modalita_appunti":
        setAppuntiStato("idle");
        setAppunti({ titolo: a.titolo ?? "Appunti", cliente_id: a.cliente_id ?? null, testo: "" });
        break;
      case "apri_documento":
        fetch(`/api/documento?id=${a.documento_id}`)
          .then((r) => r.json())
          .then((d) => {
            if (d?.ok) setDocView({ doc: d.documento as DocVisore, zoom: 1, cerca: a.cerca ?? "" });
          })
          .catch(() => {});
        break;
      case "zoom_documento":
        setDocView((v) =>
          v
            ? {
                ...v,
                zoom:
                  a.verso === "reset"
                    ? 1
                    : Math.min(4, Math.max(0.5, +(v.zoom + (a.verso === "avvicina" ? 0.4 : -0.4)).toFixed(2))),
              }
            : v
        );
        break;
      case "cerca_documento":
        setDocView((v) => (v ? { ...v, cerca: a.testo } : v));
        break;
      case "riposo":
        entraStandbyRef.current?.();
        break;
      case "apri_file": {
        const d = desktopBridge();
        if (!d) {
          speakRef.current?.("Aprire i file del tuo computer è una cosa che posso fare con ORION Desktop, l'app da scaricare.");
          break;
        }
        d.apriFile(a.query).then((r) => {
          if (!r.ok) speakRef.current?.(`Non ho trovato un file chiamato ${a.query}.`);
        });
        break;
      }
      case "cestina_file": {
        const d = desktopBridge();
        if (!d) {
          speakRef.current?.("Cestinare i file del computer è possibile con ORION Desktop.");
          break;
        }
        d.cestina(a.query).then((r) => {
          speakRef.current?.(r.ok ? `Fatto, ho spostato ${r.nome} nel cestino.` : `Non ho trovato ${a.query}.`);
        });
        break;
      }
      case "apri_app": {
        const d = desktopBridge();
        if (!d) {
          speakRef.current?.("Aprire le app del computer è possibile con ORION Desktop.");
          break;
        }
        d.apriApp(a.nome).then((r) => {
          if (!r.ok) speakRef.current?.(`Non sono riuscito ad aprire ${a.nome}.`);
        });
        break;
      }
      default:
        break;
    }
  }, []);
  const eseguiAzioneRef = useRef(eseguiAzione);
  eseguiAzioneRef.current = eseguiAzione;
  const entraStandbyRef = useRef<() => void>(() => {});

  // ── Modalità appunti: dettatura, salvataggi, comandi vocali ────────────────
  const salvaAppuntiPdf = useCallback(() => {
    const a = appuntiRef.current;
    if (!a?.testo.trim()) return;
    scaricaTestoPdf(a.titolo || "Appunti", a.testo);
    speakRef.current?.("Fatto, ho salvato gli appunti in PDF.");
  }, []);

  const salvaAppuntiOrion = useCallback(async () => {
    const a = appuntiRef.current;
    if (!a?.testo.trim()) return;
    setAppuntiStato("salvando");
    try {
      const r = await fetch("/api/appunti", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titolo: a.titolo, testo: a.testo, cliente_id: a.cliente_id }),
      });
      const d = await r.json();
      setAppuntiStato(d?.ok ? "salvato" : "idle");
      if (d?.ok) speakRef.current?.("Ho salvato gli appunti su ORION.");
    } catch {
      setAppuntiStato("idle");
    }
  }, []);

  const chiudiAppunti = useCallback(() => setAppunti(null), []);

  // ── Standby (riposo) + risveglio col doppio clap ───────────────────────────
  const entraStandby = useCallback(() => {
    if (standbyRef.current) return;
    standbyDa.current = new Date().toISOString();
    cancelSpeakRef.current?.();
    if (micAttivoRef.current) toggleMic();
    setStandby(true);
  }, [toggleMic]);
  entraStandbyRef.current = entraStandby;

  const risveglia = useCallback(async () => {
    if (!standbyRef.current) return;
    setStandby(false);
    ultimaAttivita.current = Date.now();
    const nome = nomeUtenteRef.current ? `, ${nomeUtenteRef.current}` : "";
    let saluto = `Bentornato${nome}.`;
    try {
      const r = await fetch(`/api/proattiva?dopo=${encodeURIComponent(standbyDa.current)}`);
      const d = await r.json();
      const nuovi: { cliente: string }[] = Array.isArray(d?.nuoviMessaggi) ? d.nuoviMessaggi : [];
      const segn: { titolo: string }[] = Array.isArray(d?.segnalazioni) ? d.segnalazioni : [];
      if (nuovi.length === 1) saluto = `Bentornato${nome}. Mentre eri via ti ha scritto ${nuovi[0].cliente}.`;
      else if (nuovi.length > 1) saluto = `Bentornato${nome}. Mentre eri via sono arrivati ${nuovi.length} nuovi messaggi.`;
      else if (segn.length) saluto = `Bentornato${nome}. C'è una cosa da gestire: ${segn[0].titolo}.`;
    } catch {
      /* offline: saluto semplice */
    }
    speakRef.current?.(saluto);
  }, []);

  // Doppio battito di mani = risveglio dallo standby.
  useClapWake(standby, risveglia);
  // Schiocco di dita = interruttore hands-free del microfono (solo quando ORION è sveglio).
  useSnapToggle(!!autenticato && !standby, () => toggleMic());

  // Standby automatico dopo qualche minuto d'inattività (non durante voce/elaborazione/pannelli aperti).
  useEffect(() => {
    if (!autenticato) return;
    const bump = () => {
      ultimaAttivita.current = Date.now();
    };
    const eventi = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"];
    eventi.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const INATTIVITA = 3 * 60 * 1000;
    const id = setInterval(() => {
      if (standbyRef.current || occupatoRef.current || micAttivoRef.current) return;
      if (appuntiRef.current || docViewRef.current) return;
      if (Date.now() - ultimaAttivita.current > INATTIVITA) entraStandby();
    }, 15000);
    return () => {
      clearInterval(id);
      eventi.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [autenticato, entraStandby]);

  // Quando il mic è attivo in modalità appunti, la voce o detta o comanda.
  gestisciVoceRef.current = (t: string) => {
    if (!appuntiRef.current) {
      inviaAOrion(t);
      return;
    }
    const frase = t.trim();
    const low = frase.toLowerCase().replace(/[.!?]+$/, "");
    const comando = ["orion", "hey orion"].some((p) => low.startsWith(p)) ? low.replace(/^(hey )?orion[,\s]+/, "") : low;

    if (/(^|\b)(chiudi|esci|basta|fine)\b.*appunti|^(chiudi|esci|basta|fine)$/.test(comando)) {
      chiudiAppunti();
      speakRef.current?.("Chiudo gli appunti.");
      return;
    }
    if (/\bsalva\b/.test(comando) && /\bpdf\b/.test(comando)) {
      salvaAppuntiPdf();
      return;
    }
    if (/\bsalva\b/.test(comando) && /(orion|documento|client)/.test(comando)) {
      salvaAppuntiOrion();
      return;
    }
    // Altrimenti è dettatura: la aggiungo agli appunti.
    setAppunti((a) => (a ? { ...a, testo: a.testo ? `${a.testo} ${frase}` : frase } : a));
  };

  // Avvio: capisci se l'utente è già loggato (cookie di sessione).
  useEffect(() => {
    if (avviato.current) return;
    avviato.current = true;
    (async () => {
      try {
        const r = await fetch("/api/state");
        const s = await r.json();
        setHasKey(Boolean(s.hasKey));
        setAutenticato(Boolean(s.autenticato));
        nomeUtenteRef.current = s.nome || s.utente?.nome || null;
        if (s.abbonamento) setAbbonamento(s.abbonamento as StatoAbb);
      } catch {
        setAutenticato(false);
      }
    })();
  }, []);

  // Prima battuta di ORION (briefing o Chiamata 0), solo dopo l'accesso.
  useEffect(() => {
    if (autenticato && !salutato.current) {
      salutato.current = true;
      inviaAOrion(undefined, true);
    }
  }, [autenticato, inviaAOrion]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* noop */
    }
    cancelSpeakRef.current?.();
    salutato.current = false;
    setMessages([]);
    setViste([]);
    setAvviso(null);
    setAutenticato(false);
  }, []);

  const avviaCheckout = useCallback(async () => {
    try {
      const r = await fetch("/api/stripe/checkout", { method: "POST" });
      const d = await r.json();
      if (d?.ok && d.url) window.location.href = d.url;
    } catch {
      /* noop */
    }
  }, []);

  const coreState: CoreState = loading
    ? "thinking"
    : speaking
      ? "speaking"
      : listening || micAttivo
        ? "listening"
        : "idle";

  // Comunica al motore vocale quando ORION sta elaborando (così non riarma il mic durante l'attesa).
  useEffect(() => {
    setBusy(loading);
  }, [loading, setBusy]);

  // Osservazione continua: ogni 90s controlla se sono arrivati messaggi (sola lettura DB).
  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/proattiva?dopo=${encodeURIComponent(ultimoCheck.current)}`);
        const d: { nuoviMessaggi?: { id: number; cliente: string }[] } = await r.json();
        ultimoCheck.current = new Date().toISOString();
        const nuovi = (d.nuoviMessaggi ?? []).filter((m) => !messaggiVisti.current.has(m.id));
        if (nuovi.length) {
          nuovi.forEach((m) => messaggiVisti.current.add(m.id));
          const primo = nuovi[0];
          setNotifica({
            testo: nuovi.length === 1 ? `${primo.cliente} ha risposto` : `${nuovi.length} nuovi messaggi`,
            cliente: primo.cliente,
          });
        }
      } catch {
        /* offline o errore: si riprova al prossimo giro */
      }
    };
    const id = setInterval(tick, 90000);
    return () => clearInterval(id);
  }, []);

  const inviaTesto = (e: React.FormEvent) => {
    e.preventDefault();
    const t = testoInput.trim();
    if (!t || loading) return;
    setTestoInput("");
    inviaAOrion(t);
  };

  const catturaDocumento = (dataUrl: string) => {
    setMostraCamera(false);
    inviaAOrion("Digitalizza questo documento e proponi dove archiviarlo.", false, dataUrl);
  };

  const sottotitolo = interim
    ? interim
    : loading
      ? "…"
      : ultimoAssistente;

  const haPannelli = viste.length > 0;

  // Gate d'accesso: in attesa → splash; non loggato → schermata accesso.
  if (autenticato === null) {
    return (
      <main className="grid h-screen place-items-center">
        <OrionCore state="thinking" size={120} />
      </main>
    );
  }
  if (!autenticato) {
    return <AuthScreen onAuth={() => setAutenticato(true)} />;
  }

  // Paywall: solo se Stripe è attivo E l'accesso non è consentito (prova scaduta,
  // niente abbonamento). In modalità demo (Stripe spento) non blocca nulla.
  if (abbonamento?.configurato && !abbonamento.accessoConsentito) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
        <div className="fade-in w-full max-w-md text-center">
          <OrionCore state="idle" size={110} />
          <h1 className="mt-6 text-2xl font-semibold text-slate-50">La prova è terminata</h1>
          <p className="mt-3 text-slate-300">
            Spero che ORION ti sia stato utile in questi giorni. Attiva l&apos;abbonamento per
            continuare ad averlo al tuo fianco — agenda, clienti, promemoria e tutto il resto.
          </p>
          <button
            onClick={avviaCheckout}
            className="mt-7 w-full rounded-xl bg-cyan-500/90 px-6 py-3.5 font-medium text-slate-900 transition hover:bg-cyan-400"
          >
            Attiva l&apos;abbonamento
          </button>
          <button
            onClick={logout}
            className="mt-3 text-sm text-slate-500 hover:text-slate-300"
          >
            Esci
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="size-2 rounded-full bg-cyan-400 shadow-[0_0_10px] shadow-cyan-400/70" />
          <span className="text-sm font-semibold tracking-[0.35em] text-slate-200">ORION</span>
        </div>
        <div className="flex items-center gap-2">
          <Notifiche />
          <button
            onClick={() => setVoiceOn(!voiceOn)}
            className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            title={voiceOn ? "Disattiva voce" : "Attiva voce"}
          >
            {voiceOn ? <IconSound className="h-4 w-4" /> : <IconMute className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setMostraStorico((v) => !v)}
            className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            title="Conversazione"
          >
            <IconChat className="h-4 w-4" />
          </button>
          <button
            onClick={logout}
            className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            title="Esci"
          >
            <IconLogout className="h-4 w-4" />
          </button>
        </div>
      </header>

      {!hasKey && (
        <div className="mx-5 mb-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
          Manca <code className="font-mono">ANTHROPIC_API_KEY</code>. Aggiungila in{" "}
          <code className="font-mono">.env.local</code> e riavvia per dare un cervello a ORION.
        </div>
      )}

      {hasKey && avviso && (
        <div className="mx-5 mb-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm text-rose-200">
          {avviso}
        </div>
      )}

      {/* Stage */}
      <section className="relative min-h-0 flex-1 px-5">
        {haPannelli ? (
          <div className="fade-in relative h-full pb-2">
            <button
              onClick={() => setViste([])}
              className="absolute -top-1 right-0 z-10 grid size-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
              title="Chiudi e torna a ORION"
            >
              <IconClose className="h-4 w-4" />
            </button>
            <PanelStage viste={viste} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-7">
            <OrionCore
              state={coreState}
              size={260}
              onClick={toggleMic}
              title={micAttivo ? "Microfono attivo — tocca per mutare" : "Tocca per attivare il microfono"}
            />
            <div className="max-w-2xl px-6 text-center">
              <p className="min-h-[2.5rem] text-lg leading-relaxed text-slate-200">{sottotitolo}</p>
              {!sottotitolo && (
                <p className="text-sm text-slate-500">
                  {supported
                    ? micAttivo
                      ? "Ti ascolto… parla pure. Tocca ORION per mutare."
                      : "Tocca ORION per attivare il microfono, oppure scrivi."
                    : "Scrivi qui sotto per parlare con ORION."}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Dock */}
      <footer className="flex items-center gap-4 px-5 py-4">
        {haPannelli && (
          <button
            onClick={toggleMic}
            className="shrink-0"
            aria-label="Microfono ORION"
            title={micAttivo ? "Microfono attivo — tocca per mutare" : "Tocca per attivare il microfono"}
          >
            <OrionCore state={coreState} size={64} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          {haPannelli && sottotitolo && (
            <p className="mb-2 truncate text-sm text-slate-300">
              <span className="text-cyan-300/70">{listening ? "" : "ORION: "}</span>
              {sottotitolo}
            </p>
          )}

          {modoTesto || !supported ? (
            <form onSubmit={inviaTesto} className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={testoInput}
                onChange={(e) => setTestoInput(e.target.value)}
                placeholder="Scrivi a ORION…"
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
                autoFocus
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-cyan-500/90 px-5 py-3 font-medium text-slate-900 hover:bg-cyan-400 disabled:opacity-50"
              >
                Invia
              </button>
              <button
                type="button"
                onClick={() => setMostraCamera(true)}
                className="grid shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-slate-300 hover:bg-white/10"
                title="Digitalizza documento"
              >
                <IconDoc />
              </button>
              {supported && (
                <button
                  type="button"
                  onClick={() => setModoTesto(false)}
                  className="grid shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-slate-300 hover:bg-white/10"
                  title="Torna alla voce"
                >
                  <IconMic />
                </button>
              )}
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={toggleMic}
                title={micAttivo ? "Tocca per mutare" : "Tocca per parlare"}
                className={`flex items-center gap-2.5 rounded-xl border px-5 py-3 font-medium transition ${
                  micAttivo
                    ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-200"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                {micAttivo ? (
                  <span className="size-2.5 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_8px] shadow-cyan-300" />
                ) : (
                  <IconMic className="h-5 w-5" />
                )}
                <span>{micAttivo ? (listening ? "In ascolto…" : "Mic attivo") : "Parla"}</span>
              </button>
              <button
                onClick={() => {
                  setModoTesto(true);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className="grid place-items-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-300 hover:bg-white/10"
                title="Scrivi"
              >
                <IconKeyboard />
              </button>
              <button
                onClick={() => setMostraCamera(true)}
                className="grid place-items-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-300 hover:bg-white/10"
                title="Digitalizza documento"
              >
                <IconDoc />
              </button>
            </div>
          )}
        </div>
      </footer>

      {/* Storico conversazione (overlay) */}
      {mostraStorico && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setMostraStorico(false)}
        >
          <div
            className="glass absolute right-0 top-0 flex h-full w-full max-w-md flex-col p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-slate-100">Conversazione</h3>
              <button
                onClick={() => setMostraStorico(false)}
                className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-auto pr-1">
              {messages.length === 0 && <p className="text-sm text-slate-500">Ancora niente.</p>}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                    m.role === "user"
                      ? "ml-auto rounded-br-sm bg-cyan-500/20 text-cyan-50"
                      : "rounded-bl-sm bg-white/8 text-slate-100"
                  }`}
                >
                  {m.content}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {notifica && (
        <div className="fade-in fixed left-1/2 top-16 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3.5 py-2.5 text-sm text-cyan-50 shadow-lg backdrop-blur">
          <span className="size-2 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_8px] shadow-cyan-300" />
          <button
            onClick={() => {
              inviaAOrion(`Mostra i messaggi di ${notifica.cliente}`);
              setNotifica(null);
            }}
            className="font-medium hover:underline"
          >
            {notifica.testo} — tocca per vedere
          </button>
          <button onClick={() => setNotifica(null)} className="text-cyan-200/60 hover:text-cyan-100">
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {mostraCamera && (
        <CameraCapture onCapture={catturaDocumento} onClose={() => setMostraCamera(false)} />
      )}

      {appunti && (
        <AppuntiPanel
          titolo={appunti.titolo}
          testo={appunti.testo}
          interim={interim}
          ascolto={micAttivo}
          stato={appuntiStato}
          onChange={(t) => setAppunti((a) => (a ? { ...a, testo: t } : a))}
          onPdf={salvaAppuntiPdf}
          onSalva={salvaAppuntiOrion}
          onChiudi={chiudiAppunti}
        />
      )}

      {docView && (
        <DocumentoViewer
          documento={docView.doc}
          zoom={docView.zoom}
          cerca={docView.cerca}
          onZoom={(verso) =>
            setDocView((v) =>
              v
                ? {
                    ...v,
                    zoom:
                      verso === "reset"
                        ? 1
                        : Math.min(4, Math.max(0.5, +(v.zoom + (verso === "avvicina" ? 0.4 : -0.4)).toFixed(2))),
                  }
                : v
            )
          }
          onCerca={(t) => setDocView((v) => (v ? { ...v, cerca: t } : v))}
          onClose={() => setDocView(null)}
        />
      )}

      {standby && (
        <div
          onClick={risveglia}
          className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-7 bg-black/85 backdrop-blur-md"
        >
          <div className="opacity-70">
            <OrionCore state="idle" size={150} />
          </div>
          <div className="text-center">
            <p className="text-lg text-slate-300">ORION è in pausa</p>
            <p className="mt-1.5 text-sm text-slate-500">
              Batti le mani due volte 👏 👏 — o tocca lo schermo — per riprendere
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
