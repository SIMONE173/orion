import { NextRequest, NextResponse } from "next/server";
import {
  getClienteByTelefono,
  logCommunication,
  tenantDaPhoneNumberId,
  prossimoAppuntamentoDiCliente,
  aggiornaStatoAppuntamento,
  creaPromemoria,
  logEvento,
  logAudit,
  type Cliente,
} from "@/lib/data";
import { scaricaMediaWhatsApp, inviaMessaggioWhatsApp } from "@/lib/whatsapp";
import { inviaPushATutti } from "@/lib/push";
import { primoTenant } from "@/lib/auth";
import { runWithTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verifica del webhook (Meta chiama in GET una sola volta in fase di setup).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = (p.get("hub.verify_token") ?? "").trim();
  const challenge = p.get("hub.challenge");
  // Verify token fisso (parola d'ordine dell'handshake, non un segreto critico):
  // così la verifica non dipende da caratteri invisibili in una variabile.
  const atteso = "orion2026";
  if (mode === "subscribe" && token && token === atteso) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

const TIPO_MEDIA: Record<string, string> = {
  image: "foto",
  document: "documento",
  audio: "audio",
  voice: "audio",
  video: "video",
  sticker: "foto",
};

// ── ANTI NO-SHOW: interpretazione delle risposte ai promemoria ──────────────
// Se il cliente ha un appuntamento imminente con promemoria inviato e risponde
// SÌ → confermiamo noi. NO/disdetta → NON cancelliamo (decide il professionista):
// creiamo un promemoria di richiamo e avvisiamo con una push.

const RE_SI = /^\s*(s[iì]\b|s[iì][!. ]|ok\b|okay\b|va bene|confermo|confermat|perfetto|certo|ci sar[oò])/i;
const RE_NO = /^\s*(no\b|non posso|non riesco|disdic|disdett|annull|rinvi|spost|cambio|impossibilitat)/i;

function quandoLeggibile(iso: string): string {
  const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]} alle ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function gestisciRispostaPromemoria(cliente: Cliente, testo: string) {
  const si = RE_SI.test(testo);
  const no = !si && RE_NO.test(testo);
  if (!si && !no) return;

  const app = prossimoAppuntamentoDiCliente(cliente.id);
  // Reagiamo SOLO se c'è un appuntamento imminente il cui promemoria è partito:
  // così un "ok" dentro una normale conversazione non tocca l'agenda.
  if (!app || !app.promemoria_inviato) return;
  const oreAllInizio = (new Date(app.inizio).getTime() - Date.now()) / 3600_000;
  if (oreAllInizio < 0 || oreAllInizio > 72) return;

  if (si) {
    if (app.stato !== "confermato") aggiornaStatoAppuntamento(app.id, "confermato");
    logEvento({
      tipo: "appuntamento_confermato",
      soggetto: cliente.nome,
      cliente_id: cliente.id,
      descrizione: `${cliente.nome} ha confermato via WhatsApp l'appuntamento di ${quandoLeggibile(app.inizio)}`,
    });
    logAudit({ canale: "whatsapp", azione: "conferma_automatica", dettaglio: `${cliente.nome} — ${app.inizio}` });
    const risposta = `Grazie ${cliente.nome.split(" ")[0]}, l'appuntamento di ${quandoLeggibile(app.inizio)} è confermato. A presto!\n\n(Messaggio automatico dell'assistente dello studio)`;
    const esito = await inviaMessaggioWhatsApp(cliente.telefono ?? "", risposta);
    if (esito.ok) {
      logCommunication({ cliente_id: cliente.id, direzione: "out", contenuto: risposta, stato: esito.simulato ? "simulato" : "inviato" });
    }
    return;
  }

  // NO: il professionista decide. Promemoria di richiamo + push immediata.
  creaPromemoria({
    cliente_id: cliente.id,
    testo: `Richiamare ${cliente.nome}: chiede di spostare/disdire l'appuntamento di ${quandoLeggibile(app.inizio)}`,
    categoria: "richiamo",
    scadenza: new Date().toISOString().slice(0, 10),
  });
  logEvento({
    tipo: "richiesta_disdetta",
    soggetto: cliente.nome,
    cliente_id: cliente.id,
    descrizione: `${cliente.nome} ha chiesto via WhatsApp di spostare/disdire l'appuntamento di ${quandoLeggibile(app.inizio)}`,
  });
  logAudit({ canale: "whatsapp", azione: "richiesta_disdetta", dettaglio: `${cliente.nome} — ${app.inizio}` });
  await inviaPushATutti({
    titolo: "Richiesta di spostamento",
    corpo: `${cliente.nome} vuole spostare l'appuntamento di ${quandoLeggibile(app.inizio)}. C'è un promemoria di richiamo.`,
    url: "/",
  });
  const risposta = `Capito ${cliente.nome.split(" ")[0]}, avviso subito lo studio: la ricontatteremo per trovare un nuovo orario.\n\n(Messaggio automatico dell'assistente dello studio)`;
  const esito = await inviaMessaggioWhatsApp(cliente.telefono ?? "", risposta);
  if (esito.ok) {
    logCommunication({ cliente_id: cliente.id, direzione: "out", contenuto: risposta, stato: esito.simulato ? "simulato" : "inviato" });
  }
}

// Ricezione dei messaggi in arrivo.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const change = body?.entry?.[0]?.changes?.[0]?.value;
    const messaggi = change?.messages;
    if (!Array.isArray(messaggi)) return NextResponse.json({ ok: true });

    // Routing: dal numero che ha ricevuto il messaggio risali al tenant proprietario
    // (numero collegato via Embedded Signup). Se non trovato, ripiega sul numero
    // condiviso → primo tenant (sviluppo / numero di prova).
    const phoneNumberId: string | undefined = change?.metadata?.phone_number_id;
    const tenantId =
      (phoneNumberId ? tenantDaPhoneNumberId(phoneNumberId) : null) ?? primoTenant();
    if (!tenantId) return NextResponse.json({ ok: true });

    await runWithTenant(tenantId, async () => {
      for (const m of messaggi) {
        const telefono: string = m.from ?? "";
        const cliente = telefono ? getClienteByTelefono(telefono) : undefined;
        const tipo = TIPO_MEDIA[m.type] ?? "testo";

        let contenuto: string | null = m.text?.body ?? null;
        let allegato_url: string | null = null;
        let allegato_nome: string | null = null;

        const media = m.image ?? m.document ?? m.audio ?? m.voice ?? m.video ?? m.sticker;
        if (media?.id) {
          allegato_nome = media.filename ?? `${tipo}`;
          if (media.caption) contenuto = media.caption;
          const scaricato = await scaricaMediaWhatsApp(media.id);
          if (scaricato) allegato_url = scaricato.dataUrl;
        }

        logCommunication({
          cliente_id: cliente?.id ?? null,
          direzione: "in",
          tipo,
          contenuto: contenuto ?? (tipo !== "testo" ? `[${tipo}]` : null),
          allegato_nome,
          allegato_url,
          stato: "ricevuto",
        });

        // Anti no-show: se è la risposta a un promemoria, gestiscila subito.
        if (tipo === "testo" && cliente && contenuto) {
          try {
            await gestisciRispostaPromemoria(cliente, contenuto);
          } catch (e) {
            console.error("[whatsapp webhook] risposta promemoria:", e);
          }
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[whatsapp webhook]", e);
    // Si risponde 200 per non far ritentare all'infinito Meta.
    return NextResponse.json({ ok: false });
  }
}
