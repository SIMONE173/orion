import { NextRequest, NextResponse } from "next/server";
import { trovaUtenteByEmail, verifyPassword, creaSessione } from "@/lib/auth";
import { COOKIE_SESSIONE, MAX_AGE_SESSIONE } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    const utente = trovaUtenteByEmail(email);
    if (!utente || !verifyPassword(password, utente.password_hash)) {
      return NextResponse.json({ ok: false, errore: "Email o password non corretti." }, { status: 401 });
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
    return res;
  } catch (e) {
    console.error("[/api/auth/login]", e);
    return NextResponse.json({ ok: false, errore: "Errore interno." }, { status: 500 });
  }
}
