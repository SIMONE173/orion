import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FILE_DOWNLOAD, clientR2, bucketR2 } from "@/lib/download";
import { lanciato, chiaveVipValida, quandoInParole } from "@/lib/lancio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────────────────────
// DOWNLOAD degli installer (vetrina). I file vivono nel bucket R2 privato
// (prefisso download/): qui si genera un link FIRMATO temporaneo (15 minuti)
// e si reindirizza — niente bucket pubblico, niente giga attraverso il server.
//   GET /api/scarica?os=mac|win  → 302 al link firmato
// ──────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Lucchetto del lancio: prima dell'apertura si scarica solo con la parola
  // d'ordine (link ?vip=..., per il collaudo pre-lancio).
  if (!lanciato() && !chiaveVipValida(req.nextUrl.searchParams.get("vip"))) {
    return NextResponse.json(
      { ok: false, errore: `Il download apre il ${quandoInParole()}.` },
      { status: 403 }
    );
  }
  const os = (req.nextUrl.searchParams.get("os") ?? "").toLowerCase();
  const chiave = FILE_DOWNLOAD[os];
  const s3 = clientR2();
  if (!chiave || !s3) {
    return NextResponse.json({ ok: false, errore: "Download non disponibile." }, { status: 404 });
  }
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucketR2(), Key: chiave })); // esiste?
    const nomeFile = chiave.split("/").pop()!;
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucketR2(),
        Key: chiave,
        ResponseContentDisposition: `attachment; filename="${nomeFile}"`,
      }),
      { expiresIn: 900 }
    );
    return NextResponse.redirect(url, 302);
  } catch {
    return NextResponse.json({ ok: false, errore: "Questa versione non è ancora disponibile." }, { status: 404 });
  }
}
