import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { consegneManualiPendenti, segnaConsegnaManuale } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Il Ponte universale: la coda delle consegne al gestionale (senza API).
export async function GET() {
  const r = await conTenant(async () => consegneManualiPendenti());
  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  return NextResponse.json({ ok: true, consegne: r.data }, { headers: { "Cache-Control": "no-store" } });
}

// Spunta una consegna come fatta (il professionista l'ha portata nel suo software).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ ok: false, errore: "id mancante" }, { status: 400 });
  const r = await conTenant(async () => segnaConsegnaManuale(id));
  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  if (!r.data) return NextResponse.json({ ok: false, errore: "Consegna non trovata o già fatta" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
