"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OrionCore, type CoreState } from "@/components/OrionCore";
import { PanelStage } from "@/components/PanelStage";
import { CameraCapture } from "@/components/CameraCapture";
import { useSpeech } from "@/components/useSpeech";
import { IconMic, IconKeyboard, IconDoc, IconClose, IconSound, IconMute, IconChat } from "@/components/icons";
import type { Vista } from "@/lib/orion/views";

type Msg = { role: "user" | "assistant"; content: string };

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

  const avviato = useRef(false);
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
          }),
        });
        const data: { testo: string; viste: Vista[]; errore?: string } = await res.json();

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

  const { supported, listening, speaking, interim, voiceOn, setVoiceOn, speak, cancelSpeak, micAttivo, toggleMic, setBusy } =
    useSpeech((t) => inviaAOrion(t));

  const speakRef = useRef(speak);
  speakRef.current = speak;
  const cancelSpeakRef = useRef(cancelSpeak);
  cancelSpeakRef.current = cancelSpeak;

  // Avvio: stato + prima battuta di ORION (briefing oppure Chiamata 0).
  useEffect(() => {
    if (avviato.current) return;
    avviato.current = true;
    (async () => {
      try {
        const r = await fetch("/api/state");
        const s = await r.json();
        setHasKey(Boolean(s.hasKey));
      } catch {
        /* noop */
      }
      inviaAOrion(undefined, true);
    })();
  }, [inviaAOrion]);

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

  return (
    <main className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="size-2 rounded-full bg-cyan-400 shadow-[0_0_10px] shadow-cyan-400/70" />
          <span className="text-sm font-semibold tracking-[0.35em] text-slate-200">ORION</span>
        </div>
        <div className="flex items-center gap-2">
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
    </main>
  );
}
