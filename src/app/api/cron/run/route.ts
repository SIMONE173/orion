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
} from "@/lib/data";
import { inviaMessaggioWhatsApp } from "@/lib/whatsapp";
import { processaScadenzeOfferte } from "@/lib/slots";
import { sincronizzaCalendario } from "@/lib/gcal";
import { inviaPushATutti } from "@/lib/push";
import { tuttiITenant } from "@/lib/auth";
import { runWithTenant } from "@/lib/tenant";

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
    await runWithTenant(tenantId, async () => {
      const ritardo = compitiDaNotificare();
      if (!ritardo.length) return;
      totDovuti += ritardo.length;
      const corpo =
        ritardo.length === 1
          ? `In ritardo: ${ritardo[0].titolo}${ritardo[0].assegnatario ? ` (${ritardo[0].assegnatario})` : ""}`
          : `${ritardo.length} compiti in ritardo: ${ritardo.slice(0, 3).map((c) => c.titolo).join("; ")}${ritardo.length > 3 ? "…" : ""}`;
      const r = await inviaPushATutti({ titolo: "Compiti in ritardo", corpo, url: "/" });
      if (r.inviati > 0) {
        segnaCompitiNotificati(ritardo.map((c) => c.id));
        totInviati += r.inviati;
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
  }

  return NextResponse.json({ ok: true, dovuti: totDovuti, inviati: totInviati, promemoriaAppuntamenti: totPromemoriaApp });
}
