import { NextRequest, NextResponse } from "next/server";
import {
  promemoriaDaNotificare,
  segnaPromemoriaNotificati,
  compitiDaNotificare,
  segnaCompitiNotificati,
  appuntamentiDaRicordare,
  segnaPromemoriaAppuntamento,
  logCommunication,
  logEvento,
  logAudit,
  utenteIdPerNome,
} from "@/lib/data";
import { inviaMessaggioWhatsApp } from "@/lib/whatsapp";
import { processaScadenzeOfferte } from "@/lib/slots";
import { sincronizzaCalendario } from "@/lib/gcal";
import { inviaPushATutti, inviaPushAUtente } from "@/lib/push";
import { tuttiITenant, eliminaSessioniScadute, eliminaCodiciScaduti } from "@/lib/auth";
import { runWithTenant } from "@/lib/tenant";
import { backupGiornaliero, controllaIntegrita, percorsoBackupOggi } from "@/lib/db";
import { caricaBackupRemoto } from "@/lib/backup-remoto";
import { consegnaEventiUscita } from "@/lib/uscita";
import { sincronizzaEmailArrivi } from "@/lib/posta";
import { pulisciDemoScadute } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

// "2026-07-03T15:00" → "venerdì 3 luglio alle 15:00"
function quandoLeggibile(iso: string): string {
  const d = new Date(iso);
  const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]} alle ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── ANTI NO-SHOW ────────────────────────────────────────────────────────────
// Promemoria WhatsApp automatico prima di ogni appuntamento (finestra ore da
// ORION_REMINDER_ORE, default 24). Il cliente risponde SÌ/NO: il webhook
// WhatsApp interpreta la risposta (conferma / segnala la disdetta).
// Disclosure AI Act: il messaggio si dichiara automatico.
async function promemoriaAppuntamenti(): Promise<number> {
  const ora = new Date().getHours();
  if (ora < 8 || ora >= 21) return 0; // orario di cortesia

  const oreAnticipo = Number(process.env.ORION_REMINDER_ORE || 24);
  const candidati = appuntamentiDaRicordare(oreAnticipo);
  let inviati = 0;

  for (const app of candidati) {
    const nome = app.cliente_nome ?? "";
    const testo =
      `Gentile ${nome}, le ricordiamo l'appuntamento di ${quandoLeggibile(app.inizio)}. ` +
      `Risponda SÌ per confermare, oppure NO se ha bisogno di spostarlo.\n\n` +
      `(Messaggio automatico dell'assistente dello studio)`;

    const esito = await inviaMessaggioWhatsApp(app.cliente_telefono ?? "", testo);
    if (esito.ok) {
      segnaPromemoriaAppuntamento(app.id);
      logCommunication({
        cliente_id: app.cliente_id,
        direzione: "out",
        contenuto: testo,
        stato: esito.simulato ? "simulato" : "inviato",
      });
      logEvento({
        tipo: "promemoria_appuntamento",
        soggetto: nome,
        cliente_id: app.cliente_id,
        descrizione: `Promemoria automatico inviato a ${nome} per ${quandoLeggibile(app.inizio)}`,
      });
      logAudit({
        canale: "cron",
        azione: "promemoria_appuntamento",
        dettaglio: `${nome} — ${app.inizio}${esito.simulato ? " (simulato)" : ""}`,
      });
      inviati++;
    } else {
      logAudit({ canale: "cron", azione: "promemoria_appuntamento", dettaglio: `${nome} — ${app.inizio}`, esito: `errore: ${esito.errore ?? ""}` });
    }
  }
  return inviati;
}

// Eseguito dallo scheduler interno (o da un cron esterno). Protetto da segreto.
// Gira per OGNI tenant: i promemoria e le iscrizioni push sono separati per account.
export async function POST(req: NextRequest) {
  const segreto = process.env.VAPID_PRIVATE_KEY || "";
  if (!segreto || req.headers.get("x-orion-cron") !== segreto) {
    return NextResponse.json({ ok: false, errore: "non autorizzato" }, { status: 403 });
  }

  // Backup giornaliero del DB (idempotente: fa la copia solo la prima volta
  // del giorno). Un DB perso senza backup = studio fermo: non deve succedere.
  // FORTEZZA: prima il controllo di salute (un backup corrotto è una falsa
  // sicurezza), poi la copia locale, poi la copia CIFRATA fuori da Railway.
  // Igiene: via sessioni e codici di verifica scaduti (una volta per giro).
  let demoSmontate = 0;
  try {
    eliminaSessioniScadute();
    eliminaCodiciScaduti();
    // Le demo sono usa-e-getta: scadute le si smonta per intero (dati+account).
    demoSmontate = pulisciDemoScadute();
    if (demoSmontate > 0) console.log(`[cron] demo smontate: ${demoSmontate}`);
  } catch {
    /* mai bloccare il cron per la pulizia */
  }

  let backupFatto = false;
  let backupRemoto: string | null = null;
  const salute = controllaIntegrita();
  if (!salute.ok) {
    console.error(`[cron] ⚠️ INTEGRITÀ DATABASE COMPROMESSA: ${salute.dettaglio} — backup remoto sospeso per non sovrascrivere le copie buone`);
  }
  try {
    const percorso = await backupGiornaliero();
    backupFatto = percorso !== null;
    // AUTO-RIPARANTE: anche se il locale di oggi esisteva già (percorso null),
    // se nel bucket manca la copia di oggi la si carica ora (es. variabili R2
    // configurate a giornata iniziata, o upload fallito al giro precedente).
    const daCaricare = percorso ?? percorsoBackupOggi();
    if (daCaricare && salute.ok) {
      const r = await caricaBackupRemoto(daCaricare, { soloSeManca: true });
      if (r.ok) backupRemoto = r.giaPresente ? "già al sicuro" : (r.caricati ?? []).join(", ");
      else if (r.configurato) console.error("[cron] backup remoto fallito:", r.errore);
    }
  } catch (e) {
    console.error("[cron] backup DB:", e instanceof Error ? e.message : e);
  }

  let totDovuti = 0;
  let totInviati = 0;
  let totPromemoriaApp = 0;

  for (const tenantId of tuttiITenant()) {
    await runWithTenant(tenantId, async () => {
      const dovuti = promemoriaDaNotificare();
      if (!dovuti.length) return;
      totDovuti += dovuti.length;

      const corpo =
        dovuti.length === 1
          ? dovuti[0].testo
          : `${dovuti.length} promemoria: ${dovuti
              .slice(0, 3)
              .map((p) => p.testo)
              .join("; ")}${dovuti.length > 3 ? "…" : ""}`;

      const r = await inviaPushATutti({ titolo: "Promemoria ORION", corpo, url: "/" });
      if (r.inviati > 0) {
        segnaPromemoriaNotificati(dovuti.map((p) => p.id));
        totInviati += r.inviati;
      }
    });

    // Azienda: avvisa dei compiti in ritardo (una volta, finché non si aggiornano).
    // MIRATO: la notifica va all'ASSEGNATARIO (risolto via organico/account);
    // solo i compiti senza un destinatario riconoscibile vanno a tutto il team.
    await runWithTenant(tenantId, async () => {
      const ritardo = compitiDaNotificare();
      if (!ritardo.length) return;
      totDovuti += ritardo.length;

      const perUtente = new Map<number, typeof ritardo>();
      const senzaDestinatario: typeof ritardo = [];
      for (const c of ritardo) {
        const uid = c.assegnatario ? utenteIdPerNome(c.assegnatario) : null;
        if (uid) {
          if (!perUtente.has(uid)) perUtente.set(uid, []);
          perUtente.get(uid)!.push(c);
        } else senzaDestinatario.push(c);
      }

      const corpoDi = (lista: typeof ritardo) =>
        lista.length === 1
          ? `In ritardo: ${lista[0].titolo}${lista[0].assegnatario ? ` (${lista[0].assegnatario})` : ""}`
          : `${lista.length} compiti in ritardo: ${lista.slice(0, 3).map((c) => c.titolo).join("; ")}${lista.length > 3 ? "…" : ""}`;

      const notificati: number[] = [];
      for (const [uid, lista] of perUtente) {
        const r = await inviaPushAUtente(uid, { titolo: "Compiti in ritardo", corpo: corpoDi(lista), url: "/" });
        // Se la persona non ha dispositivi iscritti, il compito resta "da
        // notificare": passa al giro per tutto il team qui sotto.
        if (r.inviati > 0) notificati.push(...lista.map((c) => c.id));
        else senzaDestinatario.push(...lista);
      }
      if (senzaDestinatario.length) {
        const r = await inviaPushATutti({ titolo: "Compiti in ritardo", corpo: corpoDi(senzaDestinatario), url: "/" });
        if (r.inviati > 0) notificati.push(...senzaDestinatario.map((c) => c.id));
      }
      if (notificati.length) {
        segnaCompitiNotificati(notificati);
        totInviati += notificati.length;
      }
    });

    // Anti no-show: promemoria WhatsApp automatici degli appuntamenti imminenti.
    await runWithTenant(tenantId, async () => {
      try {
        totPromemoriaApp += await promemoriaAppuntamenti();
      } catch (e) {
        console.error("[cron] promemoria appuntamenti:", e instanceof Error ? e.message : e);
      }
    });

    // Canale d'uscita: riconsegna al gestionale gli eventi rimasti in attesa
    // (rete di sicurezza coi tentativi a distanza crescente; la partenza
    // immediata avviene a fine turno di conversazione).
    await runWithTenant(tenantId, async () => {
      try {
        await consegnaEventiUscita(50);
      } catch (e) {
        console.error("[cron] canale d'uscita:", e instanceof Error ? e.message : e);
      }
    });

    // Riempi-buchi: le offerte scadute passano al prossimo in lista d'attesa.
    await runWithTenant(tenantId, async () => {
      try {
        await processaScadenzeOfferte();
      } catch (e) {
        console.error("[cron] scadenze offerte:", e instanceof Error ? e.message : e);
      }
    });

    // Google Calendar: riallinea (lapidi → push → pull). Silenzioso se non collegato.
    await runWithTenant(tenantId, async () => {
      try {
        await sincronizzaCalendario();
      } catch (e) {
        console.error("[cron] sync calendario:", e instanceof Error ? e.message : e);
      }
    });

    // Posta email: anche ad app chiusa, le mail IMPORTANTI diventano push
    // («✉️ Mail importante») e trovano l'annuncio pronto alla prossima apertura.
    await runWithTenant(tenantId, async () => {
      try {
        await sincronizzaEmailArrivi();
      } catch (e) {
        console.error("[cron] posta email:", e instanceof Error ? e.message : e);
      }
    });
  }

  return NextResponse.json({
    ok: true,
    dovuti: totDovuti,
    inviati: totInviati,
    promemoriaAppuntamenti: totPromemoriaApp,
    backup: backupFatto,
    backupRemoto,
    demoSmontate,
    integrita: salute.ok ? "ok" : salute.dettaglio,
  });
}
