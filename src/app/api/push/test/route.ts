import { NextResponse } from "next/server";
import { inviaPushATutti } from "@/lib/push";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Invia una notifica di prova ai dispositivi iscritti DI QUESTO professionista.
export async function POST() {
  const r = await conTenant(() =>
    inviaPushATutti({
      titolo: "ORION",
      corpo: "Le notifiche sono attive ✓ Ti avviserò di promemoria e cose da gestire.",
      url: "/",
    })
  );
  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  return NextResponse.json({ ok: true, ...r.data });
}
