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

// Coupon "founding member": sconto % A VITA per gli iscritti alla beta.
// Get-or-create con id deterministico (es. orion-founding-30): esiste una sola
// volta su Stripe e resta riutilizzabile per sempre; se un giorno cambia la
// percentuale, nasce un coupon nuovo senza toccare gli sconti già agganciati.
let _couponPronto: string | null = null;
export async function couponFoundingMember(percento: number): Promise<string | null> {
  const p = Math.round(percento);
  if (!KEY || !(p > 0 && p < 100)) return null;
  const id = `orion-founding-${p}`;
  if (_couponPronto === id) return id;
  try {
    await stripe().coupons.retrieve(id);
  } catch {
    try {
      await stripe().coupons.create({
        id,
        percent_off: p,
        duration: "forever",
        name: `Founding member -${p}% a vita`,
      });
    } catch (e) {
      // Corsa con un'altra istanza: se ora esiste va bene; altrimenti rinuncia
      // (meglio un checkout senza sconto che un checkout che non parte).
      try {
        await stripe().coupons.retrieve(id);
      } catch {
        console.error("[stripe] coupon founding member:", e instanceof Error ? e.message : e);
        return null;
      }
    }
  }
  _couponPronto = id;
  return id;
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
  coupon?: string | null; // sconto founding member, applicato in automatico
}): Promise<string | null> {
  const price = priceIdDi(opts.piano);
  if (!price) return null;
  const sessione = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: opts.customerId || undefined,
    customer_email: opts.customerId ? undefined : opts.email,
    client_reference_id: String(opts.tenantId),
    // Stripe non permette discounts + allow_promotion_codes insieme: coi
    // founding member lo sconto è già applicato (niente campo codici).
    ...(opts.coupon ? { discounts: [{ coupon: opts.coupon }] } : { allow_promotion_codes: true }),
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
