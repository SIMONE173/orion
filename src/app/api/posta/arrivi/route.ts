import { NextRequest, NextResponse } from "next/server";
import { arriviNonLetti, segnaComunicazioniLette } from "@/lib/data";
import { sincronizzaEmailArrivi, silenziateOggi } from "@/lib/posta";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LA POSTA DEL TITOLARE, unificata: WhatsApp + email importanti, non ancora
// aperte. L'app la interroga ogni 25s (sola lettura DB, zero crediti); il
// controllo IMAP dei nuovi arrivi parte da qui, con freno a 1/minuto.
export async function GET() {
  const r = await conTenant(async () => {
    try {
      await sincronizzaEmailArrivi();
    } catch {
      /* casella non raggiungibile: si riprova al prossimo giro */
    }
    return {
      arrivi: arriviNonLetti().map((m) => ({
        id: m.id,
        canale: m.canale === "email" ? "email" : "whatsapp",
        cliente: m.cliente_nome ?? null,
        cliente_id: m.cliente_id,
        telefono: m.telefono ?? null,
        mittente: m.mittente ?? null,
        oggetto: m.oggetto ?? null,
        tipo: m.tipo,
        contenuto: m.contenuto,
        allegato_url: m.allegato_url,
        allegato_nome: m.allegato_nome,
        quando: m.created_at,
      })),
      silenziate: silenziateOggi(),
    };
  });
  if (!r.ok) return NextResponse.json({ arrivi: [] }, { status: 401 });
  return NextResponse.json(r.data);
}

// Aperti (o rimandati): non vanno più annunciati.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
    const r = await conTenant(() => {
      segnaComunicazioniLette(ids);
      return { segnati: ids.length };
    });
    if (!r.ok) return NextResponse.json({ ok: false }, { status: 401 });
    return NextResponse.json({ ok: true, ...r.data });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
