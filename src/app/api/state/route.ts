import { NextResponse } from "next/server";
import { getProfilo, statoAbbonamento } from "@/lib/data";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await conTenant((u) => {
    const profilo = getProfilo();
    return {
      autenticato: true,
      utente: { email: u.email, nome: u.nome },
      onboardingCompleto: profilo.onboarding_completo === 1,
      nome: profilo.nome,
      abbonamento: statoAbbonamento(),
    };
  });
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  if (!r.ok) return NextResponse.json({ autenticato: false, hasKey });
  return NextResponse.json({ ...r.data, hasKey });
}
