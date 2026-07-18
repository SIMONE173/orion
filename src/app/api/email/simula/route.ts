import { NextRequest, NextResponse } from "next/server";
import { processaEmailInArrivo, classificaEmail } from "@/lib/posta";
import { getClienteByEmail } from "@/lib/data";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simula una EMAIL IN ARRIVO (per provare il classificatore e l'annuncio senza
// una casella collegata). Esempio:
//   curl -X POST localhost:3000/api/email/simula -H 'content-type: application/json' \
//     -d '{"da":"Sara Neri <sara@esempio.it>","oggetto":"Preventivo","corpo":"Buongiorno..."}'
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const daGrezzo = String(body.da ?? "");
    const m = daGrezzo.match(/^(.*?)<([^>]+)>\s*$/);
    const daNome = (m ? m[1] : "").trim().replace(/^"|"$/g, "");
    const daIndirizzo = (m ? m[2] : daGrezzo).trim().toLowerCase();

    const r = await conTenant(() => {
      const email = {
        uid: 0,
        daNome,
        daIndirizzo,
        oggetto: String(body.oggetto ?? "(senza oggetto)"),
        data: new Date().toISOString(),
        corpo: String(body.corpo ?? ""),
        bulk: Boolean(body.bulk),
      };
      const cliente = daIndirizzo ? getClienteByEmail(daIndirizzo) : undefined;
      const classifica = classificaEmail({
        daNome,
        daIndirizzo,
        oggetto: email.oggetto,
        corpo: email.corpo,
        bulk: email.bulk,
        diCliente: Boolean(cliente),
      });
      const com = processaEmailInArrivo(email);
      return { comunicazione: com, classifica };
    });
    if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
    return NextResponse.json({ ok: true, ...r.data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, errore: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
