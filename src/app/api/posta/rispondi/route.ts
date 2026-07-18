import { NextRequest, NextResponse } from "next/server";
import { getCliente, getComunicazione, logCommunication, logEvento } from "@/lib/data";
import { inviaMessaggioWhatsApp } from "@/lib/whatsapp";
import { inviaEmail } from "@/lib/email";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LA RISPOSTA DEL TITOLARE, sul canale giusto: WhatsApp o email (con «Re:»
// automatico). Parola sua: parte così com'è, senza firme né rielaborazioni.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const testo = String(body?.testo ?? "").trim().slice(0, 4000);
    if (!testo) return NextResponse.json({ ok: false, errore: "testo vuoto" }, { status: 400 });

    const r = await conTenant(async () => {
      const com = body?.comunicazione_id ? getComunicazione(Number(body.comunicazione_id)) : undefined;
      const cliente =
        (com?.cliente_id ? getCliente(com.cliente_id) : undefined) ??
        (body?.cliente_id ? getCliente(Number(body.cliente_id)) : undefined);
      const canale: "whatsapp" | "email" =
        (com?.canale === "email" ? "email" : undefined) ?? (body?.canale === "email" ? "email" : "whatsapp");

      if (canale === "email") {
        const a: string | null = com?.mittente ?? cliente?.email ?? (body?.a ? String(body.a) : null);
        if (!a) return { ok: false as const, errore: "destinatario senza indirizzo email" };
        const oggetto =
          (body?.oggetto ? String(body.oggetto) : null) ??
          (com?.oggetto ? (/^re:/i.test(com.oggetto) ? com.oggetto : `Re: ${com.oggetto}`) : "Risposta");
        const esito = await inviaEmail(a, oggetto, testo);
        if (!esito.ok) {
          const simulato = esito.errore === "non_configurato";
          if (!simulato) return { ok: false as const, errore: esito.errore ?? "invio fallito" };
          // Casella non collegata: si registra comunque, con onestà.
          logCommunication({ cliente_id: cliente?.id ?? com?.cliente_id ?? null, direzione: "out", canale: "email", tipo: "email", contenuto: testo, oggetto, mittente: a, stato: "simulato" });
          return { ok: true as const, canale, simulato: true, destinatario: cliente?.nome ?? a };
        }
        logCommunication({ cliente_id: cliente?.id ?? com?.cliente_id ?? null, direzione: "out", canale: "email", tipo: "email", contenuto: testo, oggetto, mittente: a, stato: "inviato" });
        const chi = cliente?.nome ?? com?.cliente_nome ?? a;
        logEvento({ tipo: "risposta_titolare", soggetto: chi, cliente_id: cliente?.id ?? null, descrizione: `Risposta email del titolare a ${chi}: «${oggetto}»` });
        return { ok: true as const, canale, simulato: false, destinatario: chi };
      }

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
      logEvento({ tipo: "risposta_titolare", soggetto: chi, cliente_id: cliente?.id ?? null, descrizione: `Risposta del titolare a ${chi} via ORION: ${testo.slice(0, 120)}` });
      return { ok: true as const, canale, simulato: Boolean(esito.simulato), destinatario: chi };
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
