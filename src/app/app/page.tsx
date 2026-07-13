"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OrionCore, type CoreState } from "@/components/OrionCore";
import { PanelStage } from "@/components/PanelStage";
import { CameraCapture } from "@/components/CameraCapture";
import { VisioneMode, type VisioneHandle } from "@/components/VisioneMode";
import dynamic from "next/dynamic";
import type { AffiancaRichiesta, AffiancaDati } from "@/components/AffiancaMode";
// Desktop-only e usa window/cattura schermo: caricata solo lato client (ssr:false),
// così non entra nel prerender della home.
const AffiancaMode = dynamic(() => import("@/components/AffiancaMode").then((m) => m.AffiancaMode), { ssr: false });
import { SpatialStage, type Layout, MIN_W, MIN_H } from "@/components/SpatialStage";
import { GestiMode } from "@/components/GestiMode";
import { Notifiche } from "@/components/Notifiche";
import { Suggerimenti } from "@/components/Suggerimenti";
import { AuthScreen } from "@/components/AuthScreen";
import { AppuntiPanel } from "@/components/AppuntiPanel";
import { DocumentoViewer, type DocVisore } from "@/components/DocumentoViewer";
import { scaricaTestoPdf } from "@/components/panels/pdf";
import { useSpeech } from "@/components/useSpeech";
import { useClapWake } from "@/components/useClapWake";
import { applicaTema, type Tema } from "@/lib/tema";
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

type EsitoOS = { ok: boolean; nome?: string; app?: string; da?: string; a?: string; tipo?: string; cartella?: string; errore?: string };
type OrionDesktop = {
  versione: string;
  piattaforma: string;
  apriFile: (q: string) => Promise<EsitoOS>;
  cestina: (q: string) => Promise<EsitoOS>;
  apriApp: (n: string) => Promise<EsitoOS>;
  chiudiApp?: (n: string) => Promise<EsitoOS>;
  crea?: (d: { nome: string; tipo: string; posizione?: string }) => Promise<EsitoOS>;
  rinomina?: (d: { da: string; a: string }) => Promise<EsitoOS>;
  // Creative Workspace: lavorare DENTRO i software (terminale + file).
  esegui?: (d: { comando: string; cwd?: string }) => Promise<{ ok: boolean; code?: number | null; stdout?: string; stderr?: string; errore?: string }>;
  scriviFile?: (d: { percorso: string; contenuto: string }) => Promise<{ ok: boolean; percorso?: string; errore?: string }>;
  leggiFile?: (d: { percorso: string }) => Promise<{ ok: boolean; percorso?: string; contenuto?: string; errore?: string }>;
  // Gesture Mode nativa: overlay che manovra le finestre-pannello con le mani.
  gestiOn?: () => void;
  gestiOff?: () => void;
  // Chiude una finestra del computer o una scheda del browser (Accessibility).
  chiudiFinestra?: (d: { app?: string; scheda?: boolean }) => Promise<{ ok: boolean; errore?: string }>;
  // Stampa alla stampante di sistema: PDF generato da ORION, oppure file per nome.
  stampaDati?: (d: { base64: string; nome?: string }) => Promise<{ ok: boolean; nome?: string; errore?: string }>;
  stampaFile?: (query: string) => Promise<{ ok: boolean; nome?: string; errore?: string }>;
  // Solo desktop: apre una vista (pannello) in una FINESTRA separata.
  apriVista?: (v: Vista) => void;
  // Solo desktop: chiude le finestre-pannello (per tipo, o "tutto").
  chiudiVista?: (vista: string) => void;
  // Riporta in primo piano la finestra (doppio battito di mani da ridotta a icona).
  mostraFinestra?: () => void;
  onFinestra?: (cb: (stato: string) => void) => void;
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
  const [suggerimenti, setSuggerimenti] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasKey, setHasKey] = useState(true);
  const [testoInput, setTestoInput] = useState("");
  const [modoTesto, setModoTesto] = useState(false);
  const [mostraStorico, setMostraStorico] = useState(false);
  const [mostraCamera, setMostraCamera] = useState(false);
  const [cameraModo, setCameraModo] = useState<"documento" | "descrizione">("documento");
  // Modalità visione (telecamera dal vivo). Opt-in.
  const [visioneAttiva, setVisioneAttiva] = useState(false);
  const visioneRef = useRef<VisioneHandle>(null);
  // Affiancamento (copilota sullo schermo): SEMPRE attivo su Desktop, invisibile.
  // ORION guarda lo schermo a comando/proattivamente e apre la scheda del riassunto.
  const [affiancaRichiesta, setAffiancaRichiesta] = useState<AffiancaRichiesta>({ seq: 0 });
  // La scheda dell'affiancamento: su Desktop apre una finestra-pannello (che si
  // aggiorna a ogni sguardo), su web un pannello nello stage.
  const mostraAffianca = useCallback((dati: AffiancaDati) => {
    const vista: Vista = { tipo: "affianca", dati };
    const d = desktopBridge();
    if (d?.apriVista) d.apriVista(vista);
    else setViste((vs) => [vista, ...vs.filter((v) => v.tipo !== "affianca")]);
  }, []);
  // Modalità gesti (manipolazione spaziale dei pannelli con le mani). Opt-in.
  const [gestiAttivi, setGestiAttivi] = useState(false);
  const [layout, setLayout] = useState<Layout>({});
  const [attivoPan, setAttivoPan] = useState<string | null>(null);
  const zMax = useRef(20);
  // Incrementato quando l'utente dice "scatta" a voce: fa scattare la fotocamera.
  const [scattaTick, setScattaTick] = useState(0);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [notifica, setNotifica] = useState<{ testo: string; cliente: string } | null>(null);
  const [autenticato, setAutenticato] = useState<boolean | null>(null);
  const [abbonamento, setAbbonamento] = useState<StatoAbb | null>(null);
  const [appunti, setAppunti] = useState<{ titolo: string; cliente_id: number | null; testo: string } | null>(null);
  const [appuntiStato, setAppuntiStato] = useState<"idle" | "salvando" | "salvato">("idle");
  const [docView, setDocView] = useState<{ doc: DocVisore; zoom: number; cerca: string } | null>(null);
  const [standby, setStandby] = useState(false);
  const [minimizzata, setMinimizzata] = useState(false);
  const minimizzataRef = useRef(false);
  minimizzataRef.current = minimizzata;
  const standbyDa = useRef<string>(new Date().toISOString());
  const ultimaAttivita = useRef<number>(Date.now());

  const avviato = useRef(false);
  const salutato = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ultimoCheck = useRef<string>(new Date().toISOString());
  const messaggiVisti = useRef<Set<number>>(new Set());

  const ultimoAssistente = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";

  const inviaAOrion = useCallback(
    async (testo?: string, avvio = false, allegato?: string, quiet = false) => {
      setLoading(true);
      cancelSpeakRef.current?.();
      // Le pillole del turno precedente spariscono appena parte una nuova richiesta.
      setSuggerimenti([]);

      const storico: Msg[] = testo ? [...messagesRef.current, { role: "user", content: testo }] : messagesRef.current;
      // quiet: il messaggio (es. esito di un comando) va al modello ma NON si
      // mostra come bolla utente nella trascrizione.
      if (testo && !quiet) setMessages(storico);

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
        const data: { testo: string; viste: Vista[]; azioni?: Azione[]; suggerimenti?: string[]; errore?: string } =
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
        if (Array.isArray(data.viste) && data.viste.length) {
          const d = desktopBridge();
          if (d?.apriVista) {
            // Desktop: ogni vista in una finestra SEPARATA (sempre, anche coi gesti).
            data.viste.forEach((v) => d.apriVista!(v));
          } else {
            setViste(data.viste);
          }
        }
        if (Array.isArray(data.azioni)) data.azioni.forEach((a) => eseguiAzioneRef.current?.(a));
        setSuggerimenti(Array.isArray(data.suggerimenti) ? data.suggerimenti.slice(0, 3) : []);
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

  // Le pillole spariscono appena l'utente inizia a parlare (STT attivo).
  useEffect(() => {
    if (listening || interim) setSuggerimenti([]);
  }, [listening, interim]);

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

  // Entrando in modalità visione accendo il microfono (così si può chiedere a voce).
  useEffect(() => {
    if (visioneAttiva && supported && !micAttivoRef.current) toggleMic();
  }, [visioneAttiva, supported, toggleMic]);

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
      case "apri_camera":
        setCameraModo(a.modo);
        setMostraCamera(true);
        break;
      case "apri_visione":
        setVisioneAttiva(true);
        break;
      case "apri_affiancamento":
        // ORION guarda lo schermo ORA (l'affiancamento è già sempre pronto).
        setAffiancaRichiesta((r) => ({ testo: a.domanda, seq: r.seq + 1 }));
        break;
      case "apri_gesti":
        setGestiAttivi(true);
        break;
      case "chiudi_vista": {
        if (a.vista === "visione" || a.vista === "tutto") setVisioneAttiva(false);
        if (a.vista === "gesti" || a.vista === "tutto") setGestiAttivi(false);
        const d = desktopBridge();
        if (d?.chiudiVista) {
          // Desktop: i pannelli sono finestre separate → le chiude il main process.
          d.chiudiVista(a.vista);
        } else if (a.vista === "tutto") {
          setViste([]);
          setDocView(null);
        } else {
          setViste((vs) => vs.filter((v) => v.tipo !== a.vista));
          if (a.vista === "documento" || a.vista === "documenti") setDocView(null);
        }
        break;
      }
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
      case "chiudi_app": {
        const d = desktopBridge();
        if (!d?.chiudiApp) {
          speakRef.current?.("Chiudere le app del computer è possibile con ORION Desktop.");
          break;
        }
        d.chiudiApp(a.nome).then((r) => {
          if (!r.ok) speakRef.current?.(`Non sono riuscito a chiudere ${a.nome}.`);
        });
        break;
      }
      case "chiudi_finestra": {
        const d = desktopBridge();
        if (!d?.chiudiFinestra) {
          speakRef.current?.("Chiudere le finestre del computer è possibile con ORION Desktop aggiornato.");
          break;
        }
        d.chiudiFinestra({ app: a.app, scheda: a.scheda }).then((r) => {
          if (r.ok) return;
          if (r.errore === "accessibilita")
            speakRef.current?.(
              "Per chiudere le finestre mi serve il permesso Accessibilità: Impostazioni di Sistema, Privacy e Sicurezza, Accessibilità, e attiva ORION."
            );
          else if (r.errore === "quale_app") speakRef.current?.("Dimmi di quale app devo chiudere la finestra.");
          else speakRef.current?.("Non sono riuscito a chiudere la finestra.");
        });
        break;
      }
      case "stampa_file": {
        const d = desktopBridge();
        if (!d?.stampaFile) {
          speakRef.current?.("Stampare i file del computer è possibile con ORION Desktop aggiornato.");
          break;
        }
        d.stampaFile(a.query).then((r) => {
          if (r.ok) speakRef.current?.(`In stampa: ${r.nome ?? "il file"}.`);
          else if (r.errore === "non trovato") speakRef.current?.(`Non ho trovato "${a.query}" sul computer.`);
          else if (r.errore === "nessuna_stampante") speakRef.current?.("Non trovo una stampante configurata sul Mac.");
          else speakRef.current?.("La stampa non è partita.");
        });
        break;
      }
      case "stampa_contenuto": {
        const d = desktopBridge();
        (async () => {
          // Il PDF si genera qui (pdf-lib è client-side); poi Desktop → stampante,
          // web → il PDF viene scaricato (dal browser non si comanda la stampante).
          const { bytesDocumentoPdf, bytesTestoPdf } = await import("@/components/panels/pdf");
          const bytes = a.documento ? await bytesDocumentoPdf(a.documento) : await bytesTestoPdf(a.titolo, a.testo ?? "");
          if (d?.stampaDati) {
            let bin = "";
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            const r = await d.stampaDati({ base64: btoa(bin), nome: a.titolo });
            if (r.ok) speakRef.current?.("In stampa.");
            else if (r.errore === "nessuna_stampante") speakRef.current?.("Non trovo una stampante configurata sul Mac.");
            else speakRef.current?.("La stampa non è partita.");
          } else {
            const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const el = document.createElement("a");
            el.href = url;
            el.download = `${a.titolo.replace(/\s+/g, "_")}.pdf`;
            el.click();
            URL.revokeObjectURL(url);
            speakRef.current?.("Dal browser non posso comandare la stampante: ti ho scaricato il PDF, stampalo da lì.");
          }
        })().catch(() => speakRef.current?.("Non sono riuscito a preparare la stampa."));
        break;
      }
      case "crea_file": {
        const d = desktopBridge();
        if (!d?.crea) {
          speakRef.current?.("Creare file e cartelle sul computer è possibile con ORION Desktop.");
          break;
        }
        d.crea({ nome: a.nome, tipo: a.tipoElemento, posizione: a.posizione }).then((r) => {
          if (r.ok) speakRef.current?.(`Fatto, ho creato ${a.tipoElemento} "${r.nome}" in ${r.cartella}.`);
          else speakRef.current?.(`Non sono riuscito a creare ${a.nome}${r.errore === "esiste già" ? ": esiste già" : ""}.`);
        });
        break;
      }
      case "rinomina_file": {
        const d = desktopBridge();
        if (!d?.rinomina) {
          speakRef.current?.("Rinominare file e cartelle è possibile con ORION Desktop.");
          break;
        }
        d.rinomina({ da: a.da, a: a.a }).then((r) => {
          if (r.ok) speakRef.current?.(`Fatto, ho rinominato ${r.da} in ${r.a}.`);
          else speakRef.current?.(`Non sono riuscito a rinominare ${a.da}.`);
        });
        break;
      }
      // ── Creative Workspace (solo Desktop) ──────────────────────────────────
      case "scrivi_file": {
        const d = desktopBridge();
        if (!d?.scriviFile) {
          speakRef.current?.("Scrivere file di progetto è una cosa che posso fare con ORION Desktop.");
          break;
        }
        d.scriviFile({ percorso: a.percorso, contenuto: a.contenuto }).then((r) => {
          if (!r.ok)
            inviaAOrionRef.current?.(`[Sistema] Non sono riuscito a scrivere ${a.percorso}: ${r.errore}.`, false, undefined, true);
        });
        break;
      }
      case "esegui_comando": {
        const d = desktopBridge();
        if (!d?.esegui) {
          speakRef.current?.("Eseguire comandi è una cosa che posso fare con ORION Desktop, l'app da scaricare.");
          break;
        }
        d.esegui({ comando: a.comando, cwd: a.cwd }).then((r) => {
          if (a.riporta === false) return;
          // L'esito torna a ORION (silenzioso) così può proseguire/correggere.
          const esito = r.ok
            ? `[Sistema] Comando eseguito (exit ${r.code ?? 0}).\nOutput:\n${r.stdout || "(vuoto)"}${r.stderr ? `\nStderr:\n${r.stderr}` : ""}`
            : `[Sistema] Comando NON riuscito: ${r.errore ?? r.stderr ?? "errore"}.${r.stdout ? `\nOutput:\n${r.stdout}` : ""}`;
          inviaAOrionRef.current?.(esito, false, undefined, true);
        });
        break;
      }
      case "tema":
        // ORION su misura: nuovo look in diretta, con l'onda di colore dal nucleo.
        applicaTema(a.tema as Tema | null, { morph: true });
        break;
      default:
        break;
    }
  }, []);
  const eseguiAzioneRef = useRef(eseguiAzione);
  eseguiAzioneRef.current = eseguiAzione;
  const inviaAOrionRef = useRef(inviaAOrion);
  inviaAOrionRef.current = inviaAOrion;
  const entraStandbyRef = useRef<() => void>(() => {});

  // Canale pannello→ORION: un pannello (es. import dati) può passare un esito
  // al cervello come messaggio [Sistema] silenzioso (non appare in chat).
  useEffect(() => {
    const h = (e: Event) => {
      const testo = (e as CustomEvent<{ testo?: string }>).detail?.testo;
      if (testo) inviaAOrionRef.current?.(String(testo), false, undefined, true);
    };
    window.addEventListener("orion:messaggio", h);
    return () => window.removeEventListener("orion:messaggio", h);
  }, []);

  // ── Gesture Mode: gestione del layout spaziale dei pannelli ────────────────
  // Carica il layout salvato (posizioni ricordate) al primo avvio.
  useEffect(() => {
    try {
      const grezzo = localStorage.getItem("orion_layout_gesti");
      if (grezzo) setLayout(JSON.parse(grezzo) as Layout);
    } catch {
      /* layout assente o corrotto */
    }
  }, []);
  // Salva il layout a ogni cambiamento (persistente).
  useEffect(() => {
    try {
      localStorage.setItem("orion_layout_gesti", JSON.stringify(layout));
    } catch {
      /* quota piena o non disponibile */
    }
  }, [layout]);

  // Tiene il layout entro la finestra (sotto l'header, sopra il footer) + dimensioni minime.
  const clampRett = useCallback((r: { x: number; y: number; w: number; h: number; z: number }) => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const w = Math.max(MIN_W, Math.min(r.w, vw - 24));
    const h = Math.max(MIN_H, Math.min(r.h, vh - 120));
    const x = Math.max(8, Math.min(r.x, vw - w - 8));
    const y = Math.max(60, Math.min(r.y, vh - h - 24));
    return { x, y, w, h, z: r.z };
  }, []);

  const spostaPan = useCallback(
    (tipo: string, x: number, y: number) =>
      setLayout((l) => (l[tipo] ? { ...l, [tipo]: clampRett({ ...l[tipo], x, y }) } : l)),
    [clampRett]
  );
  const ridimensionaPan = useCallback(
    (tipo: string, w: number, h: number) =>
      setLayout((l) => (l[tipo] ? { ...l, [tipo]: clampRett({ ...l[tipo], w, h }) } : l)),
    [clampRett]
  );
  const portaAvantiPan = useCallback((tipo: string) => {
    zMax.current += 1;
    const z = zMax.current;
    setLayout((l) => (l[tipo] ? { ...l, [tipo]: { ...l[tipo], z } } : l));
    setAttivoPan(tipo);
  }, []);
  const chiudiPan = useCallback((tipo: string) => {
    setViste((vs) => vs.filter((v) => v.tipo !== tipo));
    if (tipo === "documento" || tipo === "documenti") setDocView(null);
  }, []);

  // Desktop: la modalità gesti usa l'OVERLAY NATIVO (manovra le finestre reali).
  // Su web resta la gesture-mode DOM (vedi render più sotto). Additivo, opt-in.
  useEffect(() => {
    const d = desktopBridge();
    if (!d) return; // web: se ne occupa l'overlay DOM (render più sotto)
    if (!d.gestiOn) {
      // Desktop senza overlay nativo (app non ancora ricostruita): NON accendere
      // l'overlay DOM pesante (camera+MediaPipe in finestra) — bloccherebbe lo
      // schermo. Rispegni e avvisa. Così ✋ non resta acceso a vuoto.
      if (gestiAttivi) {
        setGestiAttivi(false);
        speakRef.current?.(
          "Per i comandi gestuali serve aggiornare l'app desktop. Per ora li ho lasciati spenti."
        );
      }
      return;
    }
    if (gestiAttivi) d.gestiOn!();
    else d.gestiOff!();
  }, [gestiAttivi]);

  // ── Snap ai bordi/metà schermo (affiancare i pannelli con un gesto) ────────
  const [snapHint, setSnapHint] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Dal punto di rilascio calcola la zona di destinazione (metà o quarto), o null.
  const calcolaSnap = useCallback((x: number, y: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const L = 8;
    const T = 60;
    const R = vw - 8;
    const B = vh - 24;
    const W = R - L;
    const H = B - T;
    const m = 72; // soglia dai bordi
    const alto = y < T + H / 3;
    const basso = y > B - H / 3;
    if (x < L + m) {
      if (alto) return { x: L, y: T, w: W / 2, h: H / 2 };
      if (basso) return { x: L, y: T + H / 2, w: W / 2, h: H / 2 };
      return { x: L, y: T, w: W / 2, h: H };
    }
    if (x > R - m) {
      if (alto) return { x: L + W / 2, y: T, w: W / 2, h: H / 2 };
      if (basso) return { x: L + W / 2, y: T + H / 2, w: W / 2, h: H / 2 };
      return { x: L + W / 2, y: T, w: W / 2, h: H };
    }
    return null;
  }, []);
  const aggiornaSnapHint = useCallback((x: number, y: number) => setSnapHint(calcolaSnap(x, y)), [calcolaSnap]);
  const applicaSnap = useCallback(
    (tipo: string) => {
      setSnapHint((hint) => {
        if (hint) setLayout((l) => (l[tipo] ? { ...l, [tipo]: { ...l[tipo], ...hint } } : l));
        return null;
      });
    },
    []
  );

  // Assegna una posizione iniziale (a cascata) ai pannelli nuovi in modalità gesti.
  useEffect(() => {
    if (!gestiAttivi) return;
    setLayout((l) => {
      let cambiato = false;
      const nuovo = { ...l };
      viste.forEach((v, i) => {
        if (!nuovo[v.tipo]) {
          zMax.current += 1;
          nuovo[v.tipo] = clampRett({ x: 120 + i * 44, y: 96 + i * 44, w: 440, h: 400, z: zMax.current });
          cambiato = true;
        }
      });
      return cambiato ? nuovo : l;
    });
  }, [viste, gestiAttivi, clampRett]);

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

  // "Sistema": ORION mette punteggiatura, va a capo e trasforma gli elenchi in liste.
  const sistemaAppunti = useCallback(async () => {
    const a = appuntiRef.current;
    if (!a?.testo.trim()) return;
    setAppuntiStato("salvando");
    try {
      const r = await fetch("/api/formatta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ testo: a.testo }),
      });
      const d = await r.json();
      setAppuntiStato("idle");
      if (d?.ok && d.testo) setAppunti((x) => (x ? { ...x, testo: d.testo } : x));
    } catch {
      setAppuntiStato("idle");
    }
  }, []);

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

  // Doppio battito di mani: se la finestra è ridotta a icona → riappare ("Eccomi");
  // altrimenti, se in standby → risveglio. (Il microfono si attiva/muta col tasto.)
  const onDoppioClap = useCallback(() => {
    if (minimizzataRef.current) {
      desktopBridge()?.mostraFinestra?.();
      const nome = nomeUtenteRef.current ? `, ${nomeUtenteRef.current}` : "";
      speakRef.current?.(`Eccomi${nome}.`);
      return;
    }
    if (standbyRef.current) risveglia();
  }, [risveglia]);
  useClapWake(standby || minimizzata, onDoppioClap);

  // Desktop: sapere quando la finestra è ridotta a icona / ripristinata (per il clap).
  useEffect(() => {
    desktopBridge()?.onFinestra?.((stato) => setMinimizzata(stato === "minimizzata"));
  }, []);

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
    // In modalità visione la voce è una DOMANDA sull'inquadratura (o la chiude).
    if (visioneAttiva) {
      const low = t.trim().toLowerCase();
      if (/(chiudi|ferma|spegni|esci)\b.*(vision|telecamer|videocamer|camera)|^(chiudi|ferma|basta|stop)$/.test(low)) {
        setVisioneAttiva(false);
        speakRef.current?.("Chiudo la visione.");
      } else {
        visioneRef.current?.chiedi(t);
      }
      return;
    }
    // Mentre la fotocamera è aperta: "scatta/fotografa/vai/ok/pronto" → scatta la foto.
    // La voce non viene mandata a ORION finché si sta inquadrando.
    if (mostraCamera) {
      if (/scatt|fotograf|^foto\b|\bpronto\b|^vai\b|^ok\b|adesso|ci sono|fatto/i.test(t.trim())) {
        setScattaTick((n) => n + 1);
      }
      return;
    }
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
    if (/\b(sistema|sistemi|riordina|formatta|punteggiatura)\b/.test(comando)) {
      sistemaAppunti();
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
        // Continuità: ripristina la conversazione precedente prima del saluto.
        if (Array.isArray(s.storico) && s.storico.length) {
          setMessages(s.storico as Msg[]);
        }
        setAutenticato(Boolean(s.autenticato));
        nomeUtenteRef.current = s.nome || s.utente?.nome || null;
        if (s.abbonamento) setAbbonamento(s.abbonamento as StatoAbb);
        // ORION su misura: il tema del profilo vince su quello in cache locale
        // (così l'account porta il suo look su ogni dispositivo, senza onda).
        if (s.autenticato) applicaTema((s.tema as Tema | null) ?? null);
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

  const catturaFoto = (dataUrl: string) => {
    setMostraCamera(false);
    if (cameraModo === "descrizione") {
      inviaAOrion("Descrivi in modo chiaro e naturale cosa si vede in questa foto.", false, dataUrl);
    } else {
      inviaAOrion("Digitalizza questo documento e proponi dove archiviarlo.", false, dataUrl);
    }
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
            onClick={() => setGestiAttivi((v) => !v)}
            className={`grid size-9 place-items-center rounded-lg border text-base ${
              gestiAttivi
                ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-200"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
            title={gestiAttivi ? "Disattiva controllo a gesti" : "Controllo a gesti (mani)"}
          >
            ✋
          </button>
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
        {haPannelli && !gestiAttivi ? (
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

      {/* Suggerimenti contestuali: tra lo stage e la barra di input, non coprono i pannelli. */}
      <Suggerimenti suggerimenti={suggerimenti} onScegli={(t) => inviaAOrion(t)} disabled={loading} />

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
                onChange={(e) => {
                  setTestoInput(e.target.value);
                  if (e.target.value) setSuggerimenti([]);
                }}
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
                onClick={() => {
                  setCameraModo("documento");
                  setMostraCamera(true);
                }}
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
                onClick={() => {
                  setCameraModo("documento");
                  setMostraCamera(true);
                }}
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
        <CameraCapture
          modo={cameraModo}
          scattaTick={scattaTick}
          onCapture={catturaFoto}
          onClose={() => setMostraCamera(false)}
        />
      )}

      {visioneAttiva && (
        <VisioneMode
          ref={visioneRef}
          parla={(t) => speakRef.current?.(t)}
          onClose={() => setVisioneAttiva(false)}
        />
      )}

      {/* Affiancamento SEMPRE attivo su Desktop: orchestratore invisibile, pronto
          a guardare lo schermo appena ORION lo chiede (esplicito o proattivo). */}
      {desktopBridge() && (
        <AffiancaMode
          richiesta={affiancaRichiesta}
          parla={(t) => speakRef.current?.(t)}
          onScheda={mostraAffianca}
        />
      )}

      {gestiAttivi && !desktopBridge() && (
        <>
          {snapHint && (
            <div
              className="pointer-events-none fixed z-[28] rounded-2xl border-2 border-dashed border-cyan-400/60 bg-cyan-400/10"
              style={{ left: snapHint.x, top: snapHint.y, width: snapHint.w, height: snapHint.h }}
            />
          )}
          <SpatialStage
            viste={viste}
            layout={layout}
            attivo={attivoPan}
            onSposta={spostaPan}
            onRidimensiona={ridimensionaPan}
            onPortaAvanti={portaAvantiPan}
            onChiudi={chiudiPan}
            onSnapHint={aggiornaSnapHint}
            onSnapApplica={applicaSnap}
          />
          <GestiMode
            onSposta={spostaPan}
            onRidimensiona={ridimensionaPan}
            onPortaAvanti={portaAvantiPan}
            onChiudi={chiudiPan}
            onSnapHint={aggiornaSnapHint}
            onSnapApplica={applicaSnap}
          />
          <button
            onClick={() => setGestiAttivi(false)}
            className="fixed right-4 top-3 z-[60] flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-400/20"
          >
            <IconClose className="h-3.5 w-3.5" /> Esci dai gesti
          </button>
        </>
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
          onSistema={sistemaAppunti}
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
          className="backdrop-in fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-7 bg-black/85 backdrop-blur-md"
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
