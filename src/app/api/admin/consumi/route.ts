import { NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { riepilogoAdmin } from "@/lib/consumi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Il pannello consumi del PROPRIETARIO: spesa AI per account, budget,
// sessioni attive (segnale anti-condivisione). Solo ORION_ADMIN_EMAIL.
export async function GET() {
  const admin = (process.env.ORION_ADMIN_EMAIL || "").trim().toLowerCase();
  const r = await conTenant(async (u) => {
    if (!admin || u.email.toLowerCase() !== admin) return null;
    return riepilogoAdmin();
  });
  if (!r.ok || r.data === null) {
    return NextResponse.json({ ok: false, errore: "Riservato al proprietario." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, ...r.data }, { headers: { "Cache-Control": "no-store" } });
}
