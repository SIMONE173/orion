"use client";

// ── IL PALCO DELLA DEMO ──────────────────────────────────────────────────────
// Il centro dello schermo, durante la demo, è una presentazione animata: per
// ogni tappa spiega con parole semplici COS'È una funzione, PERCHÉ serve e COME
// provarla. Prima che succeda qualcosa. I pannelli veri di ORION restano quelli
// di sempre e si aprono a parte: questo è il "coach" che accompagna, come al
// primo avvio di un videogioco. Usa le classi cyan (che seguono il tema) e
// var(--alone) per i bagliori, così alla tappa "Su misura" cambia colore con te.

export type PalcoContenuto = {
  titolo: string;
  icona: string;
  numero: number;
  totale: number;
  sottotitolo: string;
  cosa: string;
  perche: string;
  prova: string;
};

const STILE = `
@keyframes palco-in { from { opacity: 0; transform: translateY(22px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes palco-su { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes palco-icona { 0% { opacity: 0; transform: scale(.4) rotate(-10deg); } 60% { transform: scale(1.12) rotate(4deg); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
@keyframes palco-galleggia { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes palco-alone { 0%,100% { opacity: .45; transform: scale(1); } 50% { opacity: .9; transform: scale(1.08); } }
@keyframes palco-prova { 0%,100% { box-shadow: 0 0 0 0 rgb(var(--alone,56 232 255) / .0), inset 0 0 22px rgb(var(--alone,56 232 255) / .05); } 50% { box-shadow: 0 0 22px 1px rgb(var(--alone,56 232 255) / .28), inset 0 0 26px rgb(var(--alone,56 232 255) / .09); } }
@keyframes palco-freccia { 0%,100% { transform: translateX(0); opacity: .7; } 50% { transform: translateX(4px); opacity: 1; } }
@keyframes palco-punto { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
`;

// Cosa fa ORION, per la presentazione d'apertura (Chiamata 0).
const APERTURA = [
  { icona: "💬", testo: "Rispondo io ai tuoi clienti su WhatsApp — anche di notte, mentre dormi" },
  { icona: "📅", testo: "Tengo io la tua agenda: prenoto, sposto e riempio i buchi da solo" },
  { icona: "🖥️", testo: "Scrivo io nel gestionale che usi già — non devi cambiare niente" },
  { icona: "🧠", testo: "Ti conosco come una segretaria che lavora con te da anni" },
];

function Alone() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
      style={{
        background: "radial-gradient(closest-side, rgb(var(--alone, 56 232 255) / .10), transparent 70%)",
        animation: "palco-alone 6s ease-in-out infinite",
      }}
    />
  );
}

// La presentazione d'apertura: chi è ORION e cosa fa, mentre parte la Chiamata 0.
export function PalcoApertura() {
  return (
    <div className="relative flex h-full w-full items-center justify-center px-6">
      <style>{STILE}</style>
      <Alone />
      <div className="w-full max-w-2xl text-center" style={{ animation: "palco-in .7s cubic-bezier(.2,.8,.2,1) both" }}>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[.28em] text-cyan-200">
          🎬 ORION Demo
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
          Ciao, io sono <span className="text-cyan-300">ORION</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-slate-400 sm:text-lg">
          La segretaria che non dorme mai. Prima ci conosciamo con due domande — poi ti porto a fare un giro e ti
          mostro dal vivo, passo passo, tutto quello che faccio per te.
        </p>

        <div className="mx-auto mt-8 max-w-xl space-y-2.5 text-left">
          {APERTURA.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"
              style={{ animation: `palco-punto .55s ${0.5 + i * 0.18}s both` }}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-lg">{r.icona}</span>
              <span className="text-[15px] text-slate-200">{r.testo}</span>
            </div>
          ))}
        </div>

        <div
          className="mt-8 inline-flex items-center gap-2 text-sm text-cyan-200/80"
          style={{ animation: `palco-su .7s ${0.5 + APERTURA.length * 0.18}s both` }}
        >
          <span style={{ animation: "palco-freccia 1.3s ease-in-out infinite", display: "inline-flex" }}>←</span>
          Rispondimi qui a sinistra e cominciamo
        </div>
      </div>
    </div>
  );
}

// Il palco di una tappa: cos'è → perché → prova tu. Ri-animato a ogni tappa.
export function PalcoDemo({ c }: { c: PalcoContenuto }) {
  return (
    <div key={c.numero} className="relative flex h-full w-full items-center justify-center px-6">
      <style>{STILE}</style>
      <Alone />
      <div className="w-full max-w-xl" style={{ animation: "palco-in .6s cubic-bezier(.2,.8,.2,1) both" }}>
        {/* Progresso */}
        <div className="mb-5 flex items-center justify-center gap-1.5" style={{ animation: "palco-su .5s both" }}>
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/80">
            Tappa {c.numero} di {c.totale}
          </span>
          {Array.from({ length: c.totale }).map((_, i) => (
            <span
              key={i}
              className="h-1 rounded-full transition-all"
              style={{
                width: i === c.numero - 1 ? 20 : 6,
                background: i < c.numero ? "rgb(var(--alone, 56 232 255))" : "rgba(255,255,255,.14)",
                boxShadow: i === c.numero - 1 ? "0 0 8px rgb(var(--alone, 56 232 255) / .8)" : "none",
              }}
            />
          ))}
        </div>

        {/* Icona + titolo */}
        <div className="text-center">
          <div style={{ animation: "palco-galleggia 4.5s ease-in-out infinite" }}>
            <div
              className="mx-auto grid size-20 place-items-center rounded-3xl text-4xl"
              style={{
                background: "rgb(var(--alone, 56 232 255) / .10)",
                border: "1px solid rgb(var(--alone, 56 232 255) / .28)",
                boxShadow: "0 0 30px rgb(var(--alone, 56 232 255) / .15)",
                animation: "palco-icona .7s .1s cubic-bezier(.2,.8,.2,1) both",
              }}
            >
              {c.icona}
            </div>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl" style={{ animation: "palco-su .6s .2s both" }}>
            {c.titolo}
          </h2>
          <p className="mt-1 text-[15px] text-cyan-200/90" style={{ animation: "palco-su .6s .3s both" }}>
            {c.sottotitolo}
          </p>
        </div>

        {/* Cos'è / Perché */}
        <div className="mt-7 space-y-4">
          <div style={{ animation: "palco-su .6s .45s both" }}>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[.2em] text-slate-500">Cos'è</div>
            <p className="text-[15px] leading-relaxed text-slate-200">{c.cosa}</p>
          </div>
          <div style={{ animation: "palco-su .6s .6s both" }}>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[.2em] text-slate-500">Perché ti serve</div>
            <p className="text-[15px] leading-relaxed text-slate-300">{c.perche}</p>
          </div>
        </div>

        {/* Prova tu */}
        <div
          className="mt-7 rounded-2xl border px-5 py-4"
          style={{
            borderColor: "rgb(var(--alone, 56 232 255) / .35)",
            background: "rgb(var(--alone, 56 232 255) / .05)",
            animation: "palco-su .6s .78s both, palco-prova 2.6s 1.4s ease-in-out infinite",
          }}
        >
          <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] text-cyan-300">
            <span style={{ animation: "palco-freccia 1.3s ease-in-out infinite", display: "inline-flex" }}>▶</span>
            Prova tu
          </div>
          <p className="text-[15px] leading-relaxed text-slate-100">{c.prova}</p>
        </div>
      </div>
    </div>
  );
}
