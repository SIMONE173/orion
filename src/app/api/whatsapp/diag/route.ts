import { NextRequest, NextResponse } from "next/server";
import { diagnosiWhatsApp, whatsappConfigurato, inviaMessaggioWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostica. Senza parametri: verifica solo il token (non invia).
// Con ?to=39xxxxxxxxxx : prova un invio reale e restituisce l'errore esatto di Meta.
export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to");
  if (to) {
    const r = await inviaMessaggioWhatsApp(to, "Messaggio di prova da ORION ✓");
    return NextResponse.json({ test_invio: true, to, ...r });
  }
  return NextResponse.json({ configurato: whatsappConfigurato(), ...(await diagnosiWhatsApp()) });
}
