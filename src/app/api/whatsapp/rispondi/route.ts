import { NextRequest, NextResponse } from "next/server";
import { getCliente, getComunicazione, logCommunication, logEvento } from "@/lib/data";
import { inviaMessaggioWhatsApp } from "@/lib/whatsapp";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La RISPOSTA DEL TITOLARE a un messaggio in arrivo, dettata o scritta a ORION.
// Vale come parola sua: parte così com'è, senza firme e senza rielaborazioni.
// Con Meta collegato viaggia sul numero vero; senza, viene registrata (simulata).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const testo = String(body?.testo ?? "").trim().slice(0, 2000);
    if (!testo) return NextResponse.json({ ok: false, errore: "testo vuoto" }, { status: 400 });

    const r = await conTenant(async () => {
      // Destinatario: dalla comunicazione a cui si risponde, da un cliente o
      // da un numero diretto — nell'ordine.
      const com = body?.comunicazione_id ? getComunicazione(Number(body.comunicazione_id)) : undefined;
      const cliente =
        (com?.cliente_id ? getCliente(com.cliente_id) : undefined) ??
        (body?.cliente_id ? getCliente(Number(body.cliente_id)) : undefined);
      const telefono: string | null =
        com?.telefono ?? cliente?.telefono ?? (body?.telefono ? String(body.telefono) : null);
      if (!telefono) return { ok: false as const, errore: "destinatario senza numero di telefono" };

      const esito = await inviaMessaggioWhatsApp(telefono, testo);
      if (!esito.ok) return { ok: false as const, errore: esito.errore ?? "invio fallito" };

      logCommunication({
        cliente_id: cliente?.id ?? com?.cliente_id ?? null,
        direzione: "out",
        tipo: "testo",
        contenuto: testo,
        telefono,
        stato: esito.simulato ? "simulato" : "inviato",
      });
      const chi = cliente?.nome ?? com?.cliente_nome ?? telefono;
      logEvento({
        tipo: "risposta_titolare",
        soggetto: chi,
        cliente_id: cliente?.id ?? null,
        descrizione: `Risposta del titolare a ${chi} via ORION: ${testo.slice(0, 120)}`,
      });
      return { ok: true as const, simulato: Boolean(esito.simulato), destinatario: chi };
    });

    if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
    return NextResponse.json(r.data);
  } catch (e) {
    return NextResponse.json(
      { ok: false, errore: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
