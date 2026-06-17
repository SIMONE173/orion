import { NextResponse } from "next/server";
import { diagnosiWhatsApp, whatsappConfigurato } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostica: verifica che il token WhatsApp sia valido (non invia messaggi).
export async function GET() {
  return NextResponse.json({ configurato: whatsappConfigurato(), ...(await diagnosiWhatsApp()) });
}
