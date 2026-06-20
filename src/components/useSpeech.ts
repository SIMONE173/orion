"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

  const continuoRef = useRef(false); // interruttore: il mic deve restare attivo
  const speakingRef = useRef(false); // ORION sta parlando (non ascoltare: niente eco)
  const busyRef = useRef(false); // ORION sta elaborando (loading)
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0); // quando è partito l'ultimo ascolto
  const gotResult = useRef(false); // l'ascolto corrente ha prodotto qualcosa?
  const failCount = useRef(0); // fallimenti rapidi consecutivi (es. Electron senza STT)

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
    const SR =
      (window as AnyRec).SpeechRecognition || (window as AnyRec).webkitSpeechRecognition;
    const hasTTS = "speechSynthesis" in window;
    setSupported(Boolean(SR));

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
          onFinalRef.current(finale.trim());
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
        // Voce richiesta: "Google italiano". Ripiego sulla migliore disponibile.
        voiceRef.current =
          it.find((v) => v.name.toLowerCase().includes("google")) ||
          [...it].sort((a, b) => punteggioVoce(b) - punteggioVoce(a))[0];
      };
      applica();
      window.speechSynthesis.onvoiceschanged = applica;
    }

    return () => {
      try {
        recRef.current?.abort?.();
        window.speechSynthesis?.cancel();
        if (restartTimer.current) clearTimeout(restartTimer.current);
      } catch {
        /* noop */
      }
    };
  }, [maybeRestart]);

  const cancelSpeak = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (testo: string) => {
      if (!voiceOn || !testo) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      // Stiamo per parlare: BLOCCA SUBITO il microfono per evitare l'eco.
      // Segna speaking=true prima di tutto, ferma il riconoscimento se era attivo,
      // e annulla un eventuale riarmo programmato.
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
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(testo);
      u.lang = "it-IT";
      if (voiceRef.current) u.voice = voiceRef.current;
      u.rate = 1.0; // ritmo naturale
      u.pitch = 1.0; // timbro naturale (il genere lo dà la voce scelta)
      u.onstart = () => {
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
      window.speechSynthesis.speak(u);
    },
    [voiceOn, maybeRestart]
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
    continuoRef.current = true;
    setMicAttivo(true);
    // NON interrompe ORION: se sta parlando o elaborando, il microfono parte da
    // solo appena ha finito (così niente eco e la sua voce resta fluida).
    if (!speakingRef.current && !busyRef.current) startRec();
  }, [startRec]);

  const disattivaMic = useCallback(() => {
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
