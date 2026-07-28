import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { emailDemo } from "@/lib/demo";
import { pianoSincronia, spuntaRighe, obiettivoPerLaMano, daQuanto } from "@/lib/sincronia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * IL PIANO DEL RISVEGLIO. L'app lo chiede appena il computer torna vivo:
 * «cos'è successo mentre ero via, e cosa devo riportare nei suoi programmi?».
 * Le cose nate e morte durante l'assenza vengono spuntate qui, subito, senza
 * toccare il computer di nessuno.
 */
export async function GET() {
  const r = await conTenant(async (utente) => {
    if (emailDemo(utente.email)) return { voci: [], daFare: 0, sistemi: [], demo: true };
    const piano = pianoSincronia();
    // Nate e morte mentre eri via: nel gestionale non sono mai esistite.
    if (piano.daSpuntareSubito.length) spuntaRighe(piano.daSpuntareSubito);
    return {
      voci: piano.voci,
      daFare: piano.daFare,
      sistemi: piano.sistemi,
      indietroDa: daQuanto(piano.piuVecchio),
      obiettivi: piano.sistemi.map((s) => ({ sistema: s, obiettivo: obiettivoPerLaMano(piano, s) })),
      saltate: piano.voci.filter((v) => v.azione === "niente").length,
    };
  });
  if (!r.ok) return NextResponse.json({ errore: "auth" }, { status: 401 });
  return NextResponse.json(r.data);
}

/** A lavoro finito: spegne le righe riportate davvero. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
  const r = await conTenant(async () => ({ spente: spuntaRighe(ids) }));
  if (!r.ok) return NextResponse.json({ errore: "auth" }, { status: 401 });
  return NextResponse.json(r.data);
}
