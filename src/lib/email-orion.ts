import { inviaEmail } from "./mailer";
import { PIANI, type Piano } from "./prezzi";

// ──────────────────────────────────────────────────────────────────────────
// LE EMAIL TRANSAZIONALI DI ORION — belle come il sito, con il piè legale.
// Quattro momenti: benvenuto (account confermato), founding member (beta),
// abbonamento attivato, ricevuta di ogni addebito mensile.
// Regola d'oro: l'invio è "fire-and-forget" — un problema di posta non deve
// MAI rompere il flusso che l'ha generata (registrazione, webhook, ecc.).
// Design da client di posta: tabelle + stili inline (niente CSS moderno).
// ──────────────────────────────────────────────────────────────────────────

const SITO = "https://orionvision.it";
const CONTATTO = "simone07intake@gmail.com";

// Una riga etichetta/valore dentro la scheda dati.
function riga(etichetta: string, valore: string): string {
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.07);color:#8fa9b8;font-size:13px">${etichetta}</td>
    <td align="right" style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.07);color:#eaf6fb;font-size:13.5px;font-weight:600">${valore}</td>
  </tr>`;
}

// La scheda dati (bordo morbido, vetro scuro).
function scheda(righe: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;background:rgba(255,255,255,0.04);border:1px solid rgba(56,232,255,0.18);border-radius:14px">
    <tr><td style="padding:8px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${righe}</table></td></tr>
  </table>`;
}

// Il bottone d'azione.
function bottone(testo: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto 6px"><tr>
    <td style="background:#2fd9f7;border-radius:12px">
      <a href="${url}" style="display:inline-block;padding:13px 30px;color:#06121a;font-size:15px;font-weight:700;text-decoration:none">${testo}</a>
    </td>
  </tr></table>`;
}

// Il badge founding member.
function badgeFounder(sconto: number): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;background:rgba(245,198,107,0.08);border:1px solid rgba(245,198,107,0.35);border-radius:12px">
    <tr><td style="padding:11px 16px;color:#f5deae;font-size:13px;font-weight:700">🏆 Founding member — sconto del ${sconto}% a vita, agganciato al tuo account</td></tr>
  </table>`;
}

// L'abito di ogni email: intestazione col nucleo, corpo, piè LEGALE.
function vestito(opts: { titolo: string; anteprima: string; corpo: string; motivo: string; notaLegaleExtra?: string }): string {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#04070c">
  <!-- anteprima nella lista della posta -->
  <div style="display:none;max-height:0;overflow:hidden">${opts.anteprima}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04070c">
    <tr><td align="center" style="padding:34px 14px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

        <!-- Intestazione: il nucleo e il nome -->
        <tr><td align="center" style="padding-bottom:24px">
          <div style="width:52px;height:52px;border-radius:999px;margin:0 auto 12px;background:radial-gradient(circle at 32% 28%, #7ff0ff, #0d3346);border:2px solid rgba(56,232,255,0.55)"></div>
          <div style="letter-spacing:0.38em;font-weight:700;color:#38e8ff;font-size:15px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">ORION</div>
        </td></tr>

        <!-- Il foglio -->
        <tr><td style="background:#0a121b;border:1px solid rgba(56,232,255,0.16);border-radius:20px;padding:34px 30px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
          <h1 style="margin:0 0 12px;color:#f2fbff;font-size:21px;line-height:1.35">${opts.titolo}</h1>
          ${opts.corpo}
        </td></tr>

        <!-- Piè LEGALE -->
        <tr><td style="padding:26px 18px 8px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
          <p style="margin:0 0 10px;color:#54687a;font-size:11.5px;line-height:1.65;text-align:center">
            Ricevi questa email perché ${opts.motivo}. Questa è una comunicazione di servizio relativa al tuo rapporto con ORION,
            non una email promozionale.${opts.notaLegaleExtra ? " " + opts.notaLegaleExtra : ""}
          </p>
          <p style="margin:0 0 10px;color:#54687a;font-size:11.5px;line-height:1.65;text-align:center">
            I pagamenti sono gestiti in sicurezza da Stripe; ORION non conserva i dati della tua carta.
            Trattiamo i tuoi dati come descritto nella Privacy Policy; puoi esercitare i tuoi diritti scrivendo a
            <a href="mailto:${CONTATTO}" style="color:#6fa5bd">${CONTATTO}</a>.
          </p>
          <p style="margin:0;color:#41525f;font-size:11.5px;line-height:1.8;text-align:center">
            © 2026 ORION — Il Sistema Operativo Conversazionale ·
            <a href="${SITO}" style="color:#6fa5bd;text-decoration:none">orionvision.it</a><br>
            <a href="${SITO}/privacy" style="color:#6fa5bd">Privacy Policy</a> ·
            <a href="${SITO}/termini" style="color:#6fa5bd">Termini di servizio</a> ·
            <a href="mailto:${CONTATTO}" style="color:#6fa5bd">Contatti</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

const dataIT = (d: Date) =>
  new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }).format(d);
const euro = (cent: number) => `€${(cent / 100).toFixed(2).replace(".", ",")}`;

// ── 1. BENVENUTO: l'account è confermato ────────────────────────────────────
export async function inviaEmailBenvenuto(email: string, nome?: string | null): Promise<boolean> {
  const chi = nome ? `, ${nome}` : "";
  const corpo = `
    <p style="margin:0 0 14px;color:#a9c2d0;font-size:14.5px;line-height:1.65">
      Benvenuto${chi}! Il tuo account è <strong style="color:#7ff0c9">attivo e confermato</strong>.
      Da questo momento hai una segreteria operativa che lavora con te, 24 ore su 24 — a voce.
    </p>
    ${scheda(
      riga("Account", email) +
      riga("Creato il", dataIT(new Date())) +
      riga("Accesso", "Web + app per Mac e Windows")
    )}
    <p style="margin:16px 0 0;color:#a9c2d0;font-size:14px;line-height:1.65">
      Il primo passo è la <strong style="color:#eaf6fb">Chiamata 0</strong>: ORION si presenta e ti chiede che lavoro fai
      e come lavori. Da lì in poi, gli parli e lui fa.
    </p>
    ${bottone("Entra in ORION", `${SITO}/app`)}
  `;
  const testo = `Benvenuto${chi}! Il tuo account ORION (${email}) è attivo e confermato. Entra: ${SITO}/app`;
  return inviaEmail(
    email,
    "Benvenuto in ORION — il tuo account è attivo",
    testo,
    vestito({
      titolo: "Il tuo ORION è pronto.",
      anteprima: "Account confermato: la tua segreteria operativa è al tuo fianco.",
      corpo,
      motivo: `hai creato un account su orionvision.it con l'indirizzo ${email}`,
    })
  );
}

// ── 2. FOUNDING MEMBER: iscrizione alla beta ────────────────────────────────
export async function inviaEmailBeta(email: string, sconto: number, apertura: string): Promise<boolean> {
  const corpo = `
    <p style="margin:0 0 14px;color:#a9c2d0;font-size:14.5px;line-height:1.65">
      Il tuo posto è <strong style="color:#7ff0c9">riservato</strong>. Sei tra i primi a credere in ORION —
      e questo, per noi, conta per sempre.
    </p>
    ${badgeFounder(sconto)}
    ${scheda(
      riga("Il tuo posto", "Founding member") +
      riga("Sconto a vita", `−${sconto}% su ogni rinnovo, per sempre`) +
      riga("Apertura", apertura) +
      riga("Email registrata", email)
    )}
    <p style="margin:16px 0 0;color:#a9c2d0;font-size:14px;line-height:1.65">
      Non devi fare nulla: lo sconto è <strong style="color:#eaf6fb">agganciato a questa email</strong> e si applica da solo
      quando attiverai l'abbonamento. Ti scriviamo noi appena le porte si aprono.
    </p>
    <p style="margin:12px 0 0;color:#6d8496;font-size:12.5px;line-height:1.6">
      Un consiglio: quando creerai il tuo account ORION, usa questa stessa email — è la tua tessera founding member.
    </p>
    ${bottone("Scopri cosa sa fare", SITO)}
  `;
  const testo = `Il tuo posto founding member è riservato: sconto del ${sconto}% a vita, agganciato a ${email}. ORION apre il ${apertura}. ${SITO}`;
  return inviaEmail(
    email,
    `Sei dentro: founding member di ORION 🏆`,
    testo,
    vestito({
      titolo: "Posto riservato. Benvenuto tra i primi.",
      anteprima: `Founding member confermato: sconto del ${sconto}% a vita.`,
      corpo,
      motivo: `ti sei iscritto alla lista beta su orionvision.it con l'indirizzo ${email}`,
    })
  );
}

// ── 3. ABBONAMENTO ATTIVATO (prova avviata) ─────────────────────────────────
export async function inviaEmailAbbonamento(
  email: string,
  opts: { piano: Piano; giorniProva: number; fineProva: Date | null; founder: boolean; sconto: number }
): Promise<boolean> {
  const p = PIANI[opts.piano];
  const prezzoPieno = p.prezzo;
  const prezzoReale = opts.founder ? Math.round(prezzoPieno * (100 - opts.sconto)) / 100 : prezzoPieno;
  const bella = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(2).replace(".", ","));
  const prezzoTxt = opts.founder
    ? `<span style="text-decoration:line-through;color:#5f7482">€${prezzoPieno}</span>&nbsp; €${bella(prezzoReale)} al mese`
    : `€${prezzoPieno} al mese`;
  const corpo = `
    <p style="margin:0 0 14px;color:#a9c2d0;font-size:14.5px;line-height:1.65">
      Il tuo abbonamento è <strong style="color:#7ff0c9">attivo</strong>${opts.giorniProva > 0 ? ` e parte con <strong style="color:#eaf6fb">${opts.giorniProva} giorni di prova gratuita</strong>` : ""}.
      ${opts.giorniProva > 0 ? "Durante la prova puoi disdire quando vuoi e non paghi nulla." : ""}
    </p>
    ${opts.founder ? badgeFounder(opts.sconto) : ""}
    ${scheda(
      riga("Piano", `${p.nome} — ${p.sottotitolo}`) +
      riga("Prezzo", prezzoTxt) +
      (opts.fineProva ? riga("Prova gratuita fino al", dataIT(opts.fineProva)) : "") +
      (opts.fineProva ? riga("Primo addebito", `${dataIT(opts.fineProva)} (se non disdici prima)`) : "") +
      riga("Intestato a", email)
    )}
    <p style="margin:16px 0 0;color:#a9c2d0;font-size:14px;line-height:1.65">
      Gestire tutto è semplice: dentro ORION apri <strong style="color:#eaf6fb">Abbonamento</strong> (o diglielo a voce:
      «voglio gestire l'abbonamento») per cambiare carta, piano, o <strong style="color:#eaf6fb">disdire in qualsiasi momento</strong> — nessun vincolo.
    </p>
    ${bottone("Entra in ORION", `${SITO}/app`)}
  `;
  const testo = `Abbonamento ${p.nome} attivo${opts.giorniProva ? ` con ${opts.giorniProva} giorni di prova` : ""}. ${opts.founder ? `Founding member: -${opts.sconto}% a vita. ` : ""}Gestisci o disdici quando vuoi da ORION → Abbonamento. ${SITO}/app`;
  return inviaEmail(
    email,
    opts.giorniProva > 0 ? "La tua prova di ORION è iniziata ✓" : "Il tuo abbonamento ORION è attivo ✓",
    testo,
    vestito({
      titolo: opts.giorniProva > 0 ? "Prova avviata. ORION è tuo." : "Abbonamento attivo. ORION è tuo.",
      anteprima: `Piano ${p.nome}${opts.giorniProva ? ` · ${opts.giorniProva} giorni di prova gratuita` : ""} · disdici quando vuoi`,
      corpo,
      motivo: `hai attivato un abbonamento su orionvision.it con l'indirizzo ${email}`,
      notaLegaleExtra:
        "Puoi disdire in qualsiasi momento da ORION → Abbonamento: l'accesso resta attivo fino alla fine del periodo già pagato, senza ulteriori addebiti.",
    })
  );
}

// ── 4. RICEVUTA: ogni addebito mensile ──────────────────────────────────────
export async function inviaEmailRicevuta(
  email: string,
  opts: { importoCent: number; descrizione: string; dal: Date | null; al: Date | null; numero: string | null; urlRicevuta: string | null }
): Promise<boolean> {
  const corpo = `
    <p style="margin:0 0 14px;color:#a9c2d0;font-size:14.5px;line-height:1.65">
      Grazie! Abbiamo ricevuto il tuo pagamento: ORION resta al tuo fianco.
      Questa è la tua ricevuta.
    </p>
    ${scheda(
      riga("Importo", `<span style="font-size:16px;color:#7ff0c9">${euro(opts.importoCent)}</span>`) +
      riga("Descrizione", opts.descrizione) +
      (opts.dal && opts.al ? riga("Periodo coperto", `${dataIT(opts.dal)} → ${dataIT(opts.al)}`) : "") +
      (opts.al ? riga("Prossimo rinnovo", dataIT(opts.al)) : "") +
      (opts.numero ? riga("Numero documento", opts.numero) : "") +
      riga("Pagata il", dataIT(new Date())) +
      riga("Intestata a", email)
    )}
    <p style="margin:16px 0 0;color:#6d8496;font-size:12.5px;line-height:1.6">
      Per cambiare carta o piano, o per disdire (in qualsiasi momento, senza vincoli): dentro ORION apri
      <strong style="color:#a9c2d0">Abbonamento</strong>, o dillo a voce.
    </p>
    ${opts.urlRicevuta ? bottone("Vedi la ricevuta completa (PDF)", opts.urlRicevuta) : bottone("Entra in ORION", `${SITO}/app`)}
  `;
  const testo = `Pagamento ricevuto: ${euro(opts.importoCent)} — ${opts.descrizione}. ${opts.urlRicevuta ? `Ricevuta: ${opts.urlRicevuta}` : ""}`;
  return inviaEmail(
    email,
    `Ricevuta di pagamento · ${euro(opts.importoCent)} — ORION`,
    testo,
    vestito({
      titolo: "Pagamento ricevuto. Grazie.",
      anteprima: `${euro(opts.importoCent)} · ${opts.descrizione}`,
      corpo,
      motivo: `hai un abbonamento attivo su orionvision.it intestato a ${email}`,
      notaLegaleExtra:
        "L'addebito ricorrente è quello autorizzato all'attivazione dell'abbonamento; puoi interromperlo in qualsiasi momento disdicendo da ORION → Abbonamento.",
    })
  );
}
