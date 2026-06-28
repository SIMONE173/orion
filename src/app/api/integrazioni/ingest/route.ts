import { NextRequest, NextResponse } from "next/server";
import { trovaConnessionePerToken, upsertEntitaEsterna, logEvento } from "@/lib/data";
import { runWithTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webhook di INGEST dei sistemi esterni (gestionali/CRM/ERP/script/Zapier…).
// Lo chiama una MACCHINA, non un utente loggato: il tenant si ricava dal token
// segreto della connessione. Nessuna chiamata in uscita → niente SSRF. I record
// entrano nel modello cognitivo unificato di ORION (collegati ai clienti).
type RecordEsterno = {
  tipo?: string;
  chiave_esterna?: string;
  titolo?: string;
  dati?: unknown;
  cliente_nome?: string;
  riferimento?: string;
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

  let salvati = 0;
  await runWithTenant(conn.tenant_id, () => {
    for (const r of records.slice(0, 200)) {
      upsertEntitaEsterna({
        connessione_id: conn.id,
        tipo: r.tipo,
        chiave_esterna: r.chiave_esterna ?? null,
        titolo: r.titolo ?? null,
        dati: r.dati,
        cliente_nome: r.cliente_nome ?? null,
        riferimento: r.riferimento ?? null,
      });
      salvati++;
    }
    logEvento({
      tipo: "ingest_esterno",
      descrizione: `${salvati} record da "${conn.nome}"`,
      soggetto: conn.nome,
    });
  });

  return NextResponse.json({ ok: true, salvati });
}
