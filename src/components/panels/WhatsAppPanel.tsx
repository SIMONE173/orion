"use client";

import type { Vista } from "@/lib/orion/views";

type Dati = Extract<Vista, { tipo: "whatsapp" }>["dati"];

export function WhatsAppPanel({ dati }: { dati: Dati }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">
          ✆
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-cyan-100">
          WhatsApp{dati.cliente ? ` · ${dati.cliente}` : ""}
        </h2>
      </div>

      <div className="flex-1 space-y-2 overflow-auto pr-1">
        {dati.messaggi.length === 0 && !dati.bozza && (
          <div className="flex h-full items-center justify-center text-slate-400">
            Nessuna conversazione.
          </div>
        )}
        {dati.messaggi.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.direzione === "out" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                m.direzione === "out"
                  ? "rounded-br-sm bg-emerald-500/20 text-emerald-50"
                  : "rounded-bl-sm bg-white/8 text-slate-100"
              }`}
            >
              {!dati.cliente && m.cliente_nome && (
                <div className="mb-0.5 text-xs text-slate-400">{m.cliente_nome}</div>
              )}
              <Allegato tipo={m.tipo} url={m.allegato_url} nome={m.allegato_nome} />
              {m.contenuto && <div>{m.contenuto}</div>}
              {!m.contenuto && !m.allegato_url && <div className="opacity-60">[{m.tipo}]</div>}
              <div className="mt-1 text-right text-[10px] opacity-50">
                {m.direzione === "out" ? m.stato : "ricevuto"}
              </div>
            </div>
          </div>
        ))}
      </div>

      {dati.bozza && (
        <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-amber-300/80">
            Bozza — in attesa di conferma
          </div>
          <div className="text-sm text-amber-50">{dati.bozza.contenuto}</div>
        </div>
      )}
    </div>
  );
}

function Allegato({ tipo, url, nome }: { tipo: string; url: string | null; nome: string | null }) {
  if (!url) return null;
  if (tipo === "foto" || tipo.startsWith("image")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={nome ?? "foto"} className="mb-1 max-h-48 w-full rounded-lg object-cover" />;
  }
  if (tipo === "audio") {
    return <audio controls src={url} className="mb-1 w-full" />;
  }
  if (tipo === "video") {
    return <video controls src={url} className="mb-1 max-h-48 w-full rounded-lg" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2 text-xs hover:bg-black/30"
    >
      <span>📎</span>
      <span className="truncate">{nome ?? "documento"}</span>
    </a>
  );
}
