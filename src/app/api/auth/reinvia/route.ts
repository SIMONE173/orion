import { NextRequest, NextResponse } from "next/server";
import { trovaUtenteByEmail, creaCodiceVerifica } from "@/lib/auth";
import { rateLimit, ipRichiesta } from "@/lib/ratelimit";
import { inviaCodice } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reinvia un codice (l'utente non l'ha ricevuto). Limitato per non spammare.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const scopo = body?.scopo === "login" ? "login" : "signup";

    const lim = rateLimit(`reinvia:${ipRichiesta(req)}:${email}`, 4, 15 * 60 * 1000);
    if (!lim.ok) return NextResponse.json({ ok: false, errore: "Aspetta qualche minuto prima di richiedere un altro codice." }, { status: 429 });

    // Risposta uniforme anche se l'email non esiste (non rivelare chi è iscritto).
    if (trovaUtenteByEmail(email)) {
      const codice = creaCodiceVerifica(email, scopo);
      const esito = await inviaCodice(email, codice, scopo);
      return NextResponse.json({ ok: true, ...(esito.codiceDev ? { codice_dev: esito.codiceDev } : {}) });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/auth/reinvia]", e);
    return NextResponse.json({ ok: false, errore: "Errore interno." }, { status: 500 });
  }
}
