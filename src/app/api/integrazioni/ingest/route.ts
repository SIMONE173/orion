import { NextRequest, NextResponse } from "next/server";
import {
  trovaConnessionePerToken,
  upsertEntitaEsterna,
  upsertClienteEsterno,
  upsertAppuntamentoEsterno,
  logEvento,
} from "@/lib/data";
import { runWithTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webhook di INGEST dei sistemi esterni (gestionali/CRM/ERP/script/Zapier/Make…).
// Lo chiama una MACCHINA, non un utente loggato: il tenant si ricava dal token
// segreto della connessione. Nessuna chiamata in uscita → niente SSRF.
//
// Due livelli:
//  - tipo "cliente" / "appuntamento" → alimentano i DATI CORE di ORION (ciò che
//    si vede in agenda/briefing/clienti): ORION diventa lo SPECCHIO VIVO del
//    gestionale. Idempotente per chiave_esterna, con _cancellato per le rimozioni.
//  - ogni altro tipo → modello unificato (entita_esterne): arricchisce la scheda
//    cliente con ordini/pratiche/documenti. (Comportamento storico, invariato.)
type RecordEsterno = {
  tipo?: string;
  chiave_esterna?: string;
  _cancellato?: boolean;
  // Comuni / entità
  titolo?: string;
  dati?: unknown;
  riferimento?: string;
  // Aggancio al cliente (telefono/email più affidabili del nome)
  cliente_nome?: string;
  cliente_telefono?: string;
  cliente_email?: string;
  cliente_chiave?: string; // chiave del cliente nel gestionale (per gli appuntamenti)
  // Campi cliente (tipo="cliente")
  nome?: string;
  telefono?: string;
  email?: string;
  note?: string;
  piva?: string;
  codice_fiscale?: string;
  indirizzo?: string;
  cap?: string;
  comune?: string;
  provincia?: string;
  // Campi appuntamento (tipo="appuntamento")
  inizio?: string;
  fine?: string;
  durata_min?: number;
  stato?: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(req.headers.get("x-orion-token") || body?.token || req.nextUrl.searchParams.get("token") || "");
  if (!token) return NextResponse.json({ ok: false, errore: "token mancante" }, { status: 401 });

  const conn = trovaConnessionePerToken(token);
  if (!conn) return NextResponse.json({ ok: false, errore: "token non valido" }, { status: 403 });

  const records: RecordEsterno[] = Array.isArray(body?.records)
    ? body.records
    : body?.record
    ? [body.record]
    : body?.tipo || body?.titolo || body?.chiave_esterna
    ? [body as RecordEsterno]
    : [];
  if (!records.length) return NextResponse.json({ ok: false, errore: "nessun record" }, { status: 400 });

  const conteggi = { clienti: 0, appuntamenti: 0, entita: 0, collegati: 0, cancellati: 0, ignorati: 0 };
  await runWithTenant(conn.tenant_id, () => {
    for (const r of records.slice(0, 500)) {
      const tipo = (r.tipo ?? "").toLowerCase();

      if (tipo === "cliente") {
        if (!r.chiave_esterna) { conteggi.ignorati++; continue; }
        const esito = upsertClienteEsterno({
          connessione_id: conn.id,
          chiave: String(r.chiave_esterna),
          nome: r.nome ?? r.cliente_nome ?? null,
          telefono: r.telefono ?? r.cliente_telefono ?? null,
          email: r.email ?? r.cliente_email ?? null,
          note: r.note ?? null,
          piva: r.piva ?? null,
          codice_fiscale: r.codice_fiscale ?? null,
          indirizzo: r.indirizzo ?? null,
          cap: r.cap ?? null,
          comune: r.comune ?? null,
          provincia: r.provincia ?? null,
          cancellato: r._cancellato === true,
        });
        if (esito.azione === "cancellato") conteggi.cancellati++;
        else if (esito.azione === "ignorato") conteggi.ignorati++;
        else conteggi.clienti++;
        continue;
      }

      if (tipo === "appuntamento") {
        if (!r.chiave_esterna) { conteggi.ignorati++; continue; }
        const esito = upsertAppuntamentoEsterno({
          connessione_id: conn.id,
          chiave: String(r.chiave_esterna),
          cliente_chiave: r.cliente_chiave ?? null,
          cliente_nome: r.cliente_nome ?? null,
          cliente_telefono: r.cliente_telefono ?? null,
          cliente_email: r.cliente_email ?? null,
          titolo: r.titolo ?? null,
          inizio: r.inizio ?? null,
          fine: r.fine ?? null,
          durata_min: r.durata_min ?? null,
          stato: r.stato ?? null,
          note: r.note ?? null,
          cancellato: r._cancellato === true,
        });
        if (esito.azione === "cancellato") conteggi.cancellati++;
        else if (esito.azione === "ignorato") conteggi.ignorati++;
        else conteggi.appuntamenti++;
        continue;
      }

      // Default storico: modello unificato (scheda cliente).
      const salvato = upsertEntitaEsterna({
        connessione_id: conn.id,
        tipo: r.tipo,
        chiave_esterna: r.chiave_esterna ?? null,
        titolo: r.titolo ?? null,
        dati: r.dati,
        cliente_nome: r.cliente_nome ?? null,
        cliente_telefono: r.cliente_telefono ?? null,
        cliente_email: r.cliente_email ?? null,
        riferimento: r.riferimento ?? null,
      });
      if (salvato.cliente_id) conteggi.collegati++;
      conteggi.entita++;
    }

    const parti = [
      conteggi.clienti && `${conteggi.clienti} clienti`,
      conteggi.appuntamenti && `${conteggi.appuntamenti} appuntamenti`,
      conteggi.entita && `${conteggi.entita} record`,
      conteggi.cancellati && `${conteggi.cancellati} rimossi`,
    ].filter(Boolean);
    logEvento({
      tipo: "ingest_esterno",
      descrizione: `Sync da "${conn.nome}": ${parti.join(", ") || "nessun cambiamento"}`,
      soggetto: conn.nome,
    });
  });

  return NextResponse.json({ ok: true, ...conteggi });
}
