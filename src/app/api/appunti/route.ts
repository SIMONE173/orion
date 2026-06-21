import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { creaDocumento } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Salva gli appunti dettati come documento ORION (collegabile a un cliente).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const testo = String(body?.testo ?? "").trim();
  const titolo = String(body?.titolo ?? "").trim() || "Appunti";
  const tipo = String(body?.tipo ?? "appunti").trim() || "appunti";
  const clienteId = body?.cliente_id ? Number(body.cliente_id) : null;
  if (!testo) {
    return NextResponse.json({ ok: false, errore: "Niente da salvare." }, { status: 400 });
  }
  const r = await conTenant(() =>
    creaDocumento({ cliente_id: clienteId, titolo, tipo, testo })
  );
  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  return NextResponse.json({ ok: true, documento: r.data });
}
