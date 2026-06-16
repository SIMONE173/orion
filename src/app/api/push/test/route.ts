import { NextResponse } from "next/server";
import { inviaPushATutti } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Invia una notifica di prova a tutti i dispositivi iscritti.
export async function POST() {
  const r = await inviaPushATutti({
    titolo: "ORION",
    corpo: "Le notifiche sono attive ✓ Ti avviserò di promemoria e cose da gestire.",
    url: "/",
  });
  return NextResponse.json({ ok: true, ...r });
}
