import { NextRequest, NextResponse } from "next/server";
import { arriviNonLetti, segnaComunicazioniLette } from "@/lib/data";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La POSTA IN ARRIVO del titolare: i messaggi WhatsApp dei clienti non ancora
// aperti. L'app la interroga periodicamente (sola lettura DB, zero crediti) e
// ORION annuncia: «È arrivato un messaggio da X, vuoi aprirlo?».
export async function GET() {
  const r = await conTenant(() => ({
    arrivi: arriviNonLetti().map((m) => ({
      id: m.id,
      cliente: m.cliente_nome ?? null,
      cliente_id: m.cliente_id,
      telefono: m.telefono ?? null,
      tipo: m.tipo,
      contenuto: m.contenuto,
      allegato_url: m.allegato_url,
      allegato_nome: m.allegato_nome,
      quando: m.created_at,
    })),
  }));
  if (!r.ok) return NextResponse.json({ arrivi: [] }, { status: 401 });
  return NextResponse.json(r.data);
}

// Il titolare li ha aperti (o rimandati): non vanno più annunciati.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
    const r = await conTenant(() => {
      segnaComunicazioniLette(ids);
      return { segnati: ids.length };
    });
    if (!r.ok) return NextResponse.json({ ok: false }, { status: 401 });
    return NextResponse.json({ ok: true, ...r.data });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
