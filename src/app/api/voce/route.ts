import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { sintetizzaVoce, vocePremiumConfigurata } from "@/lib/elevenlabs";
import { rateLimit, ipRichiesta } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voce premium: testo → audio mp3 (ElevenLabs). Solo utenti loggati (la chiave
// costa a carattere). 204 se non configurata → il client usa la voce del browser.
export async function POST(req: NextRequest) {
  if (!vocePremiumConfigurata()) return new NextResponse(null, { status: 204 });

  const lim = rateLimit(`voce:${ipRichiesta(req)}`, 120, 60 * 1000);
  if (!lim.ok) return new NextResponse(null, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const testo = String(body?.testo ?? "").trim().slice(0, 800); // tetto anti-costo
  if (!testo) return new NextResponse(null, { status: 400 });

  const r = await conTenant(() => sintetizzaVoce(testo));
  if (!r.ok) return new NextResponse(null, { status: 401 });
  if (!r.data) return new NextResponse(null, { status: 502 }); // ElevenLabs ha fallito → fallback client

  return new NextResponse(new Uint8Array(r.data), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
