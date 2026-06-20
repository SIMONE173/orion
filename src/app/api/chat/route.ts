import { NextRequest, NextResponse } from "next/server";
import { runConversation, type MessaggioStorico } from "@/lib/orion/client";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const storico: MessaggioStorico[] = Array.isArray(body?.messages) ? body.messages : [];
    const avvio: boolean = body?.avvio === true;
    const allegato =
      typeof body?.allegato?.dataUrl === "string" ? { dataUrl: body.allegato.dataUrl } : undefined;
    const desktop = body?.desktop === true;

    const r = await conTenant(() => runConversation(storico, avvio, allegato, desktop));
    if (!r.ok) {
      return NextResponse.json(
        { testo: "Sessione scaduta. Accedi di nuovo.", viste: [], errore: "auth_sessione" },
        { status: 401 }
      );
    }
    return NextResponse.json(r.data);
  } catch (e) {
    console.error("[/api/chat]", e);
    return NextResponse.json(
      { testo: "Errore interno. Riprova.", viste: [], errore: "api_error" },
      { status: 500 }
    );
  }
}
