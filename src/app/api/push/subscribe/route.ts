import { NextRequest, NextResponse } from "next/server";
import { salvaSubscription } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sub = body?.subscription ?? body;
    const endpoint: string | undefined = sub?.endpoint;
    const p256dh: string | undefined = sub?.keys?.p256dh;
    const auth: string | undefined = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ ok: false, errore: "Iscrizione incompleta" }, { status: 400 });
    }
    salvaSubscription({ endpoint, p256dh, auth });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, errore: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
