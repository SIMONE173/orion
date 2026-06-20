"use client";

// Dettatura per ORION Desktop, in ASCOLTO CONTINUO come il web: si attiva una
// volta sola e poi, ogni volta che l'utente fa una pausa, la frase viene
// trascritta (offline, Whisper) e inviata a ORION da sola. Mentre ORION parla o
// elabora, l'ascolto si mette in pausa (niente eco). Solo nel desktop (Electron).

type Bridge = {
  sttPronto: () => Promise<{ ok: boolean; errore?: string }>;
  trascrivi: (pcm: Float32Array) => Promise<{ ok: boolean; testo?: string; errore?: string }>;
};

function bridge(): Bridge | null {
  const w = window as unknown as { orionDesktop?: Partial<Bridge> };
  const d = w.orionDesktop;
  return d && typeof d.trascrivi === "function" ? (d as Bridge) : null;
}

export function sttDesktopDisponibile(): boolean {
  return bridge() !== null;
}

export function preparaStt() {
  bridge()?.sttPronto().catch(() => {});
}

// Soglie del rilevamento voce/pausa (tarabili).
const SOGLIA_VOCE = 0.04; // sopra = sta parlando
const SILENZIO_MS = 1000; // pausa che chiude la frase
const MIN_MS = 350; // frase più corta di così = ignorata (rumore)
const MAX_MS = 15000; // taglio di sicurezza

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let processor: ScriptProcessorNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let srcRate = 48000;
let attivo = false;

let seg: Float32Array[] = [];
let segLen = 0;
let parlando = false;
let ultimaVoce = 0;
let coda: Promise<void> = Promise.resolve();
let cfg: { onTesto: (t: string) => void; puoAscoltare: () => boolean } | null = null;

function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

function a16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return input;
  const ratio = fromRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = start; j < end; j++) s += input[j];
    out[i] = s / Math.max(1, end - start);
  }
  return out;
}

function reset() {
  seg = [];
  segLen = 0;
  parlando = false;
}

// Chiude la frase corrente, la trascrive (in coda) e la consegna a ORION.
function finalizza() {
  const pezzi = seg;
  const campioni = segLen;
  reset();
  if (!cfg || campioni < srcRate * (MIN_MS / 1000)) return;
  const pcm = new Float32Array(campioni);
  let off = 0;
  for (const c of pezzi) {
    pcm.set(c, off);
    off += c.length;
  }
  const pcm16 = a16k(pcm, srcRate);
  const onTesto = cfg.onTesto;
  coda = coda.then(async () => {
    const b = bridge();
    if (!b) return;
    const r = await b.trascrivi(pcm16).catch(() => ({ ok: false }) as const);
    if (r.ok && r.testo) {
      const t = r.testo.trim();
      if (t) onTesto(t);
    }
  });
}

export async function avviaAscoltoContinuo(opts: {
  onTesto: (t: string) => void;
  puoAscoltare: () => boolean;
}): Promise<void> {
  if (attivo) return;
  cfg = opts;
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  srcRate = ctx.sampleRate;
  source = ctx.createMediaStreamSource(stream);
  processor = ctx.createScriptProcessor(4096, 1, 1);
  reset();
  processor.onaudioprocess = (e) => {
    if (!cfg) return;
    const frame = e.inputBuffer.getChannelData(0);
    // Mentre ORION parla o elabora: non ascoltare (niente eco), scarta la frase in corso.
    if (!cfg.puoAscoltare()) {
      if (parlando) reset();
      return;
    }
    const livello = rms(frame);
    const ora = performance.now();
    if (livello > SOGLIA_VOCE) {
      parlando = true;
      ultimaVoce = ora;
      seg.push(new Float32Array(frame));
      segLen += frame.length;
    } else if (parlando) {
      seg.push(new Float32Array(frame));
      segLen += frame.length;
      if (ora - ultimaVoce > SILENZIO_MS || segLen > srcRate * (MAX_MS / 1000)) finalizza();
    }
  };
  source.connect(processor);
  processor.connect(ctx.destination);
  attivo = true;
}

export function fermaAscoltoContinuo() {
  cfg = null;
  try {
    processor?.disconnect();
    source?.disconnect();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    ctx?.close();
  } catch {
    /* noop */
  }
  processor = null;
  source = null;
  stream = null;
  ctx = null;
  attivo = false;
  reset();
}
