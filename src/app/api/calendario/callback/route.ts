import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { scambiaCodice } from "@/lib/gcal";
import { salvaCalendarAccount, logEvento, logAudit } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ritorno dal consenso Google: scambia il codice, salva il refresh token
// (cifrato a riposo) e torna a ORION. Il primo sync lo fa il cron entro ~15'.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const atteso = req.cookies.get("orion_gcal_state")?.value;
  const home = (esito: string) => {
    const r = NextResponse.redirect(new URL(`/?calendario=${esito}`, req.nextUrl.origin));
    r.cookies.delete("orion_gcal_state");
    return r;
  };

  if (!code || !state || !atteso || state !== atteso) return home("errore_state");

  const redirectUri = `${req.nextUrl.origin}/api/calendario/callback`;
  const t = await scambiaCodice(code, redirectUri);
  if (!t.refresh_token) {
    console.error("[calendario] scambio codice:", t.errore);
    return home("errore_token");
  }

  const r = await conTenant(() => {
    salvaCalendarAccount({ email: t.email ?? null, refresh_token: t.refresh_token! });
    logEvento({ tipo: "calendario_collegato", descrizione: `Google Calendar collegato${t.email ? ` (${t.email})` : ""}` });
    logAudit({ canale: "api", azione: "collega_calendario", dettaglio: t.email ?? null });
  });
  if (!r.ok) return home("login");

  return home("ok");
}
