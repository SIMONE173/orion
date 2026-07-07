"use client";

// Pillole tappabili con le prossime azioni sensate. Al tap, il testo della
// pillola viene inviato ESATTAMENTE come un messaggio dell'utente (stesso flusso
// della voce). Si sostituiscono a ogni turno e non coprono mai i pannelli:
// vivono in una riga a sé tra lo stage e la barra di input.
export function Suggerimenti({
  suggerimenti,
  onScegli,
  disabled,
}: {
  suggerimenti: string[];
  onScegli: (testo: string) => void;
  disabled?: boolean;
}) {
  if (!suggerimenti.length) return null;
  return (
    <div className="pointer-events-none flex flex-wrap gap-2 px-5 pb-1" aria-label="Azioni suggerite">
      {suggerimenti.slice(0, 3).map((s, i) => (
        <button
          key={`${s}-${i}`}
          type="button"
          onClick={() => onScegli(s)}
          disabled={disabled}
          style={{ animationDelay: `${i * 60}ms` }}
          className="suggerimento-pill pointer-events-auto inline-flex min-h-[44px] items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-400/20 disabled:opacity-40"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
