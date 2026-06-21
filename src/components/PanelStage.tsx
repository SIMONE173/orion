"use client";

import dynamic from "next/dynamic";
import type { Vista } from "@/lib/orion/views";
import { AgendaPanel } from "./panels/AgendaPanel";
import { ClientePanel } from "./panels/ClientePanel";
import { ClientiPanel } from "./panels/ClientiPanel";
import { NotePanel } from "./panels/NotePanel";
import { PagamentiPanel } from "./panels/PagamentiPanel";
import { WhatsAppPanel } from "./panels/WhatsAppPanel";
import { WhatsAppConnectPanel } from "./panels/WhatsAppConnectPanel";
import { AbbonamentoPanel } from "./panels/AbbonamentoPanel";

// La lavagna usa KaTeX (pesante): la carichiamo solo quando serve.
const LavagnaPanel = dynamic(() => import("./panels/LavagnaPanel").then((m) => m.LavagnaPanel), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Preparo la lavagna…</div>,
});
import { BriefingPanel } from "./panels/BriefingPanel";
import { FatturaPanel } from "./panels/FatturaPanel";
import { PromemoriaPanel } from "./panels/PromemoriaPanel";
import { ProattivaPanel } from "./panels/ProattivaPanel";
import { DocumentoPanel } from "./panels/DocumentoPanel";
import { DocumentiPanel } from "./panels/DocumentiPanel";
import { AttesaPanel } from "./panels/AttesaPanel";
import { ChiamataPanel } from "./panels/ChiamataPanel";
import { ProfiloPanel } from "./panels/ProfiloPanel";

function renderPanel(v: Vista) {
  switch (v.tipo) {
    case "agenda":
      return <AgendaPanel titolo={v.titolo} dati={v.dati} />;
    case "cliente":
      return <ClientePanel dati={v.dati} />;
    case "clienti":
      return <ClientiPanel titolo={v.titolo} dati={v.dati} />;
    case "note":
      return <NotePanel dati={v.dati} />;
    case "pagamenti":
      return <PagamentiPanel titolo={v.titolo} dati={v.dati} />;
    case "whatsapp":
      return <WhatsAppPanel dati={v.dati} />;
    case "whatsapp_connect":
      return <WhatsAppConnectPanel />;
    case "abbonamento":
      return <AbbonamentoPanel dati={v.dati} />;
    case "lavagna":
      return <LavagnaPanel dati={v.dati} />;
    case "briefing":
      return <BriefingPanel dati={v.dati} />;
    case "fattura":
      return <FatturaPanel dati={v.dati} />;
    case "promemoria":
      return <PromemoriaPanel dati={v.dati} />;
    case "proattiva":
      return <ProattivaPanel dati={v.dati} />;
    case "documento":
      return <DocumentoPanel dati={v.dati} />;
    case "documenti":
      return <DocumentiPanel dati={v.dati} />;
    case "attesa":
      return <AttesaPanel dati={v.dati} />;
    case "chiamata":
      return <ChiamataPanel dati={v.dati} />;
    case "profilo":
      return <ProfiloPanel dati={v.dati} />;
    default:
      return null;
  }
}

export function PanelStage({ viste }: { viste: Vista[] }) {
  // Focus totale: 1 pannello quasi a tutto schermo. Split dinamico fino a 3.
  const items = viste.slice(0, 3);
  const cols =
    items.length === 1
      ? "grid-cols-1"
      : items.length === 2
        ? "grid-cols-1 lg:grid-cols-2"
        : "grid-cols-1 lg:grid-cols-3";

  return (
    <div className={`grid h-full min-h-0 gap-4 ${cols}`}>
      {items.map((v, i) => (
        <div
          key={`${v.tipo}-${i}`}
          className="panel-enter glass min-h-0 overflow-hidden rounded-2xl p-5"
        >
          {renderPanel(v)}
        </div>
      ))}
    </div>
  );
}
