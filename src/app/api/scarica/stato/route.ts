import { NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { FILE_DOWNLOAD, clientR2, bucketR2 } from "@/lib/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Quali installer esistono davvero nel bucket? La vetrina accende i bottoni
// solo per quelli disponibili (gli altri mostrano "In arrivo").
export async function GET() {
  const s3 = clientR2();
  const stato: Record<string, boolean> = { mac: false, win: false };
  if (s3) {
    await Promise.all(
      Object.entries(FILE_DOWNLOAD).map(async ([os, chiave]) => {
        try {
          await s3.send(new HeadObjectCommand({ Bucket: bucketR2(), Key: chiave }));
          stato[os] = true;
        } catch {
          /* non c'è */
        }
      })
    );
  }
  return NextResponse.json(stato, { headers: { "Cache-Control": "public, max-age=300" } });
}
