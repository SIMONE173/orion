import { NextRequest, NextResponse } from "next/server";
import { analisiProattiva, messaggiInArrivoDopo } from "@/lib/data";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Osservazione continua: l'app interroga periodicamente questo endpoint (mentre è
// aperta) per sapere se c'è qualcosa da gestire o nuovi messaggi in arrivo.
// È pura lettura del DB → NON consuma crediti dell'API.
export async function GET(req: NextRequest) {
  const dopo = req.nextUrl.searchParams.get("dopo");
  const r = await conTenant(() => {
    const { segnalazioni } = analisiProattiva();
    const nuoviMessaggi = dopo
      ? messaggiInArrivoDopo(dopo).map((m) => ({
          id: m.id,
          cliente: m.cliente_nome ?? "Sconosciuto",
          tipo: m.tipo,
          anteprima: m.contenuto ?? `[${m.tipo}]`,
        }))
      : [];
    return { segnalazioni, nuoviMessaggi };
  });
  if (!r.ok) return NextResponse.json({ segnalazioni: [], nuoviMessaggi: [] });
  return NextResponse.json(r.data);
}
