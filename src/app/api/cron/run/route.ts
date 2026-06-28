import { NextRequest, NextResponse } from "next/server";
import {
  promemoriaDaNotificare,
  segnaPromemoriaNotificati,
  compitiDaNotificare,
  segnaCompitiNotificati,
} from "@/lib/data";
import { inviaPushATutti } from "@/lib/push";
import { tuttiITenant } from "@/lib/auth";
import { runWithTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eseguito dallo scheduler interno (o da un cron esterno). Protetto da segreto.
// Gira per OGNI tenant: i promemoria e le iscrizioni push sono separati per account.
export async function POST(req: NextRequest) {
  const segreto = process.env.VAPID_PRIVATE_KEY || "";
  if (!segreto || req.headers.get("x-orion-cron") !== segreto) {
    return NextResponse.json({ ok: false, errore: "non autorizzato" }, { status: 403 });
  }

  let totDovuti = 0;
  let totInviati = 0;

  for (const tenantId of tuttiITenant()) {
    await runWithTenant(tenantId, async () => {
      const dovuti = promemoriaDaNotificare();
      if (!dovuti.length) return;
      totDovuti += dovuti.length;

      const corpo =
        dovuti.length === 1
          ? dovuti[0].testo
          : `${dovuti.length} promemoria: ${dovuti
              .slice(0, 3)
              .map((p) => p.testo)
              .join("; ")}${dovuti.length > 3 ? "…" : ""}`;

      const r = await inviaPushATutti({ titolo: "Promemoria ORION", corpo, url: "/" });
      if (r.inviati > 0) {
        segnaPromemoriaNotificati(dovuti.map((p) => p.id));
        totInviati += r.inviati;
      }
    });

    // Azienda: avvisa dei compiti in ritardo (una volta, finché non si aggiornano).
    await runWithTenant(tenantId, async () => {
      const ritardo = compitiDaNotificare();
      if (!ritardo.length) return;
      totDovuti += ritardo.length;
      const corpo =
        ritardo.length === 1
          ? `In ritardo: ${ritardo[0].titolo}${ritardo[0].assegnatario ? ` (${ritardo[0].assegnatario})` : ""}`
          : `${ritardo.length} compiti in ritardo: ${ritardo.slice(0, 3).map((c) => c.titolo).join("; ")}${ritardo.length > 3 ? "…" : ""}`;
      const r = await inviaPushATutti({ titolo: "Compiti in ritardo", corpo, url: "/" });
      if (r.inviati > 0) {
        segnaCompitiNotificati(ritardo.map((c) => c.id));
        totInviati += r.inviati;
      }
    });
  }

  return NextResponse.json({ ok: true, dovuti: totDovuti, inviati: totInviati });
}
