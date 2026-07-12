import crypto from "node:crypto";
import { db } from "./db";
import { tenantIdCorrente } from "./tenant";
import { decifra } from "./crypto";

// ──────────────────────────────────────────────────────────────────────────
// CANALE D'USCITA — il postino. Consegna gli eventi dell'outbox (eventi_uscita)
// al webhook del gestionale/Zapier del cliente:
//
// · FIRMATO: header `X-Orion-Firma: sha256=<hmac>` calcolato sul corpo col
//   segreto della connessione → il ricevente verifica che sia davvero ORION.
// · IN ORDINE per canale: se una consegna fallisce, le successive dello stesso
//   canale aspettano (uno "spostato" non deve mai superare il suo "creato").
// · CON PAZIENZA: tentativi a distanza crescente (1m → 5m → 15m → 1h → 6h →
//   24h), massimo 10; il cron è la rete di sicurezza, il turno di conversazione
//   dà la partenza immediata.
// ──────────────────────────────────────────────────────────────────────────

const BACKOFF_MIN = [1, 5, 15, 60, 360, 1440]; // minuti
const MAX_TENTATIVI = 10;

type EventoInAttesa = {
  id: number;
  connessione_id: number;
  evento: string;
  payload: string;
  tentativi: number;
  created_at: string;
  webhook_uscita: string;
  segreto_uscita: string | null;
};

function prossimoRitardo(tentativi: number): string {
  const minuti = BACKOFF_MIN[Math.min(tentativi, BACKOFF_MIN.length - 1)];
  return new Date(Date.now() + minuti * 60_000).toISOString();
}

export function firmaUscita(corpo: string, segreto: string): string {
  return "sha256=" + crypto.createHmac("sha256", segreto).update(corpo, "utf8").digest("hex");
}

async function spedisci(e: EventoInAttesa): Promise<{ ok: boolean; errore?: string }> {
  const corpo = JSON.stringify({
    id: e.id,
    evento: e.evento,
    dati: JSON.parse(e.payload),
    emesso_at: e.created_at,
    origine: "orion",
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Orion-Evento": e.evento,
  };
  const segreto = decifra(e.segreto_uscita);
  if (segreto) headers["X-Orion-Firma"] = firmaUscita(corpo, segreto);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(e.webhook_uscita, { method: "POST", headers, body: corpo, signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) return { ok: true };
    return { ok: false, errore: `HTTP ${r.status}` };
  } catch (err) {
    return { ok: false, errore: err instanceof Error ? err.message : String(err) };
  }
}

// Consegna gli eventi in attesa del TENANT CORRENTE (va chiamata dentro il
// contesto tenant: fine turno di conversazione, o il giro per-tenant del cron).
export async function consegnaEventiUscita(limite = 25): Promise<{ consegnati: number; falliti: number }> {
  const t = tenantIdCorrente();
  const ora = new Date().toISOString();
  const attesa = db()
    .prepare(
      `SELECT e.id, e.connessione_id, e.evento, e.payload, e.tentativi, e.created_at,
              c.webhook_uscita, c.segreto_uscita
       FROM eventi_uscita e JOIN connessioni c ON c.id = e.connessione_id
       WHERE e.tenant_id = ? AND e.consegnato = 0 AND e.tentativi < ? AND e.prossimo_tentativo <= ?
         AND c.attivo = 1 AND c.webhook_uscita IS NOT NULL
       ORDER BY e.connessione_id, e.id LIMIT ?`
    )
    .all(t, MAX_TENTATIVI, ora, limite) as EventoInAttesa[];

  let consegnati = 0;
  let falliti = 0;
  const canaliFermi = new Set<number>(); // ordine per canale: al primo intoppo, stop

  for (const e of attesa) {
    if (canaliFermi.has(e.connessione_id)) continue;
    const esito = await spedisci(e);
    if (esito.ok) {
      db()
        .prepare("UPDATE eventi_uscita SET consegnato = 1, consegnato_at = ?, ultimo_errore = NULL WHERE id = ?")
        .run(new Date().toISOString(), e.id);
      consegnati++;
    } else {
      db()
        .prepare("UPDATE eventi_uscita SET tentativi = tentativi + 1, prossimo_tentativo = ?, ultimo_errore = ? WHERE id = ?")
        .run(prossimoRitardo(e.tentativi), esito.errore ?? "errore", e.id);
      falliti++;
      canaliFermi.add(e.connessione_id);
    }
  }
  return { consegnati, falliti };
}
