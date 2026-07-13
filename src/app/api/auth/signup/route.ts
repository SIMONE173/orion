import { NextRequest, NextResponse } from "next/server";
import { creaUtente, trovaUtenteByEmail, creaCodiceVerifica } from "@/lib/auth";
import { rateLimit, ipRichiesta } from "@/lib/ratelimit";
import { inviaCodice } from "@/lib/mailer";
import { emailValida } from "@/lib/validazione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// REGISTRAZIONE: crea l'account come NON verificato e invia un codice all'email.
// Nessuna sessione finché il codice non è confermato (/api/auth/verifica) → non
// ci si può più registrare con email inesistenti.
export async function POST(req: NextRequest) {
  try {
    const lim = rateLimit(`signup:${ipRichiesta(req)}`, 5, 60 * 60 * 1000);
    if (!lim.ok) {
      return NextResponse.json(
        { ok: false, errore: "Troppe registrazioni da questo indirizzo. Riprova più tardi." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const nome = body?.nome ? String(body.nome).trim() : undefined;

    if (!emailValida(email)) {
      return NextResponse.json({ ok: false, errore: "Inserisci un indirizzo email valido." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ ok: false, errore: "La password deve avere almeno 8 caratteri." }, { status: 400 });
    }
    if (trovaUtenteByEmail(email)) {
      return NextResponse.json({ ok: false, errore: "Esiste già un account con questa email." }, { status: 409 });
    }

    creaUtente(email, password, nome); // nasce NON verificato (email_verificata = 0)
    const codice = creaCodiceVerifica(email, "signup");
    const esito = await inviaCodice(email, codice, "signup");

    return NextResponse.json({
      ok: true,
      serve_verifica: true,
      scopo: "signup",
      email,
      // Solo in sviluppo e senza mailer: mostra il codice per collaudare.
      ...(esito.codiceDev ? { codice_dev: esito.codiceDev } : {}),
    });
  } catch (e) {
    console.error("[/api/auth/signup]", e);
    return NextResponse.json({ ok: false, errore: "Errore interno." }, { status: 500 });
  }
}
