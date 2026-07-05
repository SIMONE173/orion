import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { analizzaEStagia } from "@/lib/importa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Analizza un'esportazione (CSV/Excel) del software che l'utente usa già:
// la mette in staging e restituisce colonne + esempi. La mappatura e l'import
// veri li decide ORION in conversazione (tool esegui_import).
const MAX_BASE64 = 11_000_000; // ≈ 8 MB di file

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const nome = String(body?.nome ?? "").trim();
  const base64 = String(body?.base64 ?? "");
  if (!nome || !base64) {
    return NextResponse.json({ ok: false, errore: "File mancante." }, { status: 400 });
  }
  if (base64.length > MAX_BASE64) {
    return NextResponse.json({ ok: false, errore: "File troppo grande (max ~8 MB): esporta un periodo più corto." }, { status: 413 });
  }
  const buf = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  try {
    const r = await conTenant(() => analizzaEStagia(nome, buf));
    if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato." }, { status: 401 });
    return NextResponse.json({ ok: true, ...r.data });
  } catch (e) {
    return NextResponse.json({ ok: false, errore: e instanceof Error ? e.message : "File non leggibile." }, { status: 422 });
  }
}
