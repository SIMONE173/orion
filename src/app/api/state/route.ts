import { NextResponse } from "next/server";
import { getProfilo, statoAbbonamento, messaggiRecenti } from "@/lib/data";
import { conTenant } from "@/lib/sessione";
import { lanciato, eccezioneLancio } from "@/lib/lancio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** «14:22» se è di oggi, «ieri 19:23», «28/07 19:23» se è più vecchio. */
function oraInChat(iso: string): string {
  const d = new Date(iso);
  const gg = (x: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(x);
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  const oggi = gg(new Date());
  const suo = gg(d);
  if (suo === oggi) return ora;
  const ieri = gg(new Date(Date.now() - 86_400_000));
  if (suo === ieri) return `ieri ${ora}`;
  return `${suo.slice(8, 10)}/${suo.slice(5, 7)} ${ora}`;
}

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
      // Collaudo pre-lancio: per i tester la vetrina sblocca anche i download.
      tester: !lanciato() && eccezioneLancio(u.email),
      // ORION DEMO: il client accende binario tutorial, badge e limiti demo.
      // Il binario del tutorial sopravvive al ricaricamento della pagina.
      // ORION su misura: il tema estetico dell'utente (segue l'account ovunque).
      tema: (() => {
        try {
          return JSON.parse(u.preferenze || "{}")?.tema ?? null;
        } catch {
          return null;
        }
      })(),
      // Continuità: ultimi messaggi per ripopolare la conversazione al reload
      // (con l'ORARIO di ciascuno, come in ogni chat che si rispetti).
      storico: messaggiRecenti(40).map((m) => ({
        role: m.ruolo,
        content: m.contenuto,
        // Solo l'ora, su una conversazione lunga giorni, sembra scombinata
        // (le 19:23 di ieri finiscono in mezzo alle 14:22 di oggi). Se il
        // messaggio non è di oggi, si dice anche il giorno.
        ora: oraInChat(m.created_at),
      })),
    };
  });
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  if (!r.ok) return NextResponse.json({ autenticato: false, hasKey });
  return NextResponse.json({ ...r.data, hasKey });
}
