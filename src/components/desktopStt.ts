"use client";

// Dettatura per ORION Desktop: cattura l'audio del microfono, lo converte a
// PCM mono 16kHz e lo invia al motore vocale offline (Whisper) esposto dal
// preload come window.orionDesktop.trascrivi. Solo nel desktop (Electron).

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

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let processor: ScriptProcessorNode | null = null;
let chunks: Float32Array[] = [];
let srcRate = 48000;
let attivo = false;

// Riduce la frequenza a 16kHz facendo la media dei campioni (sufficiente per la voce).
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

export async function iniziaDettatura(): Promise<void> {
  if (attivo) return;
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  srcRate = ctx.sampleRate;
  const source = ctx.createMediaStreamSource(stream);
  processor = ctx.createScriptProcessor(4096, 1, 1);
  chunks = [];
  processor.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(ctx.destination);
  attivo = true;
}

function pulisci() {
  try {
    processor?.disconnect();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    ctx?.close();
  } catch {
    /* noop */
  }
  processor = null;
  stream = null;
  ctx = null;
  attivo = false;
}

// Ferma la registrazione, trascrive e restituisce il testo (o "").
export async function fermaETrascrivi(): Promise<string> {
  if (!attivo) return "";
  const pezzi = chunks;
  chunks = [];
  pulisci();

  const totale = pezzi.reduce((n, c) => n + c.length, 0);
  if (totale < 1600) return ""; // meno di ~0.1s: niente
  const pcm = new Float32Array(totale);
  let off = 0;
  for (const c of pezzi) {
    pcm.set(c, off);
    off += c.length;
  }
  const pcm16 = a16k(pcm, srcRate);

  const b = bridge();
  if (!b) return "";
  const r = await b.trascrivi(pcm16);
  return r.ok && r.testo ? r.testo : "";
}

export function annullaDettatura() {
  chunks = [];
  pulisci();
}

export function preparaStt() {
  bridge()?.sttPronto().catch(() => {});
}
