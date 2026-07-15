// ── IL LUCCHETTO DEL LANCIO ──────────────────────────────────────────────────
// Fino alla data del lancio, ORION è chiuso: niente registrazioni, niente
// accessi, niente chat, niente download. La vetrina resta aperta (e la lista
// beta raccoglie iscritti). Applicato LATO SERVER nei quattro cancelli veri:
// login, registrazione, chat e download — la UI mostra solo il conto alla
// rovescia, ma la serratura è qui.
//
//   ORION_LANCIO            data/ora di apertura (default: 21/7/2026 19:00 italiane)
//   ORION_LANCIO_ECCEZIONI  email che entrano comunque (es. il collaudatore), separate da virgola
//   ORION_LANCIO_CHIAVE     parola d'ordine per scaricare prima (link ?vip=...)
//   ORION_ADMIN_EMAIL       il proprietario: entra sempre
// ──────────────────────────────────────────────────────────────────────────

export const DATA_LANCIO = new Date(
  (process.env.ORION_LANCIO || "2026-07-21T19:00:00+02:00").trim()
);

export function lanciato(): boolean {
  return Date.now() >= DATA_LANCIO.getTime();
}

// Chi può entrare anche a lucchetto chiuso: il proprietario + le eccezioni.
export function eccezioneLancio(email?: string | null): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  const admin = (process.env.ORION_ADMIN_EMAIL || "").trim().toLowerCase();
  if (admin && e === admin) return true;
  return (process.env.ORION_LANCIO_ECCEZIONI || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .includes(e);
}

// Parola d'ordine per il download anticipato (per il collaudo pre-lancio).
export function chiaveVipValida(chiave?: string | null): boolean {
  const attesa = (process.env.ORION_LANCIO_CHIAVE || "").trim();
  return Boolean(attesa && chiave && chiave.trim() === attesa);
}

export function statoLancio(): { lanciato: boolean; quando: string } {
  return { lanciato: lanciato(), quando: DATA_LANCIO.toISOString() };
}

// "21 luglio alle 19:00" — per i messaggi di cortesia, nell'ora italiana.
export function quandoInParole(): string {
  const g = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" }).format(DATA_LANCIO);
  const o = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(DATA_LANCIO);
  return `${g} alle ${o}`;
}
