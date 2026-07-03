import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { getFattura } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scarica l'XML FatturaPA di una fattura emessa (per conservazione, invio al
// commercialista o trasmissione manuale se il provider SDI non è collegato).
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, errore: "id mancante" }, { status: 400 });
  const r = await conTenant(() => getFattura(id));
  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  if (!r.data) return NextResponse.json({ ok: false, errore: "Fattura non trovata" }, { status: 404 });
  if (!r.data.xml)
    return NextResponse.json(
      { ok: false, errore: "Questa fattura non ha XML (es. prestazione sanitaria fuori SDI)" },
      { status: 404 }
    );
  const nomeFile = `fattura_${r.data.numero.replace(/\W/g, "_")}.xml`;
  return new NextResponse(r.data.xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeFile}"`,
    },
  });
}
