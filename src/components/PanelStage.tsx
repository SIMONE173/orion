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
import { ConsegnePanel } from "./panels/ConsegnePanel";
import { SchemaPanel } from "./panels/SchemaPanel";
import { NotiziePanel } from "./panels/NotiziePanel";
import { FinanzaPanel } from "./panels/FinanzaPanel";
import { SportPanel } from "./panels/SportPanel";

// La lavagna usa KaTeX (pesante): la carichiamo solo quando serve.
const LavagnaPanel = dynamic(() => import("./panels/LavagnaPanel").then((m) => m.LavagnaPanel), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Preparo la lavagna…</div>,
});

// La mappa usa MapLibre GL + COBE (pesanti, richiedono il browser): caricata solo quando serve.
const MappaPanel = dynamic(() => import("./panels/MappaPanel").then((m) => m.MappaPanel), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Preparo la mappa…</div>,
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
import { MemoriaPanel } from "./panels/MemoriaPanel";
import { OrganicoPanel } from "./panels/OrganicoPanel";
import { CompitiPanel } from "./panels/CompitiPanel";
import { EmailPanel } from "./panels/EmailPanel";
import { EmailConnectPanel } from "./panels/EmailConnectPanel";
import { VerbalePanel } from "./panels/VerbalePanel";
import { IntegrazioniPanel } from "./panels/IntegrazioniPanel";
import { ImportaPanel } from "./panels/ImportaPanel";
import { AffiancaPanel } from "./panels/AffiancaPanel";
import { PresentazionePanel } from "./panels/PresentazionePanel";
import { TelefonoPanel } from "./panels/TelefonoPanel";

export function renderPanel(v: Vista) {
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
    case "consegne":
      return <ConsegnePanel dati={v.dati} />;
    case "lavagna":
      return <LavagnaPanel dati={v.dati} />;
    case "schema":
      return <SchemaPanel dati={v.dati} />;
    case "mappa":
      return <MappaPanel dati={v.dati} />;
    case "notizie":
      return <NotiziePanel dati={v.dati} />;
    case "finanza":
      return <FinanzaPanel dati={v.dati} />;
    case "sport":
      return <SportPanel dati={v.dati} />;
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
    case "memoria":
      return <MemoriaPanel dati={v.dati} />;
    case "organico":
      return <OrganicoPanel dati={v.dati} />;
    case "compiti":
      return <CompitiPanel dati={v.dati} titolo={v.titolo} />;
    case "email":
      return <EmailPanel dati={v.dati} />;
    case "email_connect":
      return <EmailConnectPanel />;
    case "verbale":
      return <VerbalePanel dati={v.dati} />;
    case "integrazioni":
      return <IntegrazioniPanel dati={v.dati} />;
    case "importa":
      return <ImportaPanel dati={v.dati} />;
    case "affianca":
      return <AffiancaPanel dati={v.dati} />;
    case "presentazione":
      return <PresentazionePanel dati={v.dati} />;
    case "telefono":
      return <TelefonoPanel dati={v.dati} />;
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
