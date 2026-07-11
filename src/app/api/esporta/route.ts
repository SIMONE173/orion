import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import {
  listClienti,
  listAppuntamenti,
  listPagamenti,
  listFatture,
  listNoteTutte,
  logAudit,
  permessoArea,
} from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────────────────────
// EXPORT CSV — portabilità totale ("mai ostaggio dei dati").
//
// I gestionali storici trattengono i dati; ORION fa il contrario: qualunque
// cosa entra, esce in un CSV pulito, apribile in Excel e importabile ovunque
// (commercialista, altro gestionale, o un altro ORION).
//
//   GET /api/esporta?cosa=clienti|appuntamenti|pagamenti|fatture|note
//                    [&da=YYYY-MM-DD&a=YYYY-MM-DD]
//
// Protetto da sessione (solo il titolare esporta i SUOI dati). Ogni export
// finisce nell'audit (trasparenza sui movimenti di dati — GDPR-friendly).
// Formato: separatore ';' e BOM UTF-8, così Excel italiano lo apre perfetto.
// ──────────────────────────────────────────────────────────────────────────

type Riga = Record<string, unknown>;

function csv(intestazioni: string[], righe: Riga[]): string {
  const cella = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const testa = intestazioni.join(";");
  const corpo = righe.map((r) => intestazioni.map((h) => cella(r[h])).join(";")).join("\n");
  // BOM: fa riconoscere l'UTF-8 a Excel (accenti giusti al primo colpo).
  return "﻿" + testa + "\n" + corpo + (corpo ? "\n" : "");
}

const oggi = () => new Date().toISOString().slice(0, 10);
function annoFa(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}
function annoAvanti(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const cosa = (req.nextUrl.searchParams.get("cosa") ?? "").trim().toLowerCase();
  const da = req.nextUrl.searchParams.get("da") ?? annoFa();
  const a = req.nextUrl.searchParams.get("a") ?? annoAvanti();

  const r = await conTenant((u) => {
    // AREA RISERVATA: in azienda l'export completo dei dati spetta solo ai
    // ruoli autorizzati dal titolare (default: solo lui).
    if (!permessoArea("esporta", u.id).ok) {
      logAudit({ canale: "api", azione: "export_dati", dettaglio: `${cosa}: NEGATO (area riservata)` });
      return { riservato: true as const };
    }
    let contenuto: string | null = null;

    switch (cosa) {
      case "clienti": {
        const cols = ["nome", "telefono", "email", "codice_fiscale", "piva", "indirizzo", "cap", "comune", "provincia", "note", "ultima_visita"];
        contenuto = csv(cols, listClienti() as unknown as Riga[]);
        break;
      }
      case "appuntamenti": {
        const cols = ["inizio", "fine", "titolo", "cliente_nome", "stato", "note"];
        contenuto = csv(cols, listAppuntamenti(da, a) as unknown as Riga[]);
        break;
      }
      case "pagamenti": {
        const cols = ["data", "cliente_nome", "importo", "metodo", "stato", "descrizione"];
        contenuto = csv(cols, listPagamenti(da, a) as unknown as Riga[]);
        break;
      }
      case "fatture": {
        const cols = ["numero", "data", "cliente_nome", "importo", "bollo", "stato", "stato_sdi", "descrizione"];
        contenuto = csv(cols, listFatture(10_000) as unknown as Riga[]);
        break;
      }
      case "note": {
        const cols = ["created_at", "cliente_nome", "titolo", "contenuto"];
        contenuto = csv(cols, listNoteTutte() as unknown as Riga[]);
        break;
      }
      default:
        return null;
    }

    logAudit({ canale: "api", azione: "export_dati", dettaglio: `${cosa} (${da} → ${a})` });
    return contenuto;
  });

  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  if (typeof r.data === "object" && r.data !== null && "riservato" in r.data) {
    return NextResponse.json(
      { ok: false, errore: "Export riservato: chiedi al titolare di autorizzare il tuo ruolo (area 'esporta')." },
      { status: 403 }
    );
  }
  if (r.data === null) {
    return NextResponse.json(
      { ok: false, errore: "Parametro 'cosa' non valido: clienti | appuntamenti | pagamenti | fatture | note" },
      { status: 400 }
    );
  }

  return new NextResponse(r.data, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orion-${cosa}-${oggi()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
