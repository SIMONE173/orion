import { NextRequest, NextResponse } from "next/server";
import { cervelloTelefono, salutoIniziale } from "@/lib/telefono";
import { tenantDaNumeroCentralino, getChiamataBySid, apriChiamata, getClienteByTelefono } from "@/lib/data";
import { primoTenant } from "@/lib/auth";
import { runWithTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────────────────────
// CENTRALINO AI — webhook vocale Twilio.
//
// Configurazione su Twilio (vedi TELEFONO.md):
//   numero → Voice → "A call comes in" → Webhook POST → https://<dominio>/api/telefono/webhook
//   status callback → https://<dominio>/api/telefono/stato
//
// Flusso: Twilio manda form-encoded (CallSid, From, To, SpeechResult…).
// Rispondiamo TwiML: <Say> (voce italiana) + <Gather input="speech"> in loop.
// Il tenant si risolve dal numero CHIAMATO (To) → telefono_accounts; fallback:
// ORION_TELEFONO_TENANT o primo tenant (sviluppo).
// ──────────────────────────────────────────────────────────────────────────

const VOCE = () => (process.env.TWILIO_VOICE || "Polly.Bianca").trim();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function twiml(body: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function say(testo: string): string {
  return `<Say voice="${VOCE()}" language="it-IT">${esc(testo)}</Say>`;
}

function gather(testo: string, vuoti = 0): string {
  // actionOnEmptyResult: anche il silenzio torna qui (per il re-prompt garbato).
  return `<Gather input="speech" language="it-IT" speechTimeout="auto" actionOnEmptyResult="true" action="/api/telefono/webhook?vuoti=${vuoti}" method="POST">${say(
    testo
  )}</Gather>`;
}

function risolviTenant(to: string): number | null {
  const daNumero = tenantDaNumeroCentralino(to);
  if (daNumero) return daNumero;
  const forzato = Number(process.env.ORION_TELEFONO_TENANT || 0);
  if (forzato) return forzato;
  return primoTenant();
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const callSid = String(form.get("CallSid") ?? "");
    const from = String(form.get("From") ?? "");
    const to = String(form.get("To") ?? "");
    const speech = String(form.get("SpeechResult") ?? "").trim();
    const vuoti = Number(req.nextUrl.searchParams.get("vuoti") ?? 0);

    if (!callSid) return twiml(say("Configurazione non valida.") + "<Hangup/>");

    const tenantId = risolviTenant(to);
    if (!tenantId) {
      return twiml(say("Il servizio non è ancora configurato. Arrivederci.") + "<Hangup/>");
    }

    return await runWithTenant(tenantId, async () => {
      const esistente = getChiamataBySid(callSid);

      // Primo contatto della chiamata: saluto + disclosure, poi ascolto.
      if (!esistente && !speech) {
        const cliente = from ? getClienteByTelefono(from) : undefined;
        apriChiamata({ call_sid: callSid, da_numero: from, cliente_id: cliente?.id ?? null });
        return twiml(gather(salutoIniziale()));
      }

      // Silenzio: un re-prompt gentile, poi chiusura con invito a richiamare.
      if (!speech) {
        if (vuoti >= 1) {
          return twiml(
            say("Non la sento più. Può richiamare in qualsiasi momento, oppure lo studio la ricontatterà. Buona giornata!") + "<Hangup/>"
          );
        }
        return twiml(gather("È ancora in linea? Mi dica pure.", vuoti + 1));
      }

      // Turno di conversazione vero e proprio.
      const { risposta, fine } = await cervelloTelefono(callSid, from, speech);
      if (fine) return twiml(say(risposta) + "<Hangup/>");
      return twiml(gather(risposta));
    });
  } catch (e) {
    console.error("[telefono webhook]", e);
    return twiml(say("Mi scusi, c'è stato un problema tecnico. La preghiamo di richiamare.") + "<Hangup/>");
  }
}
