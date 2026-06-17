import { NextRequest, NextResponse } from "next/server";
import { getClienteByTelefono, logCommunication, tenantDaPhoneNumberId } from "@/lib/data";
import { scaricaMediaWhatsApp } from "@/lib/whatsapp";
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
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[whatsapp webhook]", e);
    // Si risponde 200 per non far ritentare all'infinito Meta.
    return NextResponse.json({ ok: false });
  }
}
