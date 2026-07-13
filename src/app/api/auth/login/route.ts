import { NextRequest, NextResponse } from "next/server";
import {
  trovaUtenteByEmail,
  verifyPassword,
  creaSessione,
  creaCodiceVerifica,
  emailVerificata,
  dispositivoFidato,
} from "@/lib/auth";
import { COOKIE_SESSIONE, MAX_AGE_SESSIONE, COOKIE_DISPOSITIVO } from "@/lib/sessione";
import { rateLimit, ipRichiesta } from "@/lib/ratelimit";
import { inviaCodice } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ACCESSO con 2FA: password giusta → codice via email. Se il browser è un
// "dispositivo fidato" (2FA già fatta di recente qui) si entra diretti.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    const lim = rateLimit(`login:${ipRichiesta(req)}:${email}`, 10, 15 * 60 * 1000);
    if (!lim.ok) {
      return NextResponse.json(
        { ok: false, errore: `Troppi tentativi. Riprova tra ${Math.ceil(lim.riprovaTraSec / 60)} minuti.` },
        { status: 429 }
      );
    }

    const utente = trovaUtenteByEmail(email);
    if (!utente || !verifyPassword(password, utente.password_hash)) {
      console.warn(`[auth] login FALLITO per ${email} da ${ipRichiesta(req)}`);
      return NextResponse.json({ ok: false, errore: "Email o password non corretti." }, { status: 401 });
    }

    // Email mai verificata (account creato prima della conferma): rimanda alla verifica.
    if (!emailVerificata(utente.id)) {
      const codice = creaCodiceVerifica(email, "signup");
      const esito = await inviaCodice(email, codice, "signup");
      return NextResponse.json({
        ok: true,
        serve_verifica: true,
        scopo: "signup",
        email,
        nota: "Conferma prima la tua email.",
        ...(esito.codiceDev ? { codice_dev: esito.codiceDev } : {}),
      });
    }

    // Dispositivo fidato → niente 2FA, sessione diretta.
    const cookieDev = req.cookies.get(COOKIE_DISPOSITIVO)?.value ?? "";
    const [devUid, devTok] = cookieDev.split(":");
    if (Number(devUid) === utente.id && dispositivoFidato(utente.id, devTok)) {
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
      return res;
    }

    // Altrimenti: manda il codice 2FA e chiedi la verifica.
    const codice = creaCodiceVerifica(email, "login");
    const esito = await inviaCodice(email, codice, "login");
    return NextResponse.json({
      ok: true,
      serve_verifica: true,
      scopo: "login",
      email,
      ...(esito.codiceDev ? { codice_dev: esito.codiceDev } : {}),
    });
  } catch (e) {
    console.error("[/api/auth/login]", e);
    return NextResponse.json({ ok: false, errore: "Errore interno." }, { status: 500 });
  }
}
