import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { sintetizzaVoce, vocePremiumConfigurata } from "@/lib/elevenlabs";
import { sintetizzaVoceGratis } from "@/lib/voce";
import { rateLimit, ipRichiesta } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La voce di ORION: testo → mp3. Corsie in ordine: ElevenLabs (se configurata,
// a pagamento) → neurale Microsoft GRATUITA (la voce umana di serie) → in caso
// di guaio il client ripiega da solo sulla voce del browser (502).
export async function POST(req: NextRequest) {
  const lim = rateLimit(`voce:${ipRichiesta(req)}`, 120, 60 * 1000);
  if (!lim.ok) return new NextResponse(null, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const testo = String(body?.testo ?? "").trim().slice(0, 1200);
  if (!testo) return new NextResponse(null, { status: 400 });

  const r = await conTenant(async () => {
    if (vocePremiumConfigurata()) {
      const lusso = await sintetizzaVoce(testo);
      if (lusso) return lusso;
    }
    return sintetizzaVoceGratis(testo);
  });
  if (!r.ok) return new NextResponse(null, { status: 401 });
  if (!r.data) return new NextResponse(null, { status: 502 }); // sintesi fallita → fallback client

  return new NextResponse(new Uint8Array(r.data), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
