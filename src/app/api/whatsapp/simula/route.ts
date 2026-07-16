import { NextRequest, NextResponse } from "next/server";
import { cercaCliente, getClienteByTelefono, logCommunication } from "@/lib/data";
import { gestisciMessaggioCliente } from "@/lib/orion/segreteria";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simula un messaggio WhatsApp IN ARRIVO (per provare "Rossi ha risposto" senza
// un numero reale). Esempio:
//   curl -X POST localhost:3000/api/whatsapp/simula \
//     -H 'content-type: application/json' \
//     -d '{"cliente_nome":"Marco Rossi","testo":"Confermo per martedì"}'
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const r = await conTenant(async () => {
      const cliente =
        (body.cliente_nome ? cercaCliente(String(body.cliente_nome))[0] : undefined) ??
        (body.telefono ? getClienteByTelefono(String(body.telefono)) : undefined);

      const tipo = body.tipo ?? "testo";
      const com = logCommunication({
        cliente_id: cliente?.id ?? null,
        direzione: "in",
        tipo,
        contenuto: body.testo ?? (tipo !== "testo" ? `[${tipo}]` : null),
        allegato_nome: body.allegato_nome ?? (body.allegato ? tipo : null),
        allegato_url: body.allegato ?? null,
        stato: "ricevuto",
      });
      // processa:true → il messaggio attraversa la STESSA pipeline del webhook
      // vero (copioni + segreteria AI): perfetto per provare la segreteria.
      let rispostaInviata = false;
      if (body.processa === true && tipo === "testo" && body.testo) {
        rispostaInviata = await gestisciMessaggioCliente({
          cliente,
          telefono: cliente?.telefono ?? String(body.telefono ?? "sim-000"),
          testo: String(body.testo),
        });
      }
      return { com, rispostaInviata };
    });
    if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
    return NextResponse.json({ ok: true, comunicazione: r.data.com, rispostaInviata: r.data.rispostaInviata });
  } catch (e) {
    return NextResponse.json(
      { ok: false, errore: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
