// ── IL LUCCHETTO DEL LANCIO ──────────────────────────────────────────────────
// ORION è chiuso finché il TITOLARE non decide di aprirlo: niente registrazioni,
// niente accessi, niente chat, niente download. La vetrina resta aperta (e la
// lista beta raccoglie iscritti) e mostra "PRESTO DISPONIBILE" — nessuna data,
// nessuna apertura automatica. Applicato LATO SERVER nei quattro cancelli veri:
// login, registrazione, chat e download.
//
//   APERTO_MANUALE          l'interruttore: si apre SOLO cambiando questo a true
//                           (o mettendo ORION_LANCIO=aperto su Railway)
//   ORION_LANCIO_ECCEZIONI  email che entrano comunque (es. il collaudatore), separate da virgola
//   ORION_LANCIO_CHIAVE     parola d'ordine per scaricare prima (link ?vip=...)
//   ORION_ADMIN_EMAIL       il proprietario: entra sempre
// ──────────────────────────────────────────────────────────────────────────

// L'INTERRUTTORE: niente date, niente conti alla rovescia. Quando il titolare
// dice "apri", questo diventa true (o ORION_LANCIO=aperto in ambiente) e via.
const APERTO_MANUALE = false;

export function lanciato(): boolean {
  if (APERTO_MANUALE) return true;
  return (process.env.ORION_LANCIO || "").trim().toLowerCase() === "aperto";
}

// ── ACCESSI GRATUITI A VITA (regali del titolare) ────────────────────────────
// Account che usano ORION completo GRATIS PER SEMPRE, prima e DOPO il lancio
// (diverso dalle eccezioni del lancio, che valgono solo finché è chiuso). Solo
// questi indirizzi, decisi dal titolare. Si aggiungono qui o via env.
const ACCESSI_GRATIS_PERMANENTI = new Set<string>([
  "luca.lorito07@gmail.com", // amico del fondatore — accesso a vita a tutte le versioni
]);

export function accessoGratuitoPermanente(email?: string | null): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  if (ACCESSI_GRATIS_PERMANENTI.has(e)) return true;
  return (process.env.ORION_ACCESSI_GRATIS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .includes(e);
}

// Chi può entrare anche a lucchetto chiuso: il proprietario + le eccezioni +
// gli accessi gratuiti a vita (così entrano subito, anche prima del lancio).
export function eccezioneLancio(email?: string | null): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  const admin = (process.env.ORION_ADMIN_EMAIL || "").trim().toLowerCase();
  if (admin && e === admin) return true;
  if (accessoGratuitoPermanente(e)) return true;
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
  // quando = "" : la UI mostra "PRESTO DISPONIBILE", senza conto alla rovescia.
  return { lanciato: lanciato(), quando: "" };
}

// Per i messaggi di cortesia: niente date promesse, solo "molto presto".
export function quandoInParole(): string {
  return "molto presto";
}
