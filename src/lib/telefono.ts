import Anthropic from "@anthropic-ai/sdk";
import {
  getProfilo,
  getClienteByTelefono,
  cercaCliente,
  creaCliente,
  listAppuntamenti,
  creaAppuntamento,
  trovaConflitti,
  creaPromemoria,
  creaNota,
  getChiamataBySid,
  apriChiamata,
  aggiornaChiamata,
  logEvento,
  logAudit,
  logCommunication,
  type Chiamata,
} from "./data";
import { inviaMessaggioWhatsApp } from "./whatsapp";

// ──────────────────────────────────────────────────────────────────────────
// CENTRALINO AI: il cervello che risponde al TELEFONO dello studio.
//
// È separato dal cervello conversazionale principale per tre ragioni:
//  1. VELOCITÀ: al telefono nessuno aspetta 10 secondi → modello rapido,
//     niente thinking, pochi strumenti.
//  2. SICUREZZA: chi chiama è un CLIENTE, non il professionista → strumenti
//     RISTRETTI (vede solo gli slot liberi, prenota solo dove è libero,
//     lascia messaggi). Mai dati di altri clienti, mai incassi, mai memoria.
//  3. AI ACT: si presenta SEMPRE come assistente virtuale (disclosure).
//
// La conversazione è persistita in `chiamate.trascrizione` (JSON dei turni),
// così ogni webhook Twilio ricostruisce il contesto. Il flusso Twilio usa
// <Gather input="speech"> in italiano: semplice e robusto.
// ──────────────────────────────────────────────────────────────────────────

const MODEL_TELEFONO = () => (process.env.ORION_MODEL_TELEFONO || "claude-haiku-4-5-20251001").trim();
const MAX_TURNI = 14;
const MAX_GIRI_TOOL = 5;

type Turno = { chi: "cliente" | "orion"; testo: string };

function leggiTurni(ch: Chiamata): Turno[] {
  try {
    return JSON.parse(ch.trascrizione || "[]") as Turno[];
  } catch {
    return [];
  }
}

const p2 = (n: number) => String(n).padStart(2, "0");
function localISO(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

// Slot liberi del giorno (orario 9–19, come l'agenda principale).
function slotDelGiorno(data: string, durataMin: number): { inizio: string; fine: string }[] {
  const appuntamenti = listAppuntamenti(data, data)
    .filter((a) => a.stato !== "cancellato")
    .sort((a, b) => a.inizio.localeCompare(b.inizio));
  const slots: { inizio: string; fine: string }[] = [];
  let cursore = new Date(`${data}T09:00`);
  const fineGiornata = new Date(`${data}T19:00`);
  const adesso = new Date();
  if (cursore < adesso && data === localISO(adesso).slice(0, 10)) {
    // Oggi: non proporre orari già passati (arrotonda alla mezz'ora successiva).
    cursore = new Date(Math.ceil(adesso.getTime() / 1800_000) * 1800_000);
  }
  for (const a of appuntamenti) {
    const ai = new Date(a.inizio);
    if (ai.getTime() - cursore.getTime() >= durataMin * 60000) {
      slots.push({ inizio: localISO(cursore), fine: localISO(ai) });
    }
    const af = new Date(a.fine);
    if (af > cursore) cursore = af;
  }
  if (fineGiornata.getTime() - cursore.getTime() >= durataMin * 60000) {
    slots.push({ inizio: localISO(cursore), fine: localISO(fineGiornata) });
  }
  return slots.slice(0, 6);
}

// ── Strumenti del centralino (ristretti, sicuri) ────────────────────────────

const TOOLS_TELEFONO: Anthropic.Tool[] = [
  {
    name: "disponibilita",
    description:
      "Slot liberi di un giorno (YYYY-MM-DD). Usalo PRIMA di proporre orari: proponi SOLO orari che risultano liberi.",
    input_schema: {
      type: "object",
      properties: { data: { type: "string", description: "YYYY-MM-DD" } },
      required: ["data"],
    },
  },
  {
    name: "prenota",
    description:
      "Prenota l'appuntamento in uno slot LIBERO, solo dopo che il chiamante ha confermato giorno e ora. nome = nome e cognome del chiamante (chiedilo se non lo sai). ora nel formato HH:MM.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        data: { type: "string", description: "YYYY-MM-DD" },
        ora: { type: "string", description: "HH:MM" },
        motivo: { type: "string" },
      },
      required: ["nome", "data", "ora"],
    },
  },
  {
    name: "lascia_messaggio",
    description:
      "Prendi un messaggio per lo studio (richiamata, domanda, urgenza, disdetta, esigenza particolare). Il professionista lo vedrà subito. Usalo ogni volta che non puoi risolvere tu.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        messaggio: { type: "string" },
        urgente: { type: "boolean" },
      },
      required: ["messaggio"],
    },
  },
  {
    name: "fine_chiamata",
    description:
      "Chiudi la chiamata quando la conversazione è conclusa (dopo il saluto). esito = sintesi in una riga di com'è andata.",
    input_schema: {
      type: "object",
      properties: { esito: { type: "string" } },
      required: ["esito"],
    },
  },
];

function systemTelefono(daNumero: string, nomeClienteNoto: string | null): string {
  const profilo = getProfilo();
  const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  const now = new Date();
  const dataOggi = `${GIORNI[now.getDay()]} ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}, ore ${p2(now.getHours())}:${p2(now.getMinutes())} (ISO: ${localISO(now).slice(0, 10)})`;
  const durata = profilo.durata_visita_min ?? 30;

  let memoria = "";
  if (profilo.memoria_operativa) {
    try {
      const m = JSON.parse(profilo.memoria_operativa) as Record<string, string>;
      memoria = Object.entries(m)
        .slice(0, 12)
        .map(([t, d]) => `- ${t}: ${d}`)
        .join("\n");
    } catch {
      /* ignora */
    }
  }

  return `Sei la segretaria telefonica AI dello studio di ${profilo.nome ?? "un professionista"}${
    profilo.professione ? ` (${profilo.professione})` : ""
  }. Stai parlando AL TELEFONO con un cliente/paziente che ha chiamato lo studio${
    nomeClienteNoto ? ` (dal numero risulta: ${nomeClienteNoto}, già cliente)` : ` (numero: ${daNumero}, non riconosciuto)`
  }.

OGGI: ${dataOggi}. Durata standard di un appuntamento: ${durata} minuti.
${memoria ? `\nCOSE DA SAPERE SULLO STUDIO:\n${memoria}\n` : ""}
REGOLE FERREE
- Sei al TELEFONO: risposte BREVISSIME (1-2 frasi parlate), calde e professionali. Mai elenchi, mai più di 3 orari proposti per volta.
- Ti sei GIÀ presentata come assistente virtuale nel saluto: non ripeterlo a ogni turno.
- Il tuo lavoro: prenotare appuntamenti (chiedi nome e motivo, proponi orari LIBERI con lo strumento disponibilita, conferma giorno+ora e poi prenota), oppure prendere un messaggio (lascia_messaggio).
- MAI inventare disponibilità: usa sempre lo strumento disponibilita prima di proporre orari. Se il giorno chiesto è pieno, proponi il primo giorno con posto.
- MAI dare consigli medici/legali/professionali, MAI parlare di altri clienti, prezzi che non conosci o dati dello studio non inclusi qui sopra. In quei casi: prendi un messaggio e rassicura che verrà ricontattato.
- Se il chiamante vuole DISDIRE o SPOSTARE: non cancellare nulla tu — prendi un messaggio (lascia_messaggio) e di' che lo studio lo ricontatterà a breve.
- Se è un'EMERGENZA sanitaria, invita a chiamare il 112.
- Quando la conversazione è finita: saluta con garbo e chiama fine_chiamata con l'esito.
- Rispondi SOLO con il testo da dire a voce (niente markdown, niente parentesi).`;
}

export type RispostaCentralino = { risposta: string; fine: boolean };

// Elabora un turno di conversazione telefonica e restituisce cosa dire.
export async function cervelloTelefono(callSid: string, daNumero: string, testoCliente: string): Promise<RispostaCentralino> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { risposta: "Mi scusi, il servizio non è al momento disponibile. La preghiamo di riprovare più tardi.", fine: true };
  }

  const clienteNoto = getClienteByTelefono(daNumero);
  let chiamata = getChiamataBySid(callSid);
  if (!chiamata) {
    chiamata = apriChiamata({ call_sid: callSid, da_numero: daNumero, cliente_id: clienteNoto?.id ?? null });
  }
  const turni = leggiTurni(chiamata);
  turni.push({ chi: "cliente", testo: testoCliente });

  if (turni.length > MAX_TURNI * 2) {
    const risposta = "La ringrazio per la pazienza: per non farla attendere oltre, lo studio la richiamerà al più presto. Buona giornata!";
    turni.push({ chi: "orion", testo: risposta });
    aggiornaChiamata(chiamata.id, { trascrizione: JSON.stringify(turni), stato: "conclusa", esito: chiamata.esito ?? "Chiamata lunga: passata a richiamo" });
    creaPromemoria({ cliente_id: clienteNoto?.id ?? null, testo: `Richiamare il numero ${daNumero} (chiamata non conclusa dal centralino)`, categoria: "richiamo", scadenza: new Date().toISOString().slice(0, 10) });
    return { risposta, fine: true };
  }

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = turni.map((t) => ({
    role: t.chi === "cliente" ? "user" : "assistant",
    content: t.testo,
  }));

  let fine = false;
  let risposta = "";
  let esitoFinale: string | null = null;
  let appuntamentoId: number | null = null;

  try {
    for (let giro = 0; giro < MAX_GIRI_TOOL; giro++) {
      const resp = await client.messages.create({
        model: MODEL_TELEFONO(),
        max_tokens: 700,
        system: systemTelefono(daNumero, clienteNoto?.nome ?? null),
        tools: TOOLS_TELEFONO,
        messages,
      });
      messages.push({ role: "assistant", content: resp.content });

      if (resp.stop_reason === "tool_use") {
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of resp.content) {
          if (block.type !== "tool_use") continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const input = block.input as any;
          let result: unknown;

          if (block.name === "disponibilita") {
            const durata = getProfilo().durata_visita_min ?? 30;
            result = { slots: slotDelGiorno(String(input.data), durata) };
          } else if (block.name === "prenota") {
            result = await prenotaDaTelefono(daNumero, input, clienteNoto?.id ?? null);
            const r = result as { ok: boolean; appuntamento_id?: number };
            if (r.ok && r.appuntamento_id) appuntamentoId = r.appuntamento_id;
          } else if (block.name === "lascia_messaggio") {
            const nome = input.nome ?? clienteNoto?.nome ?? `numero ${daNumero}`;
            creaPromemoria({
              cliente_id: clienteNoto?.id ?? null,
              testo: `${input.urgente ? "URGENTE — " : ""}Messaggio telefonico da ${nome}: ${input.messaggio}`,
              categoria: "richiamo",
              scadenza: new Date().toISOString().slice(0, 10),
            });
            creaNota({ cliente_id: clienteNoto?.id ?? null, titolo: `Telefonata da ${nome}`, contenuto: String(input.messaggio) });
            logAudit({ canale: "telefono", azione: "messaggio_preso", dettaglio: `${nome}: ${String(input.messaggio).slice(0, 120)}` });
            result = { ok: true };
          } else if (block.name === "fine_chiamata") {
            fine = true;
            esitoFinale = input.esito ?? null;
            result = { ok: true };
          } else {
            result = { ok: false, errore: "strumento sconosciuto" };
          }
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      risposta = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      break;
    }
  } catch (e) {
    console.error("[telefono] errore AI:", e);
    risposta = "Mi scusi, ho avuto un problema tecnico. Lo studio la richiamerà al più presto. Buona giornata!";
    fine = true;
    creaPromemoria({ cliente_id: clienteNoto?.id ?? null, testo: `Richiamare il numero ${daNumero} (errore tecnico del centralino durante la chiamata)`, categoria: "richiamo", scadenza: new Date().toISOString().slice(0, 10) });
  }

  if (!risposta) risposta = "Mi scusi, non ho capito bene. Può ripetere?";
  turni.push({ chi: "orion", testo: risposta });
  aggiornaChiamata(chiamata.id, {
    trascrizione: JSON.stringify(turni),
    ...(fine ? { stato: "conclusa", esito: esitoFinale ?? chiamata.esito ?? null } : {}),
    ...(appuntamentoId ? { appuntamento_id: appuntamentoId } : {}),
    ...(clienteNoto ? { cliente_id: clienteNoto.id } : {}),
  });

  return { risposta, fine };
}

// "martedì 15 luglio alle 15:00" — per i messaggi di conferma.
function quandoParlato(iso: string): string {
  const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  const d = new Date(iso);
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]} alle ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

// Prenotazione dal telefono: SOLO su slot liberi, cliente trovato o creato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function prenotaDaTelefono(daNumero: string, input: any, clienteNotoId: number | null) {
  const profilo = getProfilo();
  const durata = profilo.durata_visita_min ?? 30;
  const data = String(input.data);
  const ora = String(input.ora);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(ora)) {
    return { ok: false, errore: "data od ora non valide" };
  }
  const inizio = `${data}T${ora}`;
  const fine = localISO(new Date(new Date(inizio).getTime() + durata * 60000));

  if (new Date(inizio) < new Date()) return { ok: false, errore: "orario già passato" };

  const conflitti = trovaConflitti(inizio, fine);
  if (conflitti.length) {
    return { ok: false, errore: "orario occupato", alternativa: slotDelGiorno(data, durata).slice(0, 3) };
  }

  // Cliente: riconosciuto dal numero, altrimenti cercato per nome, altrimenti creato.
  let clienteId = clienteNotoId;
  let nomeCliente = String(input.nome ?? "").trim();
  if (!clienteId && nomeCliente) {
    const found = cercaCliente(nomeCliente).filter((c) => c.nome.toLowerCase() === nomeCliente.toLowerCase());
    if (found.length === 1) clienteId = found[0].id;
  }
  if (!clienteId) {
    if (!nomeCliente) return { ok: false, errore: "serve il nome del chiamante" };
    const nuovo = creaCliente({ nome: nomeCliente, telefono: daNumero, note: "Creato dal centralino telefonico AI" });
    clienteId = nuovo.id;
    nomeCliente = nuovo.nome;
  }

  const app = creaAppuntamento({
    cliente_id: clienteId,
    titolo: input.motivo ? String(input.motivo) : "Appuntamento (da telefono)",
    inizio,
    fine,
    stato: "confermato",
    note: "Prenotato dal centralino telefonico AI",
  });
  logEvento({
    tipo: "appuntamento_da_telefono",
    soggetto: nomeCliente || null,
    cliente_id: clienteId,
    descrizione: `Il centralino AI ha prenotato ${nomeCliente} per ${inizio.replace("T", " alle ")}`,
  });
  logAudit({ canale: "telefono", azione: "prenotazione", dettaglio: `${nomeCliente} — ${inizio}` });

  // Conferma scritta via WhatsApp al numero del chiamante (il tocco che nessun
  // centralino-only ha): riepilogo dell'appuntamento e, se lo studio la usa,
  // richiesta della CAPARRA col link di pagamento. Best-effort: se WhatsApp non
  // è configurato non blocca la prenotazione (invio simulato/ignorato).
  try {
    const primoNome = nomeCliente.split(" ")[0] || nomeCliente;
    let msg =
      `Gentile ${primoNome}, confermiamo l'appuntamento di ${quandoParlato(inizio)}` +
      `${profilo.nome ? ` presso lo studio di ${profilo.nome}` : ""}.`;
    if (profilo.caparra_importo && profilo.caparra_importo > 0 && profilo.link_pagamento) {
      msg += ` Per bloccare il posto è prevista una caparra di ${profilo.caparra_importo}€: può versarla qui ${profilo.link_pagamento}`;
    }
    msg += `\n\n(Messaggio automatico dell'assistente dello studio)`;
    const esitoWa = await inviaMessaggioWhatsApp(daNumero, msg);
    if (esitoWa.ok) {
      logCommunication({
        cliente_id: clienteId,
        direzione: "out",
        contenuto: msg,
        stato: esitoWa.simulato ? "simulato" : "inviato",
      });
      if (!esitoWa.simulato) {
        logAudit({ canale: "whatsapp", azione: "conferma_prenotazione_telefono", dettaglio: `${nomeCliente} — ${inizio}` });
      }
    }
  } catch (e) {
    console.error("[telefono] conferma WhatsApp:", e instanceof Error ? e.message : e);
  }

  return { ok: true, appuntamento_id: app.id, inizio, fine };
}

// Saluto iniziale (con disclosure AI Act) e frasi di servizio.
export function salutoIniziale(): string {
  const profilo = getProfilo();
  const studio = profilo.nome ? `Studio ${profilo.nome}` : "il nostro studio";
  return `Buongiorno, ha chiamato ${studio}. Sono l'assistente virtuale dello studio: la informo che parlerà con un'intelligenza artificiale. Posso prenotarle un appuntamento o prendere un messaggio: come posso aiutarla?`;
}
