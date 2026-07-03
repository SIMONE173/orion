import { NextRequest, NextResponse } from "next/server";
import { tenantDaNumeroCentralino, getChiamataBySid, aggiornaChiamata, logEvento } from "@/lib/data";
import { inviaPushATutti } from "@/lib/push";
import { primoTenant } from "@/lib/auth";
import { runWithTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Status callback Twilio: chiude il registro della chiamata e avvisa il
// professionista con una push ("Il centralino ha prenotato Rossi per…").
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const callSid = String(form.get("CallSid") ?? "");
    const from = String(form.get("From") ?? "");
    const to = String(form.get("To") ?? "");
    const status = String(form.get("CallStatus") ?? "");
    if (!callSid) return NextResponse.json({ ok: true });

    const tenantId = tenantDaNumeroCentralino(to) || Number(process.env.ORION_TELEFONO_TENANT || 0) || primoTenant();
    if (!tenantId) return NextResponse.json({ ok: true });

    await runWithTenant(tenantId, async () => {
      const ch = getChiamataBySid(callSid);
      if (!ch) {
        // Chiamata mai arrivata alla conversazione (occupato/nessuna risposta).
        return;
      }
      if (status === "completed" || status === "busy" || status === "failed" || status === "no-answer") {
        const esito = ch.esito ?? (ch.stato === "in_corso" ? "Chiamata interrotta dal chiamante" : null);
        if (ch.stato === "in_corso") {
          aggiornaChiamata(ch.id, { stato: "conclusa", esito });
        }
        logEvento({
          tipo: "chiamata_conclusa",
          soggetto: ch.cliente_nome ?? from,
          cliente_id: ch.cliente_id,
          descrizione: `Telefonata da ${ch.cliente_nome ?? from}: ${esito ?? "gestita dal centralino"}`,
        });
        await inviaPushATutti({
          titolo: "Telefonata gestita dal centralino",
          corpo: `${ch.cliente_nome ?? from}: ${esito ?? "conversazione conclusa"}`,
          url: "/",
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[telefono stato]", e);
    return NextResponse.json({ ok: false });
  }
}
