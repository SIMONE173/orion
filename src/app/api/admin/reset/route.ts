import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ⚠️ ENDPOINT DI MANUTENZIONE TEMPORANEO (pre-lancio).
// Azzera tutti i dati applicativi per ripartire da un DB pulito dopo la
// migrazione multi-tenant. Protetto dallo stesso segreto del cron.
// DA RIMUOVERE dopo l'uso.
export async function POST(req: NextRequest) {
  // Accetta il segreto del cron O quello dell'app Meta (entrambi noti e su Railway).
  const ammessi = [process.env.VAPID_PRIVATE_KEY, process.env.META_APP_SECRET].filter(Boolean);
  const dato = req.headers.get("x-orion-cron") || "";
  if (!ammessi.length || !ammessi.includes(dato)) {
    return NextResponse.json({ ok: false, errore: "non autorizzato" }, { status: 403 });
  }

  const tabelle = [
    "sessioni",
    "whatsapp_accounts",
    "push_subscriptions",
    "lista_attesa",
    "documenti",
    "promemoria",
    "fatture",
    "comunicazioni",
    "pagamenti",
    "note",
    "appuntamenti",
    "clienti",
    "profili",
    "utenti",
  ];
  const risultato: Record<string, number | string> = {};
  const d = db();
  for (const t of tabelle) {
    try {
      const r = d.prepare(`DELETE FROM ${t}`).run();
      risultato[t] = r.changes;
    } catch (e) {
      risultato[t] = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json({ ok: true, eliminati: risultato });
}
