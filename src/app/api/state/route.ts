import { NextResponse } from "next/server";
import { getProfilo } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const profilo = getProfilo();
  return NextResponse.json({
    onboardingCompleto: profilo.onboarding_completo === 1,
    nome: profilo.nome,
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
