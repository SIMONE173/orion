// ──────────────────────────────────────────────────────────────────────────
// Limitatore di frequenza IN MEMORIA (per processo). Protegge login/signup da
// forza bruta e da script impazziti. Sufficiente per il deploy attuale a
// istanza singola; con più istanze andrà spostato su uno store condiviso.
// ──────────────────────────────────────────────────────────────────────────

type Voce = { conteggio: number; resetAt: number };
const store = new Map<string, Voce>();
const MAX_VOCI = 10_000;

function pulisci(now: number) {
  if (store.size < MAX_VOCI) return;
  for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
}

// true = richiesta consentita; false = superato il limite nella finestra.
export function rateLimit(
  chiave: string,
  max: number,
  finestraMs: number
): { ok: boolean; riprovaTraSec: number } {
  const now = Date.now();
  pulisci(now);
  const v = store.get(chiave);
  if (!v || v.resetAt <= now) {
    store.set(chiave, { conteggio: 1, resetAt: now + finestraMs });
    return { ok: true, riprovaTraSec: 0 };
  }
  v.conteggio++;
  if (v.conteggio > max) {
    return { ok: false, riprovaTraSec: Math.max(1, Math.ceil((v.resetAt - now) / 1000)) };
  }
  return { ok: true, riprovaTraSec: 0 };
}

// IP del chiamante (dietro proxy: primo valore di x-forwarded-for).
export function ipRichiesta(req: { headers: Headers }): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "ip-sconosciuto";
}
