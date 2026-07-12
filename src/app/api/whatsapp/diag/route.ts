import { NextRequest, NextResponse } from "next/server";
import { diagnosiWhatsApp, whatsappConfigurato, inviaMessaggioWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostica. Senza parametri: verifica solo il token (non invia).
// Con ?to=39xxxxxxxxxx : prova un invio reale e restituisce l'errore esatto di Meta.
// PROTETTO come gli altri canali operativi (header x-orion-cron): senza guardia
// chiunque potrebbe far mandare WhatsApp a numeri arbitrari col token del business.
export async function GET(req: NextRequest) {
  const segreto = process.env.VAPID_PRIVATE_KEY || "";
  if (!segreto || req.headers.get("x-orion-cron") !== segreto) {
    return NextResponse.json({ ok: false, errore: "non autorizzato" }, { status: 403 });
  }
  const to = req.nextUrl.searchParams.get("to");
  if (to) {
    const r = await inviaMessaggioWhatsApp(to, "Messaggio di prova da ORION ✓");
    return NextResponse.json({ test_invio: true, to, ...r });
  }
  return NextResponse.json({ configurato: whatsappConfigurato(), ...(await diagnosiWhatsApp()) });
}
