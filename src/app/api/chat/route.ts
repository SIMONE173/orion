import { NextRequest, NextResponse } from "next/server";
import { runConversation, type MessaggioStorico } from "@/lib/orion/client";
import { conTenant } from "@/lib/sessione";
import { lanciato, eccezioneLancio, quandoInParole } from "@/lib/lancio";
import { emailDemo, demoEsaurita } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const storico: MessaggioStorico[] = Array.isArray(body?.messages) ? body.messages : [];
    const avvio: boolean = body?.avvio === true;
    const allegato =
      typeof body?.allegato?.dataUrl === "string" ? { dataUrl: body.allegato.dataUrl } : undefined;
    const desktop = body?.desktop === true;
    // LA FOTOGRAFIA DELLO SCHERMO: cosa ha GIÀ davanti. Senza questa, ogni
    // anticipazione diventa invadenza (riaprire ciò che è già aperto).
    const schermo =
      body?.schermo && typeof body.schermo === "object"
        ? {
            pannelli: Array.isArray(body.schermo.pannelli) ? body.schermo.pannelli.slice(0, 12).map(String) : [],
            app: Array.isArray(body.schermo.app) ? body.schermo.app.slice(0, 20).map(String) : [],
            manoInCorso: body.schermo.manoInCorso === true,
          }
        : undefined;

    // Lucchetto del lancio: vale anche per sessioni già aperte (tranne
    // eccezioni e DEMO — la demo è proprio la porta d'assaggio pre-lancio).
    const r = await conTenant(async (utente) => {
      const demo = emailDemo(utente.email);
      if (!lanciato() && !eccezioneLancio(utente.email) && !demo) {
        return { testo: `ORION apre ${quandoInParole()}. Ci vediamo lì! 🚀`, viste: [], errore: "lancio" };
      }
      // Tetto della demo: quando i crediti del tutorial finiscono, si saluta
      // con garbo e si indica la strada (nessuna chiamata AI parte più).
      if (demo && demoEsaurita(utente.tenant_id)) {
        return {
          testo:
            "La demo ti ha dato tutto quello che aveva! 🎬 Ti è piaciuto lavorare così? Nella versione completa questo è solo l'inizio: vai su orionvision.it e ci rimettiamo al lavoro insieme.",
          viste: [],
          errore: "demo_esaurita",
        };
      }
      return runConversation(storico, avvio, allegato, desktop, utente, schermo);
    });
    if (!r.ok) {
      return NextResponse.json(
        { testo: "Sessione scaduta. Accedi di nuovo.", viste: [], errore: "auth_sessione" },
        { status: 401 }
      );
    }
    return NextResponse.json(r.data);
  } catch (e) {
    console.error("[/api/chat]", e);
    return NextResponse.json(
      { testo: "Errore interno. Riprova.", viste: [], errore: "api_error" },
      { status: 500 }
    );
  }
}
