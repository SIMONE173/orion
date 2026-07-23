"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sttDesktopDisponibile,
  avviaAscoltoContinuo,
  fermaAscoltoContinuo,
  preparaStt,
} from "./desktopStt";

// Web Speech API: riconoscimento (STT) it-IT + sintesi (TTS).
// Microfono "a interruttore": una volta attivato resta in ascolto continuo tra
// una frase e l'altra (si riarma da solo); si disattiva = mute.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = any;

// Punteggio per scegliere la voce italiana migliore: qualità (enhanced/premium/
// siri/neural) > rete (spesso più naturale) > timbro maschile.
function punteggioVoce(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/premium|enhanced|siri|neural|natural/.test(n)) s += 100;
  if (!v.localService) s += 30;
  // nomi maschili comuni + voci maschili di macOS (eddy/reed/rocko/grandpa)
  if (/luca|cosimo|paolo|diego|carlo|roberto|marco|eddy|reed|rocko|grandpa|male|maschile|uomo/.test(n)) s += 50;
  return s;
}

export function useSpeech(onFinal: (testo: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [micAttivo, setMicAttivo] = useState(false);

  const recRef = useRef<AnyRec>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  // Filtro anti-rumore: scarta trascrizioni vuote/troppo corte o senza lettere/numeri
  // (il riconoscimento a volte produce "." o un singolo carattere su un rumore),
  // così ORION non riceve spazzatura e non risponde "non ho capito".
  const inviaTestoRef = useRef((t: string) => {
    const pulito = (t || "").trim();
    if (pulito.length < 2) return;
    if (!/[\p{L}\p{N}]/u.test(pulito)) return;
    onFinalRef.current(pulito);
  });

  const continuoRef = useRef(false); // interruttore: il mic deve restare attivo
  const speakingRef = useRef(false); // ORION sta parlando (non ascoltare: niente eco)
  const busyRef = useRef(false); // ORION sta elaborando (loading)
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0); // quando è partito l'ultimo ascolto
  const gotResult = useRef(false); // l'ascolto corrente ha prodotto qualcosa?
  const failCount = useRef(0); // fallimenti rapidi consecutivi (es. Electron senza STT)
  const usaDesktopRef = useRef(false); // dettatura offline (ORION Desktop)

  const startRec = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      startedAt.current = Date.now();
      gotResult.current = false;
      rec.start();
      setListening(true);
    } catch {
      /* già avviato */
    }
  }, []);

  // Riarma il microfono dopo una pausa/fine frase, se siamo ancora "attivi"
  // e ORION non sta né elaborando né parlando.
  const maybeRestart = useCallback(() => {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    if (!continuoRef.current) return;
    restartTimer.current = setTimeout(() => {
      if (continuoRef.current && !busyRef.current && !speakingRef.current) startRec();
    }, 500);
  }, [startRec]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // In ORION Desktop (Electron) il riconoscimento vocale del browser non esiste:
    // non lo attiviamo nemmeno → niente sfarfallio, si parte già in modalità testo.
    const isDesktop = Boolean((window as AnyRec).orionDesktop);
    const SR = isDesktop
      ? null
      : (window as AnyRec).SpeechRecognition || (window as AnyRec).webkitSpeechRecognition;
    const hasTTS = "speechSynthesis" in window;
    // Sul desktop l'STT del browser non c'è: usiamo la dettatura offline (Whisper).
    const sttDesktop = isDesktop && sttDesktopDisponibile();
    usaDesktopRef.current = sttDesktop;
    setSupported(Boolean(SR) || sttDesktop);
    if (sttDesktop) preparaStt(); // scalda il modello in anticipo

    if (SR) {
      const rec: AnyRec = new SR();
      rec.lang = "it-IT";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      rec.onresult = (e: AnyRec) => {
        gotResult.current = true; // l'STT funziona davvero
        failCount.current = 0;
        let finale = "";
        let parziale = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finale += r[0].transcript;
          else parziale += r[0].transcript;
        }
        setInterim(parziale);
        if (finale.trim()) {
          setInterim("");
          inviaTestoRef.current(finale);
        }
      };
      rec.onerror = (e: AnyRec) => {
        setListening(false);
        // Permesso negato o nessun microfono: spegni l'interruttore (niente loop di retry).
        if (["not-allowed", "service-not-allowed", "audio-capture"].includes(e?.error)) {
          continuoRef.current = false;
          setMicAttivo(false);
          if (restartTimer.current) clearTimeout(restartTimer.current);
        }
      };
      rec.onend = () => {
        setListening(false);
        setInterim("");
        // Se l'ascolto è finito SUBITO senza produrre nulla, è un fallimento
        // (tipico di Electron: nessun servizio vocale). Dopo alcuni tentativi
        // rapidi a vuoto, smetti di riprovare e passa al testo (niente sfarfallio).
        const rapido = Date.now() - startedAt.current < 1200 && !gotResult.current;
        if (rapido) {
          failCount.current += 1;
          if (failCount.current >= 3) {
            continuoRef.current = false;
            setMicAttivo(false);
            setSupported(false);
            if (restartTimer.current) clearTimeout(restartTimer.current);
            return;
          }
        } else {
          failCount.current = 0;
        }
        maybeRestart();
      };
      recRef.current = rec;
    }

    // Scegli la voce italiana migliore disponibile (qualità, poi maschile),
    // o quella salvata dall'utente; aggiorna anche l'elenco per il selettore.
    if (hasTTS) {
      const applica = () => {
        const it = window.speechSynthesis
          .getVoices()
          .filter((v) => v.lang === "it-IT" || (v.lang ?? "").toLowerCase().startsWith("it"));
        if (!it.length) return;
        const miglioreDisponibile = [...it].sort((a, b) => punteggioVoce(b) - punteggioVoce(a))[0];
        if (isDesktop) {
          // Desktop (Electron): voce scelta dall'utente = "Alice"; ripiego sulla migliore.
          voiceRef.current = it.find((v) => v.name.toLowerCase().includes("alice")) || miglioreDisponibile;
        } else {
          // Web (Chrome): "Google italiano"; ripiego sulla migliore disponibile.
          voiceRef.current = it.find((v) => v.name.toLowerCase().includes("google")) || miglioreDisponibile;
        }
      };
      applica();
      window.speechSynthesis.onvoiceschanged = applica;
    }

    return () => {
      try {
        recRef.current?.abort?.();
        window.speechSynthesis?.cancel();
        if (restartTimer.current) clearTimeout(restartTimer.current);
        fermaAscoltoContinuo();
      } catch {
        /* noop */
      }
    };
  }, [maybeRestart]);

  // Audio della voce premium (ElevenLabs) attualmente in riproduzione.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fermaAudioPremium = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      try {
        a.pause();
        a.src = "";
      } catch {
        /* noop */
      }
      audioRef.current = null;
    }
  }, []);

  const cancelSpeak = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    fermaAudioPremium();
    speakingRef.current = false;
    setSpeaking(false);
  }, [fermaAudioPremium]);

  const speak = useCallback(
    (testo: string) => {
      if (!voiceOn || !testo) return;
      if (typeof window === "undefined") return;
      // Le FACCINE non si leggono: la voce salta emoji e simboli decorativi
      // (in chat restano; ad alta voce sarebbero «faccina che sorride…»).
      testo = testo
        .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
        .replace(/\*\*/g, "")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
      if (!testo) return;
      // Stiamo per parlare: BLOCCA SUBITO il microfono per evitare l'eco.
      speakingRef.current = true;
      setSpeaking(true);
      if (restartTimer.current) clearTimeout(restartTimer.current);
      try {
        recRef.current?.abort?.();
      } catch {
        /* noop */
      }
      setListening(false);
      setInterim("");
      // Ferma qualsiasi voce precedente (browser o premium).
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* noop */
      }
      fermaAudioPremium();

      // Voce del BROWSER (fallback): sintesi locale con watchdog anti-utterance persa.
      const parlaBrowser = () => {
        if (!("speechSynthesis" in window)) {
          speakingRef.current = false;
          setSpeaking(false);
          maybeRestart();
          return;
        }
        const synth = window.speechSynthesis;
        synth.cancel();
        let partito = false;
        let tentativi = 0;
        const avvia = () => {
          const u = new SpeechSynthesisUtterance(testo);
          u.lang = "it-IT";
          if (voiceRef.current) u.voice = voiceRef.current;
          u.rate = 1.0;
          u.pitch = 1.0;
          u.onstart = () => {
            partito = true;
            speakingRef.current = true;
            setSpeaking(true);
          };
          u.onend = () => {
            speakingRef.current = false;
            setSpeaking(false);
            maybeRestart();
          };
          u.onerror = () => {
            speakingRef.current = false;
            setSpeaking(false);
            maybeRestart();
          };
          try {
            synth.resume();
          } catch {
            /* noop */
          }
          synth.speak(u);
          setTimeout(() => {
            if (partito || !speakingRef.current) return;
            if (synth.speaking || synth.pending) {
              try {
                synth.resume();
              } catch {
                /* noop */
              }
              return;
            }
            if (tentativi < 2) {
              tentativi += 1;
              try {
                synth.cancel();
              } catch {
                /* noop */
              }
              avvia();
            } else {
              speakingRef.current = false;
              setSpeaking(false);
              maybeRestart();
            }
          }, 500);
        };
        avvia();
      };

      // Voce PREMIUM (ElevenLabs, dal server): se disponibile, uguale per tutti.
      // Al minimo intoppo (chiave assente, rete, autoplay) → voce del browser.
      (async () => {
        try {
          const res = await fetch("/api/voce", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ testo }),
          });
          if (!res.ok || res.status === 204) return parlaBrowser();
          const blob = await res.blob();
          if (!blob || !blob.size) return parlaBrowser();
          if (!speakingRef.current) return; // annullato nel frattempo
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          const chiudi = () => {
            try {
              URL.revokeObjectURL(url);
            } catch {
              /* noop */
            }
            if (audioRef.current === audio) audioRef.current = null;
          };
          audio.onended = () => {
            chiudi();
            speakingRef.current = false;
            setSpeaking(false);
            maybeRestart();
          };
          audio.onerror = () => {
            chiudi();
            parlaBrowser();
          };
          audio.play().catch(() => {
            chiudi();
            parlaBrowser();
          });
        } catch {
          parlaBrowser();
        }
      })();
    },
    [voiceOn, maybeRestart, fermaAudioPremium]
  );

  // La pagina comunica quando ORION sta elaborando (loading).
  const setBusy = useCallback(
    (b: boolean) => {
      busyRef.current = b;
      if (!b) maybeRestart();
    },
    [maybeRestart]
  );

  const attivaMic = useCallback(() => {
    // Desktop (offline): ascolto CONTINUO come il web — si attiva una volta e
    // ogni pausa chiude e invia la frase da sola. In pausa mentre ORION parla.
    if (usaDesktopRef.current) {
      continuoRef.current = true;
      setMicAttivo(true);
      setListening(true);
      avviaAscoltoContinuo({
        onTesto: (t) => inviaTestoRef.current(t),
        puoAscoltare: () => !speakingRef.current && !busyRef.current,
      }).catch(() => {
        setMicAttivo(false);
        setListening(false);
      });
      return;
    }
    continuoRef.current = true;
    setMicAttivo(true);
    // NON interrompe ORION: se sta parlando o elaborando, il microfono parte da
    // solo appena ha finito (così niente eco e la sua voce resta fluida).
    if (!speakingRef.current && !busyRef.current) startRec();
  }, [startRec]);

  const disattivaMic = useCallback(() => {
    // Desktop: ferma l'ascolto continuo (mute).
    if (usaDesktopRef.current) {
      continuoRef.current = false;
      fermaAscoltoContinuo();
      setMicAttivo(false);
      setListening(false);
      setInterim("");
      return;
    }
    continuoRef.current = false;
    setMicAttivo(false);
    if (restartTimer.current) clearTimeout(restartTimer.current);
    try {
      recRef.current?.stop?.();
    } catch {
      /* noop */
    }
    setListening(false);
    setInterim("");
  }, []);

  const toggleMic = useCallback(() => {
    if (continuoRef.current) disattivaMic();
    else attivaMic();
  }, [attivaMic, disattivaMic]);

  return {
    supported,
    listening,
    speaking,
    interim,
    voiceOn,
    setVoiceOn,
    speak,
    cancelSpeak,
    micAttivo,
    toggleMic,
    setBusy,
  };
}
