import { NextResponse } from "next/server";
import { getProfilo, statoAbbonamento, messaggiRecenti } from "@/lib/data";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await conTenant((u) => {
    const profilo = getProfilo();
    return {
      autenticato: true,
      utente: { email: u.email, nome: u.nome },
      // L'onboarding è PER-UTENTE (il titolare configura l'azienda, ogni
      // dipendente fa il suo): leggi il flag dell'utente, non del tenant.
      onboardingCompleto: u.onboarding_completo === 1,
      nome: u.nome ?? profilo.nome,
      abbonamento: statoAbbonamento(u.email),
      // ORION su misura: il tema estetico dell'utente (segue l'account ovunque).
      tema: (() => {
        try {
          return JSON.parse(u.preferenze || "{}")?.tema ?? null;
        } catch {
          return null;
        }
      })(),
      // Continuità: ultimi messaggi per ripopolare la conversazione al reload.
      storico: messaggiRecenti(40).map((m) => ({ role: m.ruolo, content: m.contenuto })),
    };
  });
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  if (!r.ok) return NextResponse.json({ autenticato: false, hasKey });
  return NextResponse.json({ ...r.data, hasKey });
}
