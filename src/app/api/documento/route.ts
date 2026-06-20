import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { getDocumento } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Restituisce un documento COMPLETO (immagine + testo OCR) per il visore.
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, errore: "id mancante" }, { status: 400 });
  const r = await conTenant(() => getDocumento(id));
  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  if (!r.data) return NextResponse.json({ ok: false, errore: "Documento non trovato" }, { status: 404 });
  return NextResponse.json({ ok: true, documento: r.data });
}
