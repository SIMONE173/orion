import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { getAbbonamento } from "@/lib/data";
import { stripeConfigurato, creaCheckout } from "@/lib/stripe";
import { pianoValido } from "@/lib/prezzi";
import { originePubblica } from "@/lib/origine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Avvia l'abbonamento del piano scelto: crea una sessione di Checkout (prova
// 7 giorni con carta) e restituisce l'URL.
export async function POST(req: NextRequest) {
  if (!stripeConfigurato()) {
    return NextResponse.json({ ok: false, errore: "Pagamenti non ancora attivi." }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const piano = pianoValido(body?.piano) ? body.piano : "pro";
  const origin = originePubblica(req);
  const r = await conTenant(async (u) => {
    const acc = getAbbonamento();
    const url = await creaCheckout({
      origin,
      email: u.email,
      tenantId: u.id,
      piano,
      customerId: acc?.stripe_customer_id,
    });
    return { url };
  });
  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  if (!r.data.url) return NextResponse.json({ ok: false, errore: "Checkout non disponibile." }, { status: 500 });
  return NextResponse.json({ ok: true, url: r.data.url });
}
