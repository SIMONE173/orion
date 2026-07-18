import { db } from "./db";
import { tenantIdCorrente } from "./tenant";
import { emailConfigurato, leggiMessaggiDopoUid, type EmailNuova } from "./email";
import { getClienteByEmail, logCommunication, logEvento, type Comunicazione } from "./data";
import { inviaPushATutti } from "./push";

// ──────────────────────────────────────────────────────────────────────────
// LA POSTA EMAIL CHE SI ANNUNCIA DA SOLA.
// ORION legge i nuovi arrivi dalla casella collegata e li CLASSIFICA:
//   importante → annunciata a voce in app + push («È arrivata una mail da…»)
//   normale    → registrata in silenzio (la trovi quando la cerchi)
//   rumore     → newsletter/promo/automatismi: silenziata e contata nel digest
// Tutto deterministico, in codice: zero crediti AI.
// ──────────────────────────────────────────────────────────────────────────

const T = () => tenantIdCorrente();

export type Importanza = "importante" | "normale" | "rumore";

const RE_MITTENTE_RUMORE =
  /no-?reply|noreply|newsletter|news@|mailer|notifications?@|updates?@|marketing|promo(?:tions?)?@|offers?@|deals?@|info@.*(shop|store)|mailchimp|sendgrid|substack/i;
const RE_OGGETTO_RUMORE =
  /newsletter|sconto|offerta|promo\b|promozion|saldi|black\s*friday|\d{1,2}\s*%|coupon|unsubscribe|disiscriv|iscrizione confermata|conferma iscrizione|webinar gratuito|non perdere|solo per te|ultimi giorni/i;
const RE_OGGETTO_IMPORTANTE =
  /urgent|urgenza|scadenz|fattur|preventiv|contratt|pagament|bonific|appuntament|disdett|disdir|conferma|rinvio|spostare|richiest|problema|reclamo|documentaz|ricetta|referto|pratica|avvocato|tribunale|f24|inps|agenzia delle entrate/i;
const RE_CORPO_RUMORE = /unsubscribe|disiscriviti|cancella l.iscrizione|gestisci le preferenze|se non visualizzi|view in browser/i;

export function classificaEmail(m: {
  daNome: string;
  daIndirizzo: string;
  oggetto: string;
  corpo: string;
  bulk: boolean;
  diCliente: boolean;
}): { importanza: Importanza; motivo: string } {
  // Un cliente in rubrica è SEMPRE importante: è lavoro che parla.
  if (m.diCliente) return { importanza: "importante", motivo: "mittente in rubrica clienti" };

  let punti = 0;
  const motivi: string[] = [];
  if (m.bulk) {
    punti -= 3;
    motivi.push("invio di massa");
  }
  if (RE_MITTENTE_RUMORE.test(m.daIndirizzo)) {
    punti -= 2;
    motivi.push("mittente automatico");
  }
  if (RE_OGGETTO_RUMORE.test(m.oggetto)) {
    punti -= 2;
    motivi.push("oggetto promozionale");
  }
  if (RE_CORPO_RUMORE.test(m.corpo)) {
    punti -= 1;
    motivi.push("corpo da newsletter");
  }
  if (RE_OGGETTO_IMPORTANTE.test(m.oggetto)) {
    punti += 3;
    motivi.push("oggetto di lavoro");
  }
  if (/^(re|r|fwd|i):/i.test(m.oggetto.trim())) {
    punti += 2;
    motivi.push("risposta a un tuo messaggio");
  }
  if (m.daNome && !m.bulk && !RE_MITTENTE_RUMORE.test(m.daIndirizzo)) {
    punti += 1;
    motivi.push("mittente personale");
  }

  if (punti >= 2) return { importanza: "importante", motivo: motivi.join(", ") || "segnali di lavoro" };
  if (punti <= -2) return { importanza: "rumore", motivo: motivi.join(", ") || "posta automatica" };
  return { importanza: "normale", motivo: motivi.join(", ") || "nessun segnale forte" };
}

// Il riassunto parlabile: le prime frasi utili, senza saluti e senza muri di testo.
export function riassuntoBreve(corpo: string, max = 240): string {
  const pulito = corpo
    .replace(/^\s*(gentile|buongiorno|buonasera|salve|ciao|spett\.?le)[^,\n]{0,60}[,\n]/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (pulito.length <= max) return pulito;
  const taglio = pulito.slice(0, max);
  const ultimo = Math.max(taglio.lastIndexOf(". "), taglio.lastIndexOf("! "), taglio.lastIndexOf("? "));
  return (ultimo > 80 ? taglio.slice(0, ultimo + 1) : taglio) + "…";
}

// ── Stato di sincronizzazione (per tenant) ───────────────────────────────────

type StatoSync = {
  tenant_id: number;
  uidvalidity: string | null;
  ultimo_uid: number;
  ultimo_controllo: string | null;
  silenziate_oggi: number;
  giorno: string | null;
};

function statoSync(): StatoSync | undefined {
  return db().prepare("SELECT * FROM email_sync WHERE tenant_id = ?").get(T()) as StatoSync | undefined;
}

function salvaSync(s: Partial<StatoSync>) {
  const ora = new Date().toISOString();
  // La riga nasce con i valori di partenza; poi si aggiornano SOLO i campi passati.
  db().prepare("INSERT OR IGNORE INTO email_sync (tenant_id, ultimo_uid, silenziate_oggi, updated_at) VALUES (?, 0, 0, ?)").run(T(), ora);
  db()
    .prepare(
      `UPDATE email_sync SET
         uidvalidity = COALESCE(?, uidvalidity),
         ultimo_uid = COALESCE(?, ultimo_uid),
         ultimo_controllo = COALESCE(?, ultimo_controllo),
         silenziate_oggi = COALESCE(?, silenziate_oggi),
         giorno = COALESCE(?, giorno),
         updated_at = ?
       WHERE tenant_id = ?`
    )
    .run(
      s.uidvalidity ?? null,
      s.ultimo_uid ?? null,
      s.ultimo_controllo ?? null,
      s.silenziate_oggi ?? null,
      s.giorno ?? null,
      ora,
      T()
    );
}

// Il digest del silenzio: quante mail inutili ORION ti ha tolto di torno oggi.
export function silenziateOggi(): number {
  const s = statoSync();
  const oggi = new Date().toISOString().slice(0, 10);
  return s && s.giorno === oggi ? s.silenziate_oggi : 0;
}

// ── L'ingresso unico di una mail (sync vero e simulatore passano da qui) ─────

export function processaEmailInArrivo(m: EmailNuova): Comunicazione {
  const cliente = m.daIndirizzo ? getClienteByEmail(m.daIndirizzo) : undefined;
  const { importanza, motivo } = classificaEmail({
    daNome: m.daNome,
    daIndirizzo: m.daIndirizzo,
    oggetto: m.oggetto,
    corpo: m.corpo,
    bulk: m.bulk,
    diCliente: Boolean(cliente),
  });
  const chi = cliente?.nome || m.daNome || m.daIndirizzo || "mittente sconosciuto";

  const com = logCommunication({
    cliente_id: cliente?.id ?? null,
    direzione: "in",
    canale: "email",
    tipo: "email",
    contenuto: m.corpo || null,
    oggetto: m.oggetto,
    mittente: m.daIndirizzo || null,
    importanza,
    stato: "ricevuto",
    letto: importanza === "importante" ? 0 : 1, // si annunciano SOLO le importanti
  });

  if (importanza === "importante") {
    logEvento({
      tipo: "email_importante",
      soggetto: chi,
      cliente_id: cliente?.id ?? null,
      descrizione: `Mail importante da ${chi}: «${m.oggetto}» (${motivo})`,
    });
    void inviaPushATutti({
      titolo: "✉️ Mail importante",
      corpo: `${chi}: ${m.oggetto}`.slice(0, 110),
      url: "/app",
    }).catch(() => {});
  } else if (importanza === "rumore") {
    const oggi = new Date().toISOString().slice(0, 10);
    const s = statoSync();
    salvaSync({ silenziate_oggi: (s?.giorno === oggi ? s.silenziate_oggi : 0) + 1, giorno: oggi });
  }
  return com;
}

// ── La sincronizzazione (chiamata dal sondaggio dell'app e dal cron) ─────────

// Legge i NUOVI arrivi dalla casella e li processa. Con freno: non più di un
// controllo IMAP al minuto per tenant (il sondaggio dell'app gira ogni 25s).
export async function sincronizzaEmailArrivi(opts?: { forza?: boolean }): Promise<{ ok: boolean; nuove: number; errore?: string }> {
  if (!emailConfigurato()) return { ok: true, nuove: 0 };
  const s = statoSync();
  if (!opts?.forza && s?.ultimo_controllo && Date.now() - new Date(s.ultimo_controllo).getTime() < 60_000) {
    return { ok: true, nuove: 0 };
  }
  salvaSync({ ultimo_controllo: new Date().toISOString() });

  const r = await leggiMessaggiDopoUid(s?.ultimo_uid ?? 0, 10);
  if (!r.ok) return { ok: false, nuove: 0, errore: r.errore };

  const baseUid = Number(r.uidProssimo ?? 1) - 1;
  // Prima volta (o cassetta ricreata): si parte DA ORA, senza ripescare
  // l'intero archivio — si annunciano solo le mail che arrivano da qui in poi.
  if (!s || !s.ultimo_uid || (s.uidvalidity && r.uidvalidity && s.uidvalidity !== r.uidvalidity)) {
    salvaSync({ uidvalidity: r.uidvalidity ?? null, ultimo_uid: baseUid });
    return { ok: true, nuove: 0 };
  }

  let nuove = 0;
  for (const m of r.messaggi) {
    try {
      processaEmailInArrivo(m);
      nuove++;
    } catch (e) {
      console.error("[posta] processa email:", e);
    }
  }
  salvaSync({ uidvalidity: r.uidvalidity ?? null, ultimo_uid: Math.max(baseUid, s.ultimo_uid) });
  return { ok: true, nuove };
}
