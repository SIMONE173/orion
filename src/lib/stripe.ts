import Stripe from "stripe";

// ──────────────────────────────────────────────────────────────────────────
// Adapter Stripe (abbonamenti, Fase 3). Se le variabili non ci sono, ORION
// resta in "modalità demo": nessun paywall, tutto accessibile. Quando si
// inseriscono le chiavi (anche di TEST), si accende il negozio.
//
//   STRIPE_SECRET_KEY      chiave segreta (sk_test_... o sk_live_...)
//   STRIPE_PRICE_ID        id del prezzo dell'abbonamento (price_...)
//   STRIPE_WEBHOOK_SECRET  segreto per verificare i webhook (whsec_...)
// ──────────────────────────────────────────────────────────────────────────

const KEY = (process.env.STRIPE_SECRET_KEY || "").trim();
const PRICE = (process.env.STRIPE_PRICE_ID || "").trim();
export const WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();

export const GIORNI_PROVA = 14;

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(KEY);
  return _stripe;
}

export function stripeConfigurato(): boolean {
  return Boolean(KEY && PRICE);
}

export function priceId(): string {
  return PRICE;
}

// Crea una sessione di Checkout per l'abbonamento e ne restituisce l'URL.
export async function creaCheckout(opts: {
  origin: string;
  email: string;
  tenantId: number;
  customerId?: string | null;
}): Promise<string | null> {
  const sessione = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId(), quantity: 1 }],
    customer: opts.customerId || undefined,
    customer_email: opts.customerId ? undefined : opts.email,
    client_reference_id: String(opts.tenantId),
    allow_promotion_codes: true,
    success_url: `${opts.origin}/?abbonamento=ok`,
    cancel_url: `${opts.origin}/?abbonamento=annullato`,
  });
  return sessione.url;
}

// Crea una sessione del Customer Portal (gestione/disdetta abbonamento).
export async function creaPortale(opts: { origin: string; customerId: string }): Promise<string | null> {
  const sessione = await stripe().billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: `${opts.origin}/`,
  });
  return sessione.url;
}
