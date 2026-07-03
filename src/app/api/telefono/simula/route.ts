import { NextRequest, NextResponse } from "next/server";
import { cervelloTelefono, salutoIniziale } from "@/lib/telefono";
import { getChiamataBySid, apriChiamata, getClienteByTelefono } from "@/lib/data";
import { primoTenant } from "@/lib/auth";
import { runWithTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────────────────────
// SIMULATORE del centralino (per provare senza Twilio, come /api/whatsapp/simula):
//
//   curl -X POST http://localhost:3000/api/telefono/simula \
//     -H 'Content-Type: application/json' \
//     -d '{"da":"+393331234567","testo":"vorrei un appuntamento domani pomeriggio"}'
//
// Prima chiamata con "testo" vuoto → restituisce il saluto. Le chiamate
// successive proseguono la stessa conversazione (stesso numero).
// In produzione è protetto dal segreto del cron (header x-orion-cron).
// ──────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const inProduzione = process.env.NODE_ENV === "production";
  const segreto = process.env.VAPID_PRIVATE_KEY || "";
  if (inProduzione && (!segreto || req.headers.get("x-orion-cron") !== segreto)) {
    return NextResponse.json({ ok: false, errore: "non autorizzato" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const da = String(body?.da ?? "+390000000000");
  const testo = String(body?.testo ?? "").trim();
  const callSid = `sim-${da.replace(/\D/g, "")}`;

  const tenantId = Number(process.env.ORION_TELEFONO_TENANT || 0) || primoTenant();
  if (!tenantId) return NextResponse.json({ ok: false, errore: "nessun tenant" }, { status: 400 });

  const r = await runWithTenant(tenantId, async () => {
    if (!testo) {
      const cliente = getClienteByTelefono(da);
      if (!getChiamataBySid(callSid)) {
        apriChiamata({ call_sid: callSid, da_numero: da, cliente_id: cliente?.id ?? null });
      }
      return { risposta: salutoIniziale(), fine: false };
    }
    return cervelloTelefono(callSid, da, testo);
  });

  return NextResponse.json({ ok: true, ...r });
}
