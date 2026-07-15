import { NextRequest, NextResponse } from "next/server";
import { trovaUtenteByEmail, verificaCodice, setEmailVerificata, creaSessione, creaDispositivoFidato } from "@/lib/auth";
import { COOKIE_SESSIONE, MAX_AGE_SESSIONE, COOKIE_DISPOSITIVO, MAX_AGE_DISPOSITIVO } from "@/lib/sessione";
import { rateLimit, ipRichiesta } from "@/lib/ratelimit";
import { inviaEmailBenvenuto } from "@/lib/email-orion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Conferma il codice a 6 cifre e APRE la sessione. Vale sia per la registrazione
// (scopo=signup: marca l'email come verificata) sia per l'accesso (scopo=login).
export async function POST(req: NextRequest) {
  try {
    const lim = rateLimit(`verifica:${ipRichiesta(req)}`, 20, 15 * 60 * 1000);
    if (!lim.ok) return NextResponse.json({ ok: false, errore: "Troppi tentativi. Riprova tra qualche minuto." }, { status: 429 });

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const codice = String(body?.codice ?? "").trim();
    const scopo = body?.scopo === "login" ? "login" : "signup";
    const ricorda = body?.ricorda === true;

    const utente = trovaUtenteByEmail(email);
    if (!utente) return NextResponse.json({ ok: false, errore: "Account non trovato." }, { status: 404 });

    const esito = verificaCodice(email, codice, scopo);
    if (!esito.ok) return NextResponse.json({ ok: false, errore: esito.errore }, { status: 401 });

    if (scopo === "signup") {
      setEmailVerificata(email);
      // Benvenuto: l'account è confermato. Fire-and-forget: la posta non
      // deve mai rallentare né rompere la registrazione.
      void inviaEmailBenvenuto(email, utente.nome).catch((e) =>
        console.error("[email] benvenuto non inviata:", e instanceof Error ? e.message : e)
      );
    }

    const token = creaSessione(utente.id);
    const res = NextResponse.json({
      ok: true,
      utente: { id: utente.id, email: utente.email, nome: utente.nome, created_at: utente.created_at },
    });
    res.cookies.set(COOKIE_SESSIONE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SESSIONE,
    });
    // "Ricorda questo dispositivo": prossimi accessi da qui senza 2FA per 30 giorni.
    if (ricorda) {
      const dev = creaDispositivoFidato(utente.id);
      res.cookies.set(COOKIE_DISPOSITIVO, `${utente.id}:${dev}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: MAX_AGE_DISPOSITIVO,
      });
    }
    return res;
  } catch (e) {
    console.error("[/api/auth/verifica]", e);
    return NextResponse.json({ ok: false, errore: "Errore interno." }, { status: 500 });
  }
}
