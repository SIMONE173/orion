import { AsyncLocalStorage } from "node:async_hooks";

// Contesto della richiesta: tiene l'id del professionista (tenant) loggato.
// Così ogni funzione di accesso ai dati sa per chi sta lavorando, senza che
// dobbiamo passare il tenant a mano a ogni chiamata.
const store = new AsyncLocalStorage<{ tenantId: number }>();

export function runWithTenant<T>(tenantId: number, fn: () => T): T {
  return store.run({ tenantId }, fn);
}

export function tenantIdCorrente(): number {
  const s = store.getStore();
  if (!s) throw new Error("Nessun tenant nel contesto della richiesta");
  return s.tenantId;
}

// Variante che non lancia (per codice che può girare senza tenant, es. cron).
export function tenantIdOpzionale(): number | null {
  return store.getStore()?.tenantId ?? null;
}
