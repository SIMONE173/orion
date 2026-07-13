import Stripe from "stripe";
import { GIORNI_PROVA, type Piano } from "./prezzi";

// ──────────────────────────────────────────────────────────────────────────
// Adapter Stripe (abbonamenti). Se le variabili non ci sono, ORION resta in
// "modalità demo": nessun paywall, tutto accessibile. Con le chiavi (anche di
// TEST) si accende il negozio: due piani, prova di 7 giorni CON CARTA.
//
//   STRIPE_SECRET_KEY      chiave segreta (sk_test_... o sk_live_...)
//   STRIPE_PRICE_PRO       id del prezzo Professionista (price_...)
//   STRIPE_PRICE_AZIENDA   id del prezzo Azienda (price_...)
//   STRIPE_WEBHOOK_SECRET  segreto per verificare i webhook (whsec_...)
// ──────────────────────────────────────────────────────────────────────────

const KEY = (process.env.STRIPE_SECRET_KEY || "").trim();
const PRICE_PRO = (process.env.STRIPE_PRICE_PRO || "").trim();
const PRICE_AZIENDA = (process.env.STRIPE_PRICE_AZIENDA || "").trim();
export const WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();

export { GIORNI_PROVA };

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(KEY);
  return _stripe;
}

// Configurato = c'è la chiave e almeno un prezzo. Finché è falso → demo (aperto).
export function stripeConfigurato(): boolean {
  return Boolean(KEY && (PRICE_PRO || PRICE_AZIENDA));
}

export function priceIdDi(piano: Piano): string {
  return piano === "azienda" ? PRICE_AZIENDA : PRICE_PRO;
}

// Crea una sessione di Checkout per il piano scelto e ne restituisce l'URL.
// Prova di 7 giorni CON CARTA: la carta è richiesta subito, l'addebito parte
// dopo la prova; l'utente può disdire prima e non paga nulla.
export async function creaCheckout(opts: {
  origin: string;
  email: string;
  tenantId: number;
  piano: Piano;
  customerId?: string | null;
}): Promise<string | null> {
  const price = priceIdDi(opts.piano);
  if (!price) return null;
  const sessione = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: opts.customerId || undefined,
    customer_email: opts.customerId ? undefined : opts.email,
    client_reference_id: String(opts.tenantId),
    allow_promotion_codes: true,
    payment_method_collection: "always", // carta richiesta anche durante la prova
    subscription_data: {
      trial_period_days: GIORNI_PROVA,
      metadata: { piano: opts.piano, tenant: String(opts.tenantId) },
    },
    success_url: `${opts.origin}/app?abbonamento=ok`,
    cancel_url: `${opts.origin}/app?abbonamento=annullato`,
  });
  return sessione.url;
}

// Customer Portal (gestione/disdetta abbonamento e metodo di pagamento).
export async function creaPortale(opts: { origin: string; customerId: string }): Promise<string | null> {
  const sessione = await stripe().billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: `${opts.origin}/app`,
  });
  return sessione.url;
}
