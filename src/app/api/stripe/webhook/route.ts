import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, WEBHOOK_SECRET, couponFoundingMember, GIORNI_PROVA } from "@/lib/stripe";
import { runWithTenant } from "@/lib/tenant";
import { salvaAbbonamento, tenantDaStripeCustomer } from "@/lib/data";
import { eBetaTester, SCONTO_BETA } from "@/lib/beta";
import { inviaEmailAbbonamento, inviaEmailRicevuta } from "@/lib/email-orion";
import { pianoValido } from "@/lib/prezzi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const iso = (epochSec: number | null | undefined) =>
  epochSec ? new Date(epochSec * 1000).toISOString() : null;

// Fine del periodo corrente, robusta tra versioni API: nelle versioni recenti
// (2025+/dahlia) current_period_end è sugli ITEM, non più sull'abbonamento.
// Durante la prova coincide con trial_end. Fallback a cascata.
function finePeriodo(sub: Stripe.Subscription): string | null {
  const s = sub as unknown as {
    current_period_end?: number;
    trial_end?: number;
    items?: { data?: { current_period_end?: number }[] };
  };
  return iso(s.items?.data?.[0]?.current_period_end ?? s.current_period_end ?? s.trial_end ?? null);
}

// Rete di sicurezza founding member: se il titolare dell'abbonamento è nella
// lista beta ma l'abbonamento NON ha ancora lo sconto a vita (es. si era
// abbonato prima di iscriversi alla beta), lo agganciamo qui: da quel momento
// vale su ogni fattura, per sempre. Se lo sconto c'è già, non tocca nulla.
async function assicuraScontoFounder(sub: Stripe.Subscription, customerId: string): Promise<void> {
  try {
    if (!(SCONTO_BETA > 0)) return;
    const s = sub as unknown as { discounts?: unknown[]; discount?: unknown };
    if ((s.discounts?.length ?? 0) > 0 || s.discount) return; // ha già uno sconto
    const cliente = await stripe().customers.retrieve(customerId);
    const email = cliente.deleted ? "" : cliente.email || "";
    if (!email || !eBetaTester(email)) return;
    const coupon = await couponFoundingMember(SCONTO_BETA);
    if (coupon) {
      await stripe().subscriptions.update(sub.id, { discounts: [{ coupon }] });
      console.log(`[stripe webhook] sconto founding member agganciato a ${sub.id}`);
    }
  } catch (e) {
    console.error("[stripe webhook] sconto founding member:", e instanceof Error ? e.message : e);
  }
}

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
          let fineProva: Date | null = null;
          if (subId) {
            const sub = await stripe().subscriptions.retrieve(subId);
            periodo = finePeriodo(sub);
            stato = sub.status === "trialing" ? "prova" : "attivo";
            piano = (sub.metadata?.piano as string) || null;
            const trialEnd = (sub as unknown as { trial_end?: number }).trial_end;
            if (sub.status === "trialing" && trialEnd) fineProva = new Date(trialEnd * 1000);
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
          // Email di conferma: piano, prova, prezzo (scontato se founding member).
          const email = s.customer_details?.email || null;
          if (email && pianoValido(piano ?? "")) {
            void inviaEmailAbbonamento(email, {
              piano: piano as "pro" | "azienda",
              giorniProva: stato === "prova" ? GIORNI_PROVA : 0,
              fineProva,
              founder: eBetaTester(email),
              sconto: SCONTO_BETA,
            }).catch((e) => console.error("[email] abbonamento non inviata:", e instanceof Error ? e.message : e));
          }
        }
        break;
      }
      case "invoice.paid": {
        // Ogni addebito riuscito → ricevuta via email. Le fatture a zero
        // (l'avvio della prova) non generano ricevuta.
        const inv = event.data.object as Stripe.Invoice;
        if ((inv.amount_paid ?? 0) <= 0) break;
        let email = inv.customer_email || null;
        if (!email && typeof inv.customer === "string") {
          try {
            const c = await stripe().customers.retrieve(inv.customer);
            email = c.deleted ? null : c.email || null;
          } catch {
            /* senza email niente ricevuta, ma il webhook non fallisce */
          }
        }
        if (!email) break;
        const linea = inv.lines?.data?.[0];
        const periodoLinea = (linea as unknown as { period?: { start?: number; end?: number } } | undefined)?.period;
        void inviaEmailRicevuta(email, {
          importoCent: inv.amount_paid,
          descrizione: linea?.description || "Abbonamento ORION",
          dal: periodoLinea?.start ? new Date(periodoLinea.start * 1000) : null,
          al: periodoLinea?.end ? new Date(periodoLinea.end * 1000) : null,
          numero: inv.number ?? null,
          urlRicevuta: inv.hosted_invoice_url ?? null,
        }).catch((e) => console.error("[email] ricevuta non inviata:", e instanceof Error ? e.message : e));
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
          const periodo = finePeriodo(sub);
          const piano = (sub.metadata?.piano as string) || null;
          runWithTenant(tenant, () =>
            salvaAbbonamento({ stripe_subscription_id: sub.id, stato, piano, periodo_fine: periodo })
          );
          // Beta tester già abbonato senza sconto → aggancia lo sconto a vita.
          if (stato === "prova" || stato === "attivo") await assicuraScontoFounder(sub, customer);
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
