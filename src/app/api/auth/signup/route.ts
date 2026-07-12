import { NextRequest, NextResponse } from "next/server";
import { creaUtente, creaSessione, trovaUtenteByEmail } from "@/lib/auth";
import { COOKIE_SESSIONE, MAX_AGE_SESSIONE } from "@/lib/sessione";
import { rateLimit, ipRichiesta } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Anti abuso: max 5 registrazioni all'ora per IP.
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

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, errore: "Email non valida." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ ok: false, errore: "La password deve avere almeno 8 caratteri." }, { status: 400 });
    }
    if (trovaUtenteByEmail(email)) {
      return NextResponse.json({ ok: false, errore: "Esiste già un account con questa email." }, { status: 409 });
    }

    const utente = creaUtente(email, password, nome);
    const token = creaSessione(utente.id);
    const res = NextResponse.json({ ok: true, utente });
    res.cookies.set(COOKIE_SESSIONE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SESSIONE,
    });
    return res;
  } catch (e) {
    console.error("[/api/auth/signup]", e);
    return NextResponse.json({ ok: false, errore: "Errore interno." }, { status: 500 });
  }
}
