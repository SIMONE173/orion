import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { getAbbonamento } from "@/lib/data";
import { stripeConfigurato, creaPortale } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Apre il Customer Portal di Stripe (gestione/disdetta abbonamento).
export async function POST(req: NextRequest) {
  if (!stripeConfigurato()) {
    return NextResponse.json({ ok: false, errore: "Pagamenti non ancora attivi." }, { status: 400 });
  }
  const origin = req.nextUrl.origin;
  const r = await conTenant(async () => {
    const acc = getAbbonamento();
    if (!acc?.stripe_customer_id) return { url: null as string | null };
    const url = await creaPortale({ origin, customerId: acc.stripe_customer_id });
    return { url };
  });
  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  if (!r.data.url) {
    return NextResponse.json({ ok: false, errore: "Nessun abbonamento da gestire." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, url: r.data.url });
}
