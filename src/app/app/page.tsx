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
import { useSchiocco } from "@/components/useSchiocco";
import { applicaTema, type Tema } from "@/lib/tema";
import { PIANI } from "@/lib/prezzi";
import { IconMic, IconKeyboard, IconDoc, IconClose, IconSound, IconMute, IconChat, IconLogout } from "@/components/icons";
import type { Vista, Azione } from "@/lib/orion/views";

type Msg = { role: "user" | "assistant"; content: string; arrivo?: ArrivoWA };

// Un elemento della POSTA del titolare: messaggio WhatsApp o EMAIL importante.
type ArrivoWA = {
  id: number;
  canale?: "whatsapp" | "email";
  cliente: string | null;
  cliente_id?: number | null;
  telefono: string | null;
  mittente?: string | null; // indirizzo email del mittente
  oggetto?: string | null; // oggetto della mail
  tipo: string; // testo | audio | foto | video | documento | email
  contenuto: string | null;
  allegato_url: string | null;
  allegato_nome: string | null;
  quando: string;
};
const chiDi = (a: ArrivoWA) =>
  a.cliente ?? (a.canale === "email" ? (a.mittente ?? "mittente sconosciuto") : (a.telefono ?? "numero sconosciuto"));

// Una consegna del Ponte apparsa MENTRE si lavora: la segretaria la annuncia
// e (su Desktop) la scrive lei nel gestionale con la Mano.
type ConsegnaViva = { id: number; evento: string; payload: Record<string, unknown>; sistema: string };
const ETICHETTE_CONSEGNA: Record<string, string> = {
  appuntamento_creato: "Nuovo appuntamento",
  appuntamento_spostato: "Appuntamento spostato",
  appuntamento_stato: "Stato aggiornato",
  appuntamento_cancellato: "Appuntamento cancellato",
  cliente_creato: "Nuovo cliente",
  cliente_aggiornato: "Cliente aggiornato",
};
const descriviConsegna = (c: ConsegnaViva): string => {
  const p = c.payload || {};
  const chi = String(p.cliente ?? p.cliente_nome ?? p.nome ?? p.titolo ?? "");
  const quando =
    typeof p.inizio === "string" && /^\d{4}-\d{2}-\d{2}T/.test(p.inizio)
      ? new Date(p.inizio).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "";
  return [ETICHETTE_CONSEGNA[c.evento] ?? c.evento, chi, quando].filter(Boolean).join(" · ");
};
const dettaglioConsegna = (c: ConsegnaViva): string =>
  Object.entries(c.payload || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("; ");

// Riassunto parlabile di una mail: le prime frasi utili, mai un muro di testo.
const riassuntoParlato = (corpo: string, max = 220): string => {
  const pulito = corpo.replace(/\s+/g, " ").trim();
  if (pulito.length <= max) return pulito;
  const taglio = pulito.slice(0, max);
  const ultimo = Math.max(taglio.lastIndexOf(". "), taglio.lastIndexOf("! "), taglio.lastIndexOf("? "));
  return (ultimo > 80 ? taglio.slice(0, ultimo + 1) : taglio) + "…";
};

// Il logo VERO di WhatsApp (tracciato Simple Icons, CC0).
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

// ── ORION DEMO: il binario del tutorial ──────────────────────────────────────
// La colonnina fissa a sinistra che rende VISIBILE il giro guidato: le tappe,
// le spunte, la tappa viva che pulsa. Stili inline (pattern del progetto per
// gli elementi fissi) + una vena di animazione per la tappa corrente.
type BinarioTutorial = Extract<Vista, { tipo: "tutorial" }>["dati"];

function BinarioDemo({ t }: { t: BinarioTutorial }) {
  const fatte = t.tappe.filter((x) => x.fatta).length;
  const pct = t.totale > 0 ? Math.round((fatte / t.totale) * 100) : 0;
  return (
    <div
      className="fade-in rounded-2xl border border-cyan-400/20 bg-[#060d16]/92 shadow-2xl backdrop-blur"
      style={{ position: "fixed", right: 16, top: "50%", transform: "translateY(-50%)", width: 208, zIndex: 40, padding: 14 }}
    >
      <style>{`@keyframes binario-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(103,232,249,0.35); } 50% { box-shadow: 0 0 10px 2px rgba(103,232,249,0.25); } }`}</style>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="rounded bg-cyan-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-cyan-200">
          Demo
        </span>
        <span className="text-[11px] font-semibold text-slate-200">Giro guidato</span>
      </div>
      <div className="mb-2 text-[10px] text-slate-500">
        {t.finito ? "Giro completato 🎉" : `Tappa ${Math.min(t.indice + 1, t.totale)} di ${t.totale}`}
      </div>
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full bg-cyan-400/80"
          style={{ width: `${t.finito ? 100 : pct}%`, transition: "width 0.8s cubic-bezier(0.2,0.8,0.2,1)", boxShadow: "0 0 8px rgba(103,232,249,0.6)" }}
        />
      </div>
      <div className="space-y-1">
        {t.tappe.map((tp) => (
          <div
            key={tp.id}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1"
            style={
              tp.corrente
                ? { background: "rgba(103,232,249,0.08)", border: "1px solid rgba(103,232,249,0.25)", animation: "binario-pulse 2.4s ease-in-out infinite" }
                : { opacity: tp.fatta ? 0.75 : 0.38 }
            }
          >
            <span className="grid size-5 shrink-0 place-items-center text-[13px]">{tp.fatta ? "✅" : tp.icona}</span>
            <span
              className={`truncate text-[11px] ${tp.corrente ? "font-semibold text-cyan-100" : tp.fatta ? "text-slate-400 line-through decoration-slate-600" : "text-slate-400"}`}
            >
              {tp.titolo}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// La bolla della posta: WhatsApp (verde, col suo logo) o email (azzurra, con
// oggetto). Testo, vocale, foto o video — vivi in chat.
function BollaArrivo({ a, onRispondi }: { a: ArrivoWA; onRispondi: () => void }) {
  if (a.canale === "email") {
    return (
      <div className="fade-in max-w-[92%] rounded-2xl rounded-bl-sm border border-sky-400/25 bg-sky-500/10 px-3.5 py-2.5 text-sm">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-wider text-sky-300/90">
          <span>✉️ {chiDi(a)}</span>
          <span className="font-normal text-sky-200/50">· Email</span>
        </div>
        {a.oggetto && <p className="font-semibold text-slate-50">{a.oggetto}</p>}
        {a.contenuto && (
          <p className="mt-1 whitespace-pre-wrap text-slate-200/95" style={{ maxHeight: 280, overflowY: "auto" }}>
            {a.contenuto}
          </p>
        )}
        <div className="mt-2">
          <button
            onClick={onRispondi}
            className="rounded-lg border border-sky-400/40 bg-sky-400/15 px-2.5 py-1 text-xs font-medium text-sky-100 hover:bg-sky-400/25"
          >
            ↩︎ Rispondi
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="fade-in max-w-[92%] rounded-2xl rounded-bl-sm border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-2.5 text-sm">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-wider text-emerald-300/90">
        <span className="inline-flex items-center gap-1.5">
          <LogoWhatsApp size={14} /> {chiDi(a)}
        </span>
        <span className="font-normal text-emerald-200/50">· WhatsApp</span>
      </div>
      {a.tipo === "testo" && a.contenuto && <p className="whitespace-pre-wrap text-slate-100">{a.contenuto}</p>}
      {a.tipo === "audio" && a.allegato_url && <audio controls autoPlay src={a.allegato_url} className="mt-1 w-full" />}
      {a.tipo === "foto" && a.allegato_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.allegato_url} alt={a.allegato_nome ?? "foto"} className="mt-1 max-h-64 w-full rounded-lg object-contain" />
      )}
      {a.tipo === "video" && a.allegato_url && <video controls autoPlay src={a.allegato_url} className="mt-1 max-h-64 w-full rounded-lg" />}
      {a.tipo === "documento" && a.allegato_url && (
        <a href={a.allegato_url} download={a.allegato_nome ?? "documento"} className="mt-1 inline-block text-cyan-300 underline">
          📎 {a.allegato_nome ?? "Apri il documento"}
        </a>
      )}
      {a.tipo !== "testo" && a.contenuto && !a.contenuto.startsWith("[") && (
        <p className="mt-1 whitespace-pre-wrap text-slate-200/90">{a.contenuto}</p>
      )}
      {a.tipo !== "testo" && !a.allegato_url && <p className="italic text-slate-400">[{a.tipo} non disponibile]</p>}
      <div className="mt-2">
        <button
          onClick={onRispondi}
          className="rounded-lg border border-emerald-400/40 bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-400/25"
        >
          ↩︎ Rispondi
        </button>
      </div>
    </div>
  );
}

type StatoAbb = {
  configurato: boolean;
  stato: "demo" | "da_attivare" | "prova" | "attivo" | "scaduto" | "annullato";
  piano: "pro" | "azienda" | null;
  inProva: boolean;
  giorniProvaRimasti: number;
  attivo: boolean;
  accessoConsentito: boolean;
  periodoFine: string | null;
  founder: boolean; // iscritto alla beta → sconto a vita
  scontoFounder: number; // % dello sconto founding member (0 se non founder)
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
  // Gli occhi della Mano (già usati dall'affiancamento).
  catturaSchermo?: () => Promise<{ ok: boolean; dataUrl?: string; larghezza?: number; altezza?: number; errore?: string }>;
  // LA MANO DI ORION: clic e tastiera veri (coordinate nello spazio immagine).
  manoClic?: (d: { x: number; y: number; imgW: number; imgH: number; doppio?: boolean }) => Promise<{ ok: boolean; errore?: string }>;
  manoScrivi?: (d: { testo: string }) => Promise<{ ok: boolean; errore?: string }>;
  manoTasto?: (d: { tasto: string }) => Promise<{ ok: boolean; errore?: string }>;
  riduciOrion?: () => Promise<{ ok: boolean }>;
  mostraOrion?: () => Promise<{ ok: boolean }>;
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
  // ORION DEMO: account demo + binario del tutorial (fisso a lato, non un pannello).
  const [demo, setDemo] = useState(false);
  const [tutorial, setTutorial] = useState<BinarioTutorial | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasKey, setHasKey] = useState(true);
  const [testoInput, setTestoInput] = useState("");
  const [modoTesto, setModoTesto] = useState(false);
  const [mostraStorico, setMostraStorico] = useState(false);
  // La CHAT a sinistra: si apre appena ORION ha detto la prima frase
  // (benvenuto/briefing) e il nucleo vola in alto a destra.
  const [chatAttiva, setChatAttiva] = useState(false);
  // LA MANO DI ORION: stato del lavoro in corso sul software dell'utente.
  const [manoStato, setManoStato] = useState<{ spiegazione: string; passo: number } | null>(null);
  const manoStopRef = useRef(false);
  const manoAttivaRef = useRef(false);
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
  // POSTA IN ARRIVO: annuncio («È arrivato un messaggio da X, vuoi aprirlo?»)
  // → apertura in chat (testo/vocale/foto/video) → risposta dettata o scritta.
  // Tutto il giro vive QUI, senza passare dal modello: zero crediti.
  const [annuncio, setAnnuncio] = useState<ArrivoWA[]>([]);
  const [rispostaA, setRispostaA] = useState<ArrivoWA | null>(null);
  const [bozzaRisposta, setBozzaRisposta] = useState<string | null>(null);
  const annunciati = useRef<Set<number>>(new Set());
  // LA SEGRETARIA LIVE DI GIORNO: consegne del Ponte apparse in sessione.
  const [consegneVive, setConsegneVive] = useState<ConsegnaViva[]>([]);
  const consegneAnnunciate = useRef<Set<number>>(new Set());
  const consegneBaseline = useRef(false); // il primo giro fa da base (ci pensa il briefing)
  const [autenticato, setAutenticato] = useState<boolean | null>(null);
  // Lucchetto del lancio: prima dell'apertura l'app mostra il conto alla
  // rovescia (chi è in lista può comunque accedere dalla porticina).
  const [lancio, setLancio] = useState<{ lanciato: boolean; quando: string } | null>(null);
  const [oraTick, setOraTick] = useState(() => Date.now());
  const [mostraAccesso, setMostraAccesso] = useState(false);
  useEffect(() => {
    fetch("/api/lancio")
      .then((r) => r.json())
      .then((s) => setLancio({ lanciato: Boolean(s.lanciato), quando: String(s.quando) }))
      .catch(() => setLancio({ lanciato: true, quando: "" })); // rete ko → non bloccare la UI (i cancelli server proteggono)
  }, []);
  // Niente date: il lucchetto resta chiuso finché il server non dice "lanciato".
  const lancioChiuso = Boolean(lancio && !lancio.lanciato);
  useEffect(() => {
    if (!lancioChiuso) return;
    const iv = setInterval(() => setOraTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [lancioChiuso]);
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

  const ultimoAssistente = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";

  // Appena c'è la prima parola in conversazione, il nucleo lascia il centro.
  useEffect(() => {
    if (!chatAttiva && messages.length > 0) setChatAttiva(true);
  }, [messages, chatAttiva]);

  // La chat si tiene sempre sull'ultimo messaggio.
  const chatFineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatFineRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  // Il faro per il MINI-NUCLEO desktop (/nucleo, finestra sempre in primo
  // piano): trasmette lo stato del nucleo e i "disegnini" delle azioni.
  const canaleNucleo = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    try {
      canaleNucleo.current = new BroadcastChannel("orion-nucleo");
    } catch {
      /* browser senza BroadcastChannel: il mini-nucleo resta idle */
    }
    return () => canaleNucleo.current?.close();
  }, []);

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
          // Il binario del tutorial NON è un pannello: vive fisso a lato.
          data.viste
            .filter((v) => v.tipo === "tutorial")
            .forEach((v) => setTutorial((v as Extract<Vista, { tipo: "tutorial" }>).dati));
          const pannelli = data.viste.filter((v) => v.tipo !== "tutorial");
          const d = desktopBridge();
          if (d?.apriVista) {
            // Desktop: ogni vista in una finestra SEPARATA (sempre, anche coi gesti).
            pannelli.forEach((v) => d.apriVista!(v));
          } else if (pannelli.length) {
            setViste(pannelli);
          }
          // Il mini-nucleo mostra il disegnino di cosa sta succedendo.
          pannelli.forEach((v) => {
            try {
              canaleNucleo.current?.postMessage({ tipo: "azione", nome: v.tipo });
            } catch {
              /* noop */
            }
          });
        }
        if (Array.isArray(data.azioni))
          data.azioni.forEach((a) => {
            eseguiAzioneRef.current?.(a);
            try {
              canaleNucleo.current?.postMessage({ tipo: "azione", nome: (a as { tipo?: string }).tipo ?? "azione" });
            } catch {
              /* noop */
            }
          });
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

  // UNO SCHIOCCO DI DITA mentre ORION parla → zittisce SOLO la frase in corso
  // (il testo resta in chat: la voce torna al prossimo messaggio).
  useSchiocco(speaking, () => cancelSpeakRef.current?.());
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
      case "apri_url": {
        if (!a.url) break;
        // Desktop: nel browser VERO dell'utente (scheda nuova), non in una
        // finestra di ORION — è il suo computer, si usa il suo browser.
        const dUrl = desktopBridge();
        if (dUrl?.apriApp) void dUrl.apriApp(a.url);
        else window.open(a.url, "_blank", "noopener,noreferrer");
        break;
      }
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
      case "mano": {
        // La Mano di ORION: usa il software dell'utente al posto suo.
        void avviaManoRef.current?.(a);
        return;
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
      case "apri_messaggio": {
        // Dal tool apri_messaggio: la bolla compare in chat (la voce è del
        // modello, che sta già raccontando cosa c'è dentro).
        const arr = (a as { arrivo?: ArrivoWA }).arrivo;
        if (arr) {
          annunciati.current.add(arr.id);
          setAnnuncio((prev) => prev.filter((x) => x.id !== arr.id));
          setMessages((m) => [...m, { role: "assistant", content: "", arrivo: arr }]);
        }
        break;
      }
      default:
        break;
    }
  }, []);
  const eseguiAzioneRef = useRef(eseguiAzione);
  eseguiAzioneRef.current = eseguiAzione;
  const inviaAOrionRef = useRef(inviaAOrion);
  inviaAOrionRef.current = inviaAOrion;

  // ── LA MANO DI ORION: il ciclo guarda→decide→agisce→verifica ──────────────
  // ORION si riduce a icona (il mini-nucleo racconta i passi), apre il software
  // e lo usa DAVVERO: screenshot → /api/mano decide UNA azione → mani native →
  // nuovo screenshot. Si ferma a obiettivo raggiunto, su STOP, o al primo dubbio.
  const avviaMano = useCallback(async (a: { obiettivo: string; app?: string; codaConsegne?: number[] }) => {
    const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const d = desktopBridge();
    if (!d?.manoClic || !d?.catturaSchermo) {
      inviaAOrionRef.current?.(
        "[Sistema] La Mano richiede ORION Desktop AGGIORNATO (qui le mani native non ci sono). Spiega all'utente in una frase che serve la versione Desktop più recente.",
        false,
        undefined,
        true
      );
      return;
    }
    if (manoAttivaRef.current) return;
    manoAttivaRef.current = true;
    manoStopRef.current = false;
    const passi: { spiegazione: string; esito?: string }[] = [];
    let esitoFinale = "interrotta prima di cominciare";
    const alNucleo = (testo: string) => {
      try {
        canaleNucleo.current?.postMessage({ tipo: "azione", nome: "mano", testo });
      } catch {
        /* noop */
      }
    };
    try {
      setManoStato({ spiegazione: a.app ? `Apro ${a.app}…` : "Comincio…", passo: 0 });
      alNucleo(a.app ? `Apro ${a.app}` : "Comincio");
      if (a.app) {
        await d.apriApp(a.app);
        await attesa(2600);
      }
      await d.riduciOrion?.();
      await attesa(900);

      for (let passo = 1; passo <= 25; passo++) {
        if (manoStopRef.current) {
          esitoFinale = "fermata dall'utente";
          break;
        }
        const shot = await d.catturaSchermo();
        if (!shot?.ok || !shot.dataUrl) {
          esitoFinale = `non riesco a vedere lo schermo (${shot?.errore ?? "?"})`;
          break;
        }
        const res = await fetch("/api/mano", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ obiettivo: a.obiettivo, passi, screenshot: shot.dataUrl, piattaforma: d.piattaforma }),
        });
        const dati = await res.json().catch(() => null);
        if (!res.ok || !dati?.ok || !dati.azione) {
          esitoFinale = "il mio cervello non ha risposto (controlla i crediti API)";
          break;
        }
        const az = dati.azione as { tipo: string; x?: number; y?: number; testo?: string; tasto?: string; spiegazione?: string; esito_finale?: string };
        setManoStato({ spiegazione: az.spiegazione ?? "…", passo });
        if (az.spiegazione) alNucleo(az.spiegazione);

        if (az.tipo === "fatto") {
          esitoFinale = `FATTO E VERIFICATO: ${az.esito_finale || "obiettivo completato"}`;
          break;
        }
        if (az.tipo === "aiuto") {
          esitoFinale = `mi sono fermata per chiedere: ${az.esito_finale || az.spiegazione || "serve una mano"}`;
          break;
        }

        let ok = true;
        let err = "";
        if (az.tipo === "clic" || az.tipo === "doppio_clic") {
          const r = await d.manoClic({ x: az.x ?? 0, y: az.y ?? 0, imgW: shot.larghezza ?? 0, imgH: shot.altezza ?? 0, doppio: az.tipo === "doppio_clic" });
          ok = r.ok;
          err = r.errore ?? "";
        } else if (az.tipo === "scrivi") {
          const r = await d.manoScrivi!({ testo: az.testo ?? "" });
          ok = r.ok;
          err = r.errore ?? "";
        } else if (az.tipo === "tasto") {
          const r = await d.manoTasto!({ tasto: az.tasto ?? "" });
          ok = r.ok;
          err = r.errore ?? "";
        } else if (az.tipo === "attendi") {
          await attesa(1400);
        }
        passi.push({ spiegazione: az.spiegazione ?? az.tipo, esito: ok ? undefined : `FALLITA: ${err}` });
        if (!ok && err === "accessibilita") {
          esitoFinale = "mi manca il permesso Accessibilità: Impostazioni di Sistema → Privacy e Sicurezza → Accessibilità → attiva ORION";
          break;
        }
        await attesa(700);
        if (passo === 25) esitoFinale = "troppi passi: meglio finire insieme, dimmi tu";
      }
    } catch (e) {
      esitoFinale = `si è inceppata: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      manoAttivaRef.current = false;
      setManoStato(null);
      try {
        await d.mostraOrion?.();
      } catch {
        /* noop */
      }
      const codaPonte = a.codaConsegne?.length
        ? ` Questo lavoro riguardava le consegne del Ponte (ids: ${a.codaConsegne.join(", ")}): se l'esito è positivo spuntale con segna_consegne_fatte, altrimenti lasciale in coda e dillo con onestà.`
        : "";
      inviaAOrionRef.current?.(
        `[Sistema] Esito della Mano per l'obiettivo "${a.obiettivo}": ${esitoFinale}. Riferisci all'utente in UNA frase, con verità operativa (se è una domanda, faglela).${codaPonte}`,
        false,
        undefined,
        true
      );
    }
  }, []);
  const avviaManoRef = useRef(avviaMano);
  avviaManoRef.current = avviaMano;
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

  // ── POSTA IN ARRIVO: apertura, risposta e conferma (tutto locale) ──────────
  const annuncioRef = useRef(annuncio);
  annuncioRef.current = annuncio;
  const rispostaARef = useRef(rispostaA);
  rispostaARef.current = rispostaA;
  const bozzaRef = useRef(bozzaRisposta);
  bozzaRef.current = bozzaRisposta;

  // Apre un arrivo in chat: bolla con il contenuto (media inclusi) + voce.
  const apriArrivo = useCallback((a: ArrivoWA, conVoce = true) => {
    annunciati.current.add(a.id);
    void fetch("/api/posta/arrivi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [a.id] }),
    }).catch(() => {});
    setMessages((m) => [...m, { role: "assistant", content: "", arrivo: a }]);
    if (!conVoce) return;
    const chi = chiDi(a);
    if (a.canale === "email") {
      const sunto = a.contenuto ? ` ${riassuntoParlato(a.contenuto)}` : "";
      speakRef.current?.(`Mail da ${chi}. Oggetto: ${a.oggetto ?? "senza oggetto"}.${sunto}`);
    } else if (a.tipo === "testo" && a.contenuto) speakRef.current?.(`${chi} scrive: ${a.contenuto}`);
    else if (a.tipo === "audio") speakRef.current?.(`Messaggio vocale da ${chi}: lo riproduco.`);
    else if (a.tipo === "foto") speakRef.current?.(`${chi} ha mandato una foto: eccola.`);
    else if (a.tipo === "video") speakRef.current?.(`${chi} ha mandato un video: eccolo.`);
    else speakRef.current?.(`${chi} ha mandato un documento: te l'ho messo in chat.`);
  }, []);

  const apriAnnunciati = useCallback(() => {
    const lista = annuncioRef.current;
    setAnnuncio([]);
    lista.forEach((a, i) => apriArrivo(a, i === 0));
  }, [apriArrivo]);

  const avviaRisposta = useCallback((a: ArrivoWA) => {
    setRispostaA(a);
    setBozzaRisposta(null);
    speakRef.current?.(
      a.canale === "email"
        ? `Dimmi la risposta per ${chiDi(a)}: parte per email, con l'oggetto già pronto.`
        : `Dimmi la risposta per ${chiDi(a)}: parla, o scrivila qui sotto.`
    );
  }, []);

  const annullaRisposta = useCallback(() => {
    setRispostaA(null);
    setBozzaRisposta(null);
  }, []);

  // Invio vero: la risposta parte con le parole ESATTE del titolare.
  const confermaBozza = useCallback(async () => {
    const a = rispostaARef.current;
    const testo = bozzaRef.current?.trim();
    if (!a || !testo) return;
    setRispostaA(null);
    setBozzaRisposta(null);
    try {
      const r = await fetch("/api/posta/rispondi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comunicazione_id: a.id, canale: a.canale, telefono: a.telefono, testo }),
      });
      const d: { ok?: boolean; simulato?: boolean; canale?: string; errore?: string } = await r.json();
      if (d.ok) {
        const via = d.canale === "email" ? " (email)" : "";
        const nota = d.simulato
          ? d.canale === "email"
            ? " · invio simulato: la casella email non è ancora collegata"
            : " · invio simulato: WhatsApp non è ancora collegato"
          : "";
        setMessages((m) => [...m, { role: "assistant", content: `✓ Risposta a ${chiDi(a)}${via}: «${testo}»${nota}` }]);
        speakRef.current?.(d.simulato ? "Registrata: partirà appena il canale sarà collegato." : "Inviata.");
      } else {
        setMessages((m) => [...m, { role: "assistant", content: `Non sono riuscito a inviare la risposta a ${chiDi(a)}: ${d.errore ?? "errore"}.` }]);
        speakRef.current?.("Non sono riuscito a inviarla.");
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Connessione interrotta: la risposta non è partita." }]);
    }
  }, []);

  // ── LA SEGRETARIA LIVE: la consegna appare, lei la scrive (o apre il pannello) ──
  const consegneViveRef = useRef(consegneVive);
  consegneViveRef.current = consegneVive;

  const scriviConsegneVive = useCallback(async () => {
    const vive = consegneViveRef.current;
    if (!vive.length) return;
    setConsegneVive([]);
    const d = desktopBridge();
    if (d?.manoClic) {
      // Desktop: la Mano scrive nel gestionale, live, davanti all'utente.
      const obiettivo =
        `Apri ${vive[0].sistema} e riporta ESATTAMENTE queste modifiche (sono le consegne del Ponte), una alla volta, poi salva:\n` +
        vive.map((c, i) => `${i + 1}) ${descriviConsegna(c)} — ${dettaglioConsegna(c)}`).join("\n");
      speakRef.current?.("Vado: guarda lo schermo.");
      await avviaManoRef.current?.({ obiettivo, app: vive[0].sistema, codaConsegne: vive.map((c) => c.id) });
    } else {
      // Web: niente Mano — pannello con il copia-incolla perfetto.
      try {
        const r = await fetch("/api/consegne");
        const dd: { consegne?: ConsegnaViva[] } = await r.json();
        setViste([{ tipo: "consegne", dati: { consegne: (dd.consegne ?? []) as never } } as Vista]);
        speakRef.current?.("Ecco le consegne pronte da incollare nel tuo gestionale.");
      } catch {
        /* offline: resteranno in coda */
      }
    }
  }, []);

  // Sondaggio del Ponte (30s): le consegne NUOVE apparse mentre lavori vengono
  // annunciate; quelle già in coda all'avvio le orchestra il briefing.
  // In DEMO il flusso automatico tace: le consegne le orchestra il tutorial
  // (la tappa del gestionale), non un annuncio che piomba a metà giro.
  const demoRef = useRef(demo);
  demoRef.current = demo;
  useEffect(() => {
    if (!autenticato) return;
    let fermo = false;
    const controlla = async () => {
      if (fermo || manoAttivaRef.current || demoRef.current) return;
      try {
        const r = await fetch("/api/consegne");
        if (!r.ok) return;
        const d: { consegne?: ConsegnaViva[] } = await r.json();
        const tutte = d.consegne ?? [];
        if (!consegneBaseline.current) {
          consegneBaseline.current = true;
          tutte.forEach((c) => consegneAnnunciate.current.add(c.id));
          return;
        }
        const nuove = tutte.filter((c) => !consegneAnnunciate.current.has(c.id));
        if (!nuove.length) return;
        nuove.forEach((c) => consegneAnnunciate.current.add(c.id));
        setConsegneVive((prev) => [...prev, ...nuove]);
        try {
          canaleNucleo.current?.postMessage({ tipo: "azione", nome: "consegne", testo: descriviConsegna(nuove[0]).slice(0, 30) });
        } catch {
          /* noop */
        }
        const annuncia = (tentativi = 0) => {
          if (fermo) return;
          if ((occupatoRef.current || document.hidden) && tentativi < 8) {
            setTimeout(() => annuncia(tentativi + 1), 2500);
            return;
          }
          // La segretaria VERA: annuncia e FA, senza chiedere il permesso.
          // Un piccolo respiro (3.5s) per dire «aspetta», poi parte da sola.
          speakRef.current?.(
            desktopBridge()?.manoClic
              ? `${descriviConsegna(nuove[0])}. Te lo scrivo nel gestionale: guarda.`
              : `${descriviConsegna(nuove[0])}. Ti apro le consegne pronte per il gestionale.`
          );
          setTimeout(() => {
            if (fermo || manoAttivaRef.current) return;
            if (!consegneViveRef.current.length) return; // «aspetta» detto in tempo
            void scriviConsegneVive();
          }, 3500);
        };
        annuncia();
      } catch {
        /* offline o errore: si riprova al prossimo giro */
      }
    };
    void controlla();
    const id = setInterval(controlla, 30000);
    return () => {
      fermo = true;
      clearInterval(id);
    };
  }, [autenticato]);

  // Quando il mic è attivo in modalità appunti, la voce o detta o comanda.
  gestisciVoceRef.current = (t: string) => {
    // ── Prima di tutto: il giro della POSTA (sì/apri, dettatura, conferma) ──
    const bassa = t.trim().toLowerCase().replace(/[.!?]+$/, "");
    if (bozzaRef.current !== null && rispostaARef.current) {
      if (/^(s[iì]\b|invia|manda|vai|ok\b|conferm)/.test(bassa)) {
        void confermaBozza();
        return;
      }
      if (/^(no\b|annulla|lascia stare|niente)/.test(bassa)) {
        annullaRisposta();
        speakRef.current?.("Va bene, non la invio.");
        return;
      }
      // Qualsiasi altra frase: è la nuova versione della risposta.
      setBozzaRisposta(t.trim());
      speakRef.current?.(`Nuova risposta: ${t.trim()}. La invio?`);
      return;
    }
    if (rispostaARef.current) {
      if (/^(annulla|lascia stare|niente|no basta|non rispondere)/.test(bassa)) {
        annullaRisposta();
        speakRef.current?.("Annullato.");
        return;
      }
      setBozzaRisposta(t.trim());
      speakRef.current?.(`Invio: ${t.trim()}. Confermi?`);
      return;
    }
    if (annuncioRef.current.length) {
      if (bassa.length < 30 && /^(s[iì]\b|apri|aprilo|aprili|leggi|leggilo|fammi vedere|fammelo vedere|sentiamo|vai\b|ok\b)/.test(bassa)) {
        apriAnnunciati();
        return;
      }
      if (/^(no\b|dopo\b|più tardi|non ora|adesso no)/.test(bassa)) {
        setAnnuncio([]);
        speakRef.current?.("Va bene, restano in attesa.");
        return;
      }
    }
    // La consegna del Ponte sta per partire da sola: «aspetta» la ferma,
    // «sì/vai» la fa partire subito senza aspettare il respiro.
    if (consegneViveRef.current.length) {
      if (/^(aspetta|ferma(ti)?|no\b|dopo\b|più tardi|non ora|adesso no|lascia)/.test(bassa)) {
        setConsegneVive([]);
        speakRef.current?.("Va bene, resta in coda: la trovi nelle consegne.");
        return;
      }
      if (bassa.length < 30 && /^(s[iì]\b|scrivi|scrivile|scrivilo|vai\b|subito|procedi|fallo|ok\b)/.test(bassa)) {
        void scriviConsegneVive();
        return;
      }
    }
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
        // ORION DEMO: badge e binario del tutorial sopravvivono al reload.
        setDemo(Boolean(s.demo));
        if (s.demo && s.tutorial) setTutorial(s.tutorial as BinarioTutorial);
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

  const avviaCheckout = useCallback(async (piano: "pro" | "azienda") => {
    try {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ piano }),
      });
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

  // Il mini-nucleo desktop respira insieme a questo (stesso stato, in onda).
  useEffect(() => {
    try {
      canaleNucleo.current?.postMessage({ tipo: "stato", core: coreState });
    } catch {
      /* noop */
    }
  }, [coreState]);

  // Comunica al motore vocale quando ORION sta elaborando (così non riarma il mic durante l'attesa).
  useEffect(() => {
    setBusy(loading);
  }, [loading, setBusy]);

  // LA POSTA IN ARRIVO: ogni 25s (e subito all'avvio) l'app guarda se ci sono
  // messaggi dei clienti non ancora aperti (sola lettura DB, zero crediti) e
  // ORION li ANNUNCIA a voce: «È arrivato un messaggio da X, vuoi aprirlo?».
  useEffect(() => {
    if (!autenticato) return;
    let fermo = false;
    const annunciaVoce = (nuovi: ArrivoWA[], tentativi = 0) => {
      if (fermo) return;
      // Non interrompe ORION mentre parla o lavora, e non parla a schermo
      // nascosto (la scheda resta comunque lì ad aspettare): riprova tra poco.
      if ((occupatoRef.current || document.hidden) && tentativi < 8) {
        setTimeout(() => annunciaVoce(nuovi, tentativi + 1), 2500);
        return;
      }
      if (nuovi.length === 1) {
        const a = nuovi[0];
        speakRef.current?.(
          a.canale === "email"
            ? `È arrivata una mail importante da ${chiDi(a)}. Oggetto: ${a.oggetto ?? "senza oggetto"}. Vuoi aprirla?`
            : `È arrivato un messaggio da ${chiDi(a)}. Vuoi aprirlo?`
        );
      } else {
        speakRef.current?.(
          `Sono arrivati ${nuovi.length} tra messaggi e mail: ${nuovi.map(chiDi).slice(0, 3).join(", ")}. Vuoi aprirli?`
        );
      }
    };
    const controlla = async () => {
      if (fermo) return;
      try {
        const r = await fetch("/api/posta/arrivi");
        if (!r.ok) return;
        const d: { arrivi?: ArrivoWA[] } = await r.json();
        const nuovi = (d.arrivi ?? []).filter((a) => !annunciati.current.has(a.id));
        if (!nuovi.length) return;
        nuovi.forEach((a) => annunciati.current.add(a.id));
        setAnnuncio((prev) => [...prev, ...nuovi]);
        try {
          const primo = nuovi[0];
          canaleNucleo.current?.postMessage({
            tipo: "azione",
            nome: primo.canale === "email" ? "mail" : "whatsapp",
            testo: chiDi(primo),
          });
        } catch {
          /* noop */
        }
        annunciaVoce(nuovi);
      } catch {
        /* offline o errore: si riprova al prossimo giro */
      }
    };
    void controlla();
    const id = setInterval(controlla, 25000);
    return () => {
      fermo = true;
      clearInterval(id);
    };
  }, [autenticato]);

  const inviaTesto = (e: React.FormEvent) => {
    e.preventDefault();
    const t = testoInput.trim();
    if (!t || loading) return;
    setTestoInput("");
    // Se sta rispondendo a un messaggio, il testo scritto È la risposta.
    if (rispostaA) {
      setBozzaRisposta(t);
      return;
    }
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
  if (autenticato === null || (lancio === null && !autenticato)) {
    return (
      <main className="grid h-screen place-items-center">
        <OrionCore state="thinking" size={120} />
      </main>
    );
  }
  if (!autenticato) {
    // Lucchetto del lancio: conto alla rovescia al posto dell'accesso.
    if (lancioChiuso && !mostraAccesso) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
          <OrionCore state="idle" size={130} />
          <h1 className="mt-6 text-2xl font-semibold text-slate-50">ORION sta arrivando</h1>
          <p className="mt-2 max-w-md text-slate-400">
            Stiamo accendendo i motori. Al lancio, i founding member entrano per primi.
          </p>
          <div className="mt-6 rounded-2xl border border-cyan-400/30 bg-cyan-400/5 px-8 py-4">
            <div className="text-2xl font-extrabold tracking-widest text-slate-50">PRESTO DISPONIBILE</div>
          </div>
          <a href="/#beta" className="mt-6 rounded-xl bg-cyan-500/90 px-6 py-3 font-medium text-slate-900 transition hover:bg-cyan-400">
            Prenota il tuo posto founding member
          </a>
          <button onClick={() => setMostraAccesso(true)} className="mt-4 text-sm text-slate-500 hover:text-slate-300">
            Sono della lista → Accedi
          </button>
        </main>
      );
    }
    return <AuthScreen onAuth={() => setAutenticato(true)} />;
  }

  // Paywall / scelta piano: se Stripe è attivo E l'accesso non è consentito
  // (mai avviato = "da_attivare", oppure prova/abbonamento scaduto). In modalità
  // demo (Stripe spento) non blocca nulla.
  if (abbonamento?.configurato && !abbonamento.accessoConsentito) {
    const scaduto = abbonamento.stato === "scaduto";
    // Founding member (lista beta): prezzi mostrati già scontati, per sempre.
    const founder = Boolean(abbonamento.founder && abbonamento.scontoFounder > 0);
    const scontato = (prezzo: number) => Math.round(prezzo * (100 - abbonamento.scontoFounder)) / 100;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
        <div className="fade-in w-full max-w-3xl text-center">
          <OrionCore state="idle" size={92} />
          <h1 className="mt-5 text-2xl font-semibold text-slate-50">
            {scaduto ? "Riattiva il tuo ORION" : "Scegli il tuo ORION"}
          </h1>
          <p className="mt-2 text-slate-400">
            {scaduto
              ? "La tua prova o il tuo abbonamento è terminato. Scegli un piano per continuare."
              : "7 giorni di prova gratuita. Nessun addebito ora: disdici quando vuoi durante la prova."}
          </p>

          {founder && (
            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm text-amber-100">
              🏆 <strong>Founding member</strong> — sconto del {abbonamento.scontoFounder}% a vita, già applicato
            </div>
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {(["pro", "azienda"] as const).map((p) => {
              const info = PIANI[p];
              return (
                <div key={p} className="glass flex flex-col rounded-2xl border border-white/10 p-6 text-left">
                  <div className="text-xs uppercase tracking-wider text-cyan-300">{info.sottotitolo}</div>
                  <div className="mt-1 text-xl font-semibold text-slate-50">{info.nome}</div>
                  <div className="mt-3 flex items-end gap-1">
                    {founder && (
                      <span className="mb-1 mr-1 text-lg font-medium text-slate-500 line-through">€{info.prezzo}</span>
                    )}
                    <span className="text-4xl font-bold text-slate-50">€{founder ? scontato(info.prezzo) : info.prezzo}</span>
                    <span className="mb-1 text-sm text-slate-400">/{info.periodo.replace("al ", "")}</span>
                  </div>
                  <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-300">
                    {info.caratteristiche.map((c) => (
                      <li key={c} className="flex gap-2">
                        <span className="text-cyan-400">✓</span> {c}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => avviaCheckout(p)}
                    className="mt-6 w-full rounded-xl bg-cyan-500/90 px-6 py-3 font-medium text-slate-900 transition hover:bg-cyan-400"
                  >
                    {scaduto ? `Attiva ${info.nome}` : "Inizia la prova di 7 giorni"}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mt-5 text-xs text-slate-500">
            Pagamenti sicuri con Stripe · Disdici in qualsiasi momento · La carta serve solo per attivare la prova
          </p>
          <button onClick={logout} className="mt-4 text-sm text-slate-500 hover:text-slate-300">Esci</button>
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
            onClick={() => {
              // Mentre parla: un click zittisce SOLO questa frase (leggi in chat).
              if (speaking) cancelSpeak();
              else setVoiceOn(!voiceOn);
            }}
            className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            title={speaking ? "Zittisci questa frase (la leggi in chat)" : voiceOn ? "Disattiva voce" : "Attiva voce"}
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

      {/* Stage: la CHAT a sinistra (dopo il benvenuto), i pannelli al centro,
          il NUCLEO libero che dal centro vola in alto a destra. */}
      <section className="relative flex min-h-0 flex-1 px-5">
        {/* La conversazione, come una chat: ORION a sinistra, tu a destra. */}
        {chatAttiva && (
          <aside className="chat-entra chat-colonna mr-4 w-[360px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
              <span className="size-2 rounded-full bg-cyan-400 shadow-[0_0_8px] shadow-cyan-400/80" />
              <span className="text-[11px] font-semibold tracking-[0.22em] text-slate-400">CONVERSAZIONE</span>
            </div>
            <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
              {messages.map((m, i) =>
                m.arrivo ? (
                  <BollaArrivo key={i} a={m.arrivo} onRispondi={() => avviaRisposta(m.arrivo!)} />
                ) : (
                  <div
                    key={i}
                    className={`fade-in max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "ml-auto rounded-br-sm bg-cyan-500/20 text-cyan-50"
                        : "rounded-bl-sm bg-white/8 text-slate-100"
                    }`}
                  >
                    {m.content}
                  </div>
                )
              )}
              {interim && (
                <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm border border-cyan-400/20 bg-cyan-500/10 px-3.5 py-2 text-sm italic text-cyan-200/80">
                  {interim}…
                </div>
              )}
              {loading && (
                <div className="flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white/8 px-4 py-3.5">
                  <span className="chat-puntino" />
                  <span className="chat-puntino" style={{ animationDelay: ".15s" }} />
                  <span className="chat-puntino" style={{ animationDelay: ".3s" }} />
                </div>
              )}
              <div ref={chatFineRef} />
            </div>
          </aside>
        )}

        {/* Il palco dei pannelli */}
        <div className="relative min-w-0 flex-1">
          {haPannelli && !gestiAttivi ? (
            <div className="fade-in relative h-full pb-2">
              <button
                onClick={() => setViste([])}
                className="absolute -top-1 right-24 z-10 grid size-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                title="Chiudi e torna a ORION"
              >
                <IconClose className="h-4 w-4" />
              </button>
              <PanelStage viste={viste} />
            </div>
          ) : chatAttiva ? (
            <div className="grid h-full place-items-center">
              <p className="max-w-md px-6 text-center text-sm text-slate-600">
                {supported
                  ? "Parla o scrivi: agenda, clienti e pannelli compaiono qui."
                  : "Scrivi qui sotto: agenda, clienti e pannelli compaiono qui."}
              </p>
            </div>
          ) : null}
        </div>

        {/* IL NUCLEO, libero: grande al centro per il benvenuto, poi vola
            in alto a destra (piccolo) con una sola, morbida transizione. */}
        <div
          onClick={() => {
            // Mentre parla: un tocco lo zittisce (solo questa frase); da zitto: microfono.
            if (speaking) cancelSpeak();
            else toggleMic();
          }}
          title={speaking ? "Zittisci questa frase (la leggi in chat)" : micAttivo ? "Microfono attivo — tocca per mutare" : "Tocca per attivare il microfono"}
          className="absolute z-20 cursor-pointer"
          style={{
            left: chatAttiva ? "100%" : "50%",
            top: chatAttiva ? 0 : "36%",
            transform: chatAttiva ? "translate(-118px, 4px) scale(0.34)" : "translate(-50%, -50%) scale(1)",
            transformOrigin: "top left",
            transition: "left 1.15s cubic-bezier(.4,0,.2,1), top 1.15s cubic-bezier(.4,0,.2,1), transform 1.15s cubic-bezier(.4,0,.2,1)",
          }}
        >
          <OrionCore state={coreState} size={260} />
        </div>

        {/* Il sottotitolo del benvenuto: vive solo finché il nucleo è al centro. */}
        {!chatAttiva && (
          <div className="pointer-events-none absolute left-1/2 top-[60%] w-full max-w-2xl -translate-x-1/2 px-6 text-center">
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
        )}
      </section>

      {/* Suggerimenti contestuali: tra lo stage e la barra di input, non coprono i pannelli. */}
      <Suggerimenti suggerimenti={suggerimenti} onScegli={(t) => inviaAOrion(t)} disabled={loading} />

      {/* Dock */}
      <footer className="flex items-center gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
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
      {/* La Mano al lavoro: stato + STOP (visibile quando ORION è in finestra) */}
      {manoStato && (
        <div className="fade-in fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-cyan-400/40 bg-[#0a141c]/95 px-4 py-3 shadow-2xl backdrop-blur">
          <span className="text-lg">🖐</span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold tracking-[0.18em] text-cyan-300">LA MANO DI ORION · PASSO {manoStato.passo}</div>
            <div className="max-w-xs truncate text-sm text-slate-200">{manoStato.spiegazione}</div>
          </div>
          <button
            onClick={() => {
              manoStopRef.current = true;
            }}
            className="ml-1 rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-400/20"
          >
            STOP
          </button>
        </div>
      )}

      {/* Le coreografie della chat */}
      <style>{`
        .chat-puntino { width: 7px; height: 7px; border-radius: 99px; background: rgba(150,220,240,.85); display: inline-block; animation: chatPuntino 1s ease-in-out infinite; }
        @keyframes chatPuntino { 0%,100% { opacity: .25; transform: translateY(0) } 50% { opacity: 1; transform: translateY(-3px) } }
        .chat-entra { animation: chatEntra .9s cubic-bezier(.16,1,.3,1) both; }
        @keyframes chatEntra { from { opacity: 0; transform: translateX(-26px) } to { opacity: 1; transform: none } }
        .chat-colonna { display: none; }
        @media (min-width: 768px) { .chat-colonna { display: flex; flex-direction: column; } }
      `}</style>

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
              {messages.map((m, i) =>
                m.arrivo ? (
                  <BollaArrivo key={i} a={m.arrivo} onRispondi={() => avviaRisposta(m.arrivo!)} />
                ) : (
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
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ORION DEMO: il binario del giro guidato, sempre sott'occhio. */}
      {demo && tutorial && tutorial.percorso && autenticato && <BinarioDemo t={tutorial} />}

      {/* L'ANNUNCIO della posta: «È arrivato un messaggio da X, vuoi aprirlo?» */}
      {annuncio.length > 0 && !rispostaA && (
        <div
          className="fade-in rounded-2xl border border-emerald-400/30 bg-[#081712]/95 p-4 shadow-2xl backdrop-blur"
          style={{ position: "fixed", right: 20, bottom: 96, width: 320, zIndex: 40 }}
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-100">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-base">
              {annuncio.length > 1 ? "📬" : annuncio[0].canale === "email" ? "✉️" : <LogoWhatsApp size={18} />}
            </span>
            {annuncio.length === 1
              ? annuncio[0].canale === "email"
                ? `Mail importante da ${chiDi(annuncio[0])}`
                : `Messaggio da ${chiDi(annuncio[0])}`
              : `${annuncio.length} nuovi arrivi`}
          </div>
          {annuncio.length === 1 && annuncio[0].canale === "email" && annuncio[0].oggetto && (
            <p className="mb-2 line-clamp-2 text-xs font-medium text-slate-200/90">{annuncio[0].oggetto}</p>
          )}
          {annuncio.length === 1 && annuncio[0].canale !== "email" && annuncio[0].tipo === "testo" && annuncio[0].contenuto && (
            <p className="mb-2 line-clamp-2 text-xs text-slate-300/80">{annuncio[0].contenuto}</p>
          )}
          {annuncio.length === 1 && annuncio[0].canale !== "email" && annuncio[0].tipo !== "testo" && (
            <p className="mb-2 text-xs text-slate-300/80">
              {annuncio[0].tipo === "audio" ? "🎙 Messaggio vocale" : annuncio[0].tipo === "foto" ? "📷 Foto" : annuncio[0].tipo === "video" ? "🎬 Video" : "📎 Documento"}
            </p>
          )}
          {annuncio.length > 1 && <p className="mb-2 text-xs text-slate-300/80">{annuncio.map(chiDi).join(", ")}</p>}
          <div className="flex gap-2">
            <button
              onClick={apriAnnunciati}
              className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-400/20 px-3 py-1.5 text-sm font-medium text-emerald-50 hover:bg-emerald-400/30"
            >
              Apri
            </button>
            <button
              onClick={() => setAnnuncio([])}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-400 hover:bg-white/5"
            >
              Più tardi
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">A voce: «sì» per aprire · «più tardi» per rimandare</p>
        </div>
      )}

      {/* LA RISPOSTA: dettata o scritta, parte con le parole esatte del titolare. */}
      {rispostaA && (
        <div
          className="fade-in rounded-2xl border border-cyan-400/30 bg-[#081420]/95 p-4 shadow-2xl backdrop-blur"
          style={{ position: "fixed", right: 20, bottom: 96, width: 320, zIndex: 40 }}
        >
          <div className="mb-1 flex items-center justify-between text-sm font-semibold text-cyan-100">
            <span>↩︎ Risposta a {chiDi(rispostaA)}</span>
            <button onClick={annullaRisposta} className="text-cyan-200/50 hover:text-cyan-100" title="Annulla">
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </div>
          {bozzaRisposta === null ? (
            <p className="text-xs text-slate-400">Detta la risposta a voce, oppure scrivila qui sotto e premi invio.</p>
          ) : (
            <>
              <p className="mb-2 rounded-lg bg-white/5 p-2 text-sm text-slate-100">«{bozzaRisposta}»</p>
              <div className="flex gap-2">
                <button
                  onClick={() => void confermaBozza()}
                  className="flex-1 rounded-lg border border-cyan-400/40 bg-cyan-400/20 px-3 py-1.5 text-sm font-medium text-cyan-50 hover:bg-cyan-400/30"
                >
                  Invia
                </button>
                <button
                  onClick={() => setBozzaRisposta(null)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-400 hover:bg-white/5"
                >
                  Riprova
                </button>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">A voce: «sì, invia» oppure «annulla»</p>
            </>
          )}
        </div>
      )}

      {/* LA CONSEGNA LIVE: la segretaria vuole scrivere nel gestionale, ora. */}
      {consegneVive.length > 0 && annuncio.length === 0 && !rispostaA && (
        <div
          className="fade-in rounded-2xl border border-amber-400/30 bg-[#1a1206]/95 p-4 shadow-2xl backdrop-blur"
          style={{ position: "fixed", right: 20, bottom: 96, width: 320, zIndex: 40 }}
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-100">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-400/15 text-base">🌉</span>
            {consegneVive.length === 1 ? "Modifica per il gestionale" : `${consegneVive.length} modifiche per il gestionale`}
          </div>
          <p className="mb-2 text-xs text-slate-300/85">
            {descriviConsegna(consegneVive[0])}
            {consegneVive.length > 1 ? ` — e altre ${consegneVive.length - 1}` : ""}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void scriviConsegneVive()}
              className="flex-1 rounded-lg border border-amber-400/40 bg-amber-400/20 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-amber-400/30"
            >
              {desktopBridge()?.manoClic ? "Scrivi subito" : "Vedi consegne"}
            </button>
            <button
              onClick={() => setConsegneVive([])}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-400 hover:bg-white/5"
            >
              Aspetta
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">Parte da sola tra un attimo — a voce: «aspetta» per fermarla</p>
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
