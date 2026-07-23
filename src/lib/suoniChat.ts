// ── I SUONI DELLA CHAT DI ORION ──────────────────────────────────────────────
// Firma sonora ORIGINALE, sintetizzata al volo con WebAudio: niente file,
// niente campioni presi in prestito. Tre gesti sonori, tutti gentili:
//  - inviato: una goccia che sale (il messaggio parte)
//  - ricevuto: una goccia più calda che scende (ORION risponde)
//  - tasto: il tic morbido della scrittura, appena percettibile
// Volumi bassi per scelta: devono accompagnare, mai stancare.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Una "goccia": sinusoide che scivola tra due frequenze con inviluppo dolce.
function goccia(daHz: number, aHz: number, durata: number, volume: number, ritardo = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + ritardo;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(daHz, t0);
  osc.frequency.exponentialRampToValueAtTime(aHz, t0 + durata);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durata);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durata + 0.02);
}

// Il messaggio dell'utente parte: due gocce che salgono, leggere.
export function suonoInviato() {
  goccia(540, 860, 0.09, 0.1);
  goccia(860, 1080, 0.07, 0.06, 0.05);
}

// ORION risponde: una goccia calda che scende, con una seconda voce sotto.
export function suonoRicevuto() {
  goccia(880, 560, 0.13, 0.11);
  goccia(440, 330, 0.16, 0.05, 0.03);
}

// Il tic della tastiera: brevissimo, tondo, con un filo di variazione naturale.
let ultimoTasto = 0;
export function suonoTasto() {
  const ora = performance.now();
  if (ora - ultimoTasto < 45) return; // mai una raffica fastidiosa
  ultimoTasto = ora;
  const base = 1500 + Math.random() * 500;
  goccia(base, base * 0.82, 0.035, 0.028);
}
