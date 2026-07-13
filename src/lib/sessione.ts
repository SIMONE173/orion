import { cookies } from "next/headers";
import { utenteDaSessione, type Utente } from "./auth";
import { runWithTenant } from "./tenant";

// Ponte fra la sessione (cookie) e il contesto tenant: legge il cookie, trova
// l'utente, ed esegue la funzione "dentro" il suo tenant. Le route lo usano per
// proteggersi e scoprire automaticamente per chi stanno lavorando.

export const COOKIE_SESSIONE = "orion_sess";
export const MAX_AGE_SESSIONE = 30 * 24 * 60 * 60; // 30 giorni
// Dispositivo fidato (2FA "ricordami 30 giorni"): valore = "<utenteId>:<token>".
export const COOKIE_DISPOSITIVO = "orion_dev";
export const MAX_AGE_DISPOSITIVO = 30 * 24 * 60 * 60;

export async function utenteCorrente(): Promise<Utente | null> {
  const store = await cookies();
  return utenteDaSessione(store.get(COOKIE_SESSIONE)?.value);
}

type Risultato<T> = { ok: true; data: T; utente: Utente } | { ok: false };

// Esegue `fn` nel contesto del tenant loggato. Se non c'è sessione → { ok:false }.
export async function conTenant<T>(
  fn: (utente: Utente) => T | Promise<T>
): Promise<Risultato<Awaited<T>>> {
  const utente = await utenteCorrente();
  if (!utente) return { ok: false };
  // Opera sul tenant DATI dell'utente: per un autonomo è il suo stesso id, per un
  // dipendente è il tenant aziendale condiviso (vede clienti/agenda/memoria comuni).
  const data = await runWithTenant(utente.tenant_id, () => fn(utente));
  return { ok: true, data, utente };
}
