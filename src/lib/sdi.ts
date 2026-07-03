// ──────────────────────────────────────────────────────────────────────────
// Adapter SDI: trasmissione della fattura elettronica (XML FatturaPA) tramite
// un provider API. Stesso stile dell'adapter WhatsApp: se le variabili non
// sono configurate, la fattura resta 'da_trasmettere' (XML pronto, scaricabile
// e trasmissibile in seguito) — nessun blocco, nessuna finzione.
//
// VARIABILI D'AMBIENTE:
//  SDI_PROVIDER   'acube' | 'openapi' | 'generico'   (default: generico)
//  SDI_API_URL    endpoint di invio (es. https://api-sandbox.acubeapi.com/invoices)
//  SDI_API_KEY    bearer token del provider
//
// I provider (A-Cube, Openapi, Aruba…) accettano l'XML FatturaPA e gestiscono
// firma e inoltro allo SDI. L'adapter 'generico' fa POST dell'XML con
// Authorization: Bearer — compatibile con A-Cube; per altri provider basta
// adattare qui, in un punto solo.
// ──────────────────────────────────────────────────────────────────────────

const provider = () => (process.env.SDI_PROVIDER || "generico").trim().toLowerCase();
const apiUrl = () => (process.env.SDI_API_URL || "").trim();
const apiKey = () => (process.env.SDI_API_KEY || "").trim();

export function sdiConfigurato(): boolean {
  return Boolean(apiUrl() && apiKey());
}

export type EsitoTrasmissione = {
  ok: boolean;
  simulato?: boolean;
  sdi_id?: string | null;
  stato: "trasmessa" | "da_trasmettere" | "scartata";
  errore?: string;
};

export async function trasmettiFattura(xml: string): Promise<EsitoTrasmissione> {
  if (!sdiConfigurato()) {
    // Nessun provider collegato: XML generato e conservato, trasmissione rinviata.
    return { ok: true, simulato: true, stato: "da_trasmettere" };
  }

  try {
    const res = await fetch(apiUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": provider() === "openapi" ? "application/json" : "application/xml",
      },
      body: provider() === "openapi" ? JSON.stringify({ fattura: xml }) : xml,
    });

    const testo = await res.text();
    if (!res.ok) {
      console.error(`[sdi] trasmissione fallita ${res.status}: ${testo.slice(0, 300)}`);
      return {
        ok: false,
        stato: res.status >= 400 && res.status < 500 ? "scartata" : "da_trasmettere",
        errore: `SDI provider ${res.status}: ${testo.slice(0, 220)}`,
      };
    }

    // Id della fattura presso il provider (formati diversi → best effort).
    let sdiId: string | null = null;
    try {
      const j = JSON.parse(testo) as { uuid?: string; id?: string | number; invoice_id?: string };
      sdiId = String(j.uuid ?? j.id ?? j.invoice_id ?? "") || null;
    } catch {
      sdiId = null;
    }
    return { ok: true, sdi_id: sdiId, stato: "trasmessa" };
  } catch (e) {
    console.error("[sdi] errore:", e);
    return { ok: false, stato: "da_trasmettere", errore: e instanceof Error ? e.message : String(e) };
  }
}
