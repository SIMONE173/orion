import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { utenteCorrente } from "@/lib/sessione";
import { urlAutorizzazione, googleConfigurato } from "@/lib/gcal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Avvia il collegamento Google Calendar: redirige alla schermata di consenso.
// Il tenant NON viaggia nell'URL: lo ritroveremo nel callback dalla stessa
// sessione (cookie). Lo state è un anti-CSRF salvato in un cookie httpOnly.
export async function GET(req: NextRequest) {
  const utente = await utenteCorrente();
  if (!utente) return NextResponse.redirect(new URL("/?calendario=login", req.nextUrl.origin));
  if (!googleConfigurato()) {
    return NextResponse.redirect(new URL("/?calendario=non_configurato", req.nextUrl.origin));
  }

  const redirectUri = `${req.nextUrl.origin}/api/calendario/callback`;
  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(urlAutorizzazione(redirectUri, state));
  res.cookies.set("orion_gcal_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    maxAge: 600,
    path: "/",
  });
  return res;
}
