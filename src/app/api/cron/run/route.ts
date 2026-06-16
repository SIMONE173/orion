import { NextRequest, NextResponse } from "next/server";
import { promemoriaDaNotificare, segnaPromemoriaNotificati } from "@/lib/data";
import { inviaPushATutti } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eseguito dallo scheduler interno (o da un cron esterno). Protetto da segreto.
export async function POST(req: NextRequest) {
  const segreto = process.env.VAPID_PRIVATE_KEY || "";
  if (!segreto || req.headers.get("x-orion-cron") !== segreto) {
    return NextResponse.json({ ok: false, errore: "non autorizzato" }, { status: 403 });
  }

  const dovuti = promemoriaDaNotificare();
  if (!dovuti.length) return NextResponse.json({ ok: true, dovuti: 0, inviati: 0 });

  const corpo =
    dovuti.length === 1
      ? dovuti[0].testo
      : `${dovuti.length} promemoria: ${dovuti
          .slice(0, 3)
          .map((p) => p.testo)
          .join("; ")}${dovuti.length > 3 ? "…" : ""}`;

  const r = await inviaPushATutti({ titolo: "Promemoria ORION", corpo, url: "/" });
  if (r.inviati > 0) segnaPromemoriaNotificati(dovuti.map((p) => p.id));

  return NextResponse.json({ ok: true, dovuti: dovuti.length, ...r });
}
