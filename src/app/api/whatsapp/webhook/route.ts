import { NextRequest, NextResponse } from "next/server";
import { getClienteByTelefono, logCommunication, tenantDaPhoneNumberId } from "@/lib/data";
import { inviaPushATutti } from "@/lib/push";
import { scaricaMediaWhatsApp } from "@/lib/whatsapp";
import { gestisciMessaggioCliente } from "@/lib/orion/segreteria";
import { primoTenant } from "@/lib/auth";
import { runWithTenant } from "@/lib/tenant";
import { verificaFirmaMeta, fallbackTenantConsentito } from "@/lib/webhookSec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verifica del webhook (Meta chiama in GET una sola volta in fase di setup).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = (p.get("hub.verify_token") ?? "").trim();
  const challenge = p.get("hub.challenge");
  // Verify token dall'ambiente (consigliato: WHATSAPP_VERIFY_TOKEN); fallback
  // storico "orion2026" per retrocompatibilità con i webhook già configurati.
  const atteso = (process.env.WHATSAPP_VERIFY_TOKEN || "orion2026").trim();
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

// L'interpretazione dei messaggi (copioni anti no-show, offerte di slot e
// SEGRETERIA AI) vive in un posto solo: lib/orion/segreteria.ts — così il
// webhook vero e il simulatore si comportano in modo identico.

// Ricezione dei messaggi in arrivo.
export async function POST(req: NextRequest) {
  try {
    // Firma Meta (X-Hub-Signature-256) calcolata sul corpo GREZZO: solo i
    // messaggi che arrivano davvero da Meta entrano nel sistema.
    const raw = await req.text();
    const firma = verificaFirmaMeta(raw, req.headers.get("x-hub-signature-256"));
    if (!firma.ok) {
      console.warn("[whatsapp webhook] rifiutato:", firma.motivo);
      return new NextResponse("forbidden", { status: 403 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ ok: true });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const change = (body as any)?.entry?.[0]?.changes?.[0]?.value;
    const messaggi = change?.messages;
    if (!Array.isArray(messaggi)) return NextResponse.json({ ok: true });

    // Routing: dal numero che ha ricevuto il messaggio risali al tenant
    // proprietario (numero collegato via Embedded Signup). Fallback SOLO se
    // legittimo: numero condiviso di Fase 1 dichiarato in env, oppure sviluppo.
    // In produzione un numero sconosciuto NON finisce nei dati del primo tenant.
    const phoneNumberId: string | undefined = change?.metadata?.phone_number_id;
    let tenantId = phoneNumberId ? tenantDaPhoneNumberId(phoneNumberId) : null;
    if (!tenantId) {
      const numeroCondiviso = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
      const fallbackOk =
        fallbackTenantConsentito() || (numeroCondiviso !== "" && phoneNumberId === numeroCondiviso);
      tenantId = fallbackOk ? Number(process.env.ORION_WA_TENANT || 0) || primoTenant() : null;
    }
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
          telefono,
          stato: "ricevuto",
        });

        // Risposte automatiche: offerte di slot → conferme scriptate →
        // SEGRETERIA AI (se accesa: assistita o autopilota). Un solo ingresso.
        let rispostaInviata = false;
        if (tipo === "testo" && contenuto) {
          try {
            rispostaInviata = await gestisciMessaggioCliente({ cliente, telefono, testo: contenuto });
          } catch (e) {
            console.error("[whatsapp webhook] risposta automatica:", e);
          }
        }

        // Se la segreteria non ha gestito da sola, il titolare va avvisato
        // subito anche ad app chiusa (in app ci pensa l'annuncio vocale).
        if (!rispostaInviata) {
          const chi = cliente?.nome ?? telefono;
          const anteprima = (contenuto ?? `[${tipo}]`).slice(0, 90);
          void inviaPushATutti({ titolo: "📩 Messaggio WhatsApp", corpo: `${chi}: ${anteprima}`, url: "/app" }).catch(() => {});
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
