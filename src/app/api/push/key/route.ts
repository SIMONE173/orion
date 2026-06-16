import { NextResponse } from "next/server";
import { pushPublicKey, pushConfigurato } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ publicKey: pushPublicKey(), configurato: pushConfigurato() });
}
