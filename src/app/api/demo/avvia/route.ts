import { NextRequest, NextResponse } from "next/server";
import { creaAccountDemo } from "@/lib/demo";
import { COOKIE_SESSIONE, MAX_AGE_SESSIONE } from "@/lib/sessione";
import { rateLimit, ipRichiesta } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── INGRESSO DEMO ────────────────────────────────────────────────────────────
// Un clic dall'app desktop "ORION Demo" → account usa-e-getta + sessione, e
// parte la Chiamata 0 col tutorial. La demo NON si usa dal browser (il suo
// pezzo forte è la Mano che scrive nel gestionale vero, e vive sul desktop):
// l'app demo si presenta con un contrassegno nello user agent.
export async function POST(req: NextRequest) {
  try {
    // Non è una barriera di sicurezza (lo user agent si può fingere): è il
    // cartello "si scarica". La vera protezione dei crediti è il limite sotto.
    // In sviluppo si entra anche dal browser (per collaudare il tutorial).
    const ua = req.headers.get("user-agent") ?? "";
    if (!ua.includes("ORIONDemo/") && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { ok: false, errore: "La Demo si prova con l'app ORION Demo per Mac o Windows: scaricala dal sito." },
        { status: 403 }
      );
    }

    // Poche demo al giorno per indirizzo: il tutorial si fa una volta, non a nastro.
    const lim = rateLimit(`demo:${ipRichiesta(req)}`, 3, 24 * 60 * 60 * 1000);
    if (!lim.ok) {
      return NextResponse.json(
        { ok: false, errore: "Hai già provato la demo oggi. Domani puoi rifarla — o passare alla versione completa. 😉" },
        { status: 429 }
      );
    }

    const { utente, token } = creaAccountDemo();
    const res = NextResponse.json({ ok: true, utente: { id: utente.id, email: utente.email } });
    res.cookies.set(COOKIE_SESSIONE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SESSIONE,
    });
    return res;
  } catch (e) {
    console.error("[/api/demo/avvia]", e);
    return NextResponse.json({ ok: false, errore: "Errore interno." }, { status: 500 });
  }
}
