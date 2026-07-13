// Validazione dell'indirizzo email: formato serio (non il banale "contiene @")
// + rifiuto dei domini "usa e getta" più noti, usati per aggirare la verifica.
// La prova VERA di esistenza resta il codice via email; questo è il primo filtro.

const RE_EMAIL = /^[^\s@"(),:;<>[\]\\]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const DOMINI_USA_E_GETTA = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwawaymail.com", "yopmail.com", "getnada.com",
  "trashmail.com", "sharklasers.com", "maildrop.cc", "dispostable.com",
  "fakeinbox.com", "mohmal.com", "emailondeck.com", "mailnesia.com",
]);

export function emailValida(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return false;
  if (!RE_EMAIL.test(e)) return false;
  if (e.includes("..")) return false; // punti consecutivi non ammessi
  const dominio = e.split("@")[1];
  if (!dominio || DOMINI_USA_E_GETTA.has(dominio)) return false;
  return true;
}
