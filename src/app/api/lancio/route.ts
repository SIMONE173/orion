import { NextResponse } from "next/server";
import { statoLancio } from "@/lib/lancio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stato del lancio (pubblico): la vetrina e l'app mostrano il conto alla
// rovescia. La serratura vera è nei cancelli server (login/signup/chat/scarica).
export async function GET() {
  return NextResponse.json(statoLancio(), {
    headers: { "Cache-Control": "public, max-age=10" },
  });
}
