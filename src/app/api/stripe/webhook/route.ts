import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, WEBHOOK_SECRET } from "@/lib/stripe";
import { runWithTenant } from "@/lib/tenant";
import { salvaAbbonamento, tenantDaStripeCustomer } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const iso = (epochSec: number | null | undefined) =>
  epochSec ? new Date(epochSec * 1000).toISOString() : null;

// Webhook Stripe: aggiorna lo stato dell'abbonamento del tenant.
export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) return NextResponse.json({ ok: true });
  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (e) {
    console.error("[stripe webhook] firma non valida:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const tenant = Number(s.client_reference_id);
        const customer = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null;
        if (tenant && customer) {
          let periodo: string | null = null;
          let stato = "attivo";
          let piano: string | null = null;
          if (subId) {
            const sub = await stripe().subscriptions.retrieve(subId);
            periodo = iso((sub as unknown as { current_period_end: number }).current_period_end);
            stato = sub.status === "trialing" ? "prova" : "attivo";
            piano = (sub.metadata?.piano as string) || null;
          }
          runWithTenant(tenant, () =>
            salvaAbbonamento({
              stripe_customer_id: customer,
              stripe_subscription_id: subId,
              stato,
              piano,
              periodo_fine: periodo,
            })
          );
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const tenant = tenantDaStripeCustomer(customer);
        if (tenant) {
          // 'trialing' = in prova; 'active' = pagante; disdetta programmata =
          // 'annullato' (accesso fino a fine periodo); il resto = scaduto.
          const stato = sub.cancel_at_period_end
            ? "annullato"
            : sub.status === "trialing"
            ? "prova"
            : sub.status === "active"
            ? "attivo"
            : "scaduto";
          const periodo = iso((sub as unknown as { current_period_end: number }).current_period_end);
          const piano = (sub.metadata?.piano as string) || null;
          runWithTenant(tenant, () =>
            salvaAbbonamento({ stripe_subscription_id: sub.id, stato, piano, periodo_fine: periodo })
          );
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const tenant = tenantDaStripeCustomer(customer);
        if (tenant) runWithTenant(tenant, () => salvaAbbonamento({ stato: "scaduto" }));
        break;
      }
    }
  } catch (e) {
    console.error("[stripe webhook] errore gestione evento:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ received: true });
}
