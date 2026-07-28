import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { clientR2, bucketR2 } from "@/lib/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────────────────────
// IL CANALE DEGLI AGGIORNAMENTI. ORION, dentro l'app, chiede qui se c'è una
// versione nuova: prima il bollettino (latest.yml), poi il file da installare.
// I file vivono nel deposito privato: qui si firma un link temporaneo e si
// reindirizza — niente deposito aperto a tutti, niente giga sul server.
//
//   /api/aggiorna/latest.yml          → ORION (versione completa)
//   /api/aggiorna/demo/latest.yml     → ORION Demo (canale separato: la demo
//                                        non deve MAI aggiornarsi alla completa)
//
// Questo canale NON passa dal lucchetto del lancio: chi ha già ORION installato
// deve poter ricevere le correzioni, lancio aperto o no.
// ──────────────────────────────────────────────────────────────────────────

// Solo i file che servono davvero all'aggiornatore. Niente percorsi liberi.
const AMMESSI = /^(latest\.yml|latest-mac\.yml|latest-linux\.yml|[\w.-]+\.(exe|dmg|zip|blockmap))$/;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ file: string[] }> }) {
  const { file } = await ctx.params;
  const pezzi = (file ?? []).filter(Boolean);
  const demo = pezzi[0] === "demo";
  const nome = pezzi[demo ? 1 : 0] ?? "";

  if (!nome || pezzi.length > (demo ? 2 : 1) || !AMMESSI.test(nome)) {
    return NextResponse.json({ ok: false, errore: "non trovato" }, { status: 404 });
  }

  const s3 = clientR2();
  if (!s3) return NextResponse.json({ ok: false, errore: "canale non configurato" }, { status: 503 });

  const chiave = `download/aggiornamenti/${demo ? "demo/" : ""}${nome}`;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucketR2(), Key: chiave }));
  } catch {
    // Nessun aggiornamento pubblicato per questo canale: è una risposta
    // legittima, non un guasto. L'app se ne fa una ragione e riprova dopo.
    return NextResponse.json({ ok: false, errore: "nessun aggiornamento" }, { status: 404 });
  }

  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucketR2(), Key: chiave }), {
    expiresIn: 3600,
  });
  return NextResponse.redirect(url, 302);
}
