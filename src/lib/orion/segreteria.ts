import Anthropic from "@anthropic-ai/sdk";
import {
  getProfilo,
  getRisponditore,
  appuntamentiFuturiDiCliente,
  getAppuntamento,
  aggiornaStatoAppuntamento,
  spostaAppuntamento,
  creaAppuntamento,
  trovaConflitti,
  creaPromemoria,
  listComunicazioni,
  logCommunication,
  logEvento,
  logAudit,
  prossimoAppuntamentoDiCliente,
  type Cliente,
} from "../data";
import { inviaMessaggioWhatsApp } from "../whatsapp";
import { inviaPushATutti } from "../push";
import { avviaOffertaSlot, processaRispostaOfferta } from "../slots";
import { rateLimit } from "../ratelimit";
import { tenantIdCorrente } from "../tenant";
import { registraConsumo } from "../consumi";

// ──────────────────────────────────────────────────────────────────────────
// LA SEGRETERIA NOTTURNA — ORION risponde AI CLIENTI su WhatsApp, H24.
// Vive sul server: il PC del professionista può essere spento.
//
// Tre livelli (configurabili a voce con lo strumento configura_risponditore):
//   spenta     → solo i copioni storici (conferme ai promemoria, offerte slot)
//   assistita  → ORION risponde ai clienti (informazioni, prende messaggi),
//                ma NON tocca mai l'agenda: richiami + push al professionista
//   autopilota → in più DISDICE, SPOSTA e PRENOTA davvero negli slot liberi;
//                il buco liberato viene offerto DA SOLO alla lista d'attesa
//
// Regole d'acciaio: mai inventare esiti (VERITÀ OPERATIVA), mai parlare di
// altri clienti, mai consigli medici/legali/prezzi non noti, sempre firmato
// come assistente automatico. Ogni azione → push al professionista + giornale.
// Motore: il modello RAPIDO (centesimi), consumi registrati come tutto il resto.
// ──────────────────────────────────────────────────────────────────────────

const MODEL_RAPIDO = (process.env.ORION_MODEL_RAPIDO || "claude-haiku-4-5-20251001").trim();
const FIRMA = "\n\n(Messaggio automatico dell'assistente dello studio)";
const MAX_GIRI = 4;

// ── I copioni deterministici (gratis e certi), estratti dal webhook ──────────

const RE_SI = /^\s*(s[iì]\b|s[iì][!. ]|ok\b|okay\b|va bene|confermo|confermat|perfetto|certo|ci sar[oò])/i;
const RE_NO = /^\s*(no\b|non posso|non riesco|disdic|disdett|annull|rinvi|spost|cambio|impossibilitat)/i;

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export function quandoLeggibile(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]} alle ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Conferma scriptata (SÌ a un promemoria) e — solo a segreteria SPENTA —
// richiamo scriptato per i NO. Torna true se ha gestito lei il messaggio.
async function copionePromemoria(cliente: Cliente, testo: string, livello: string): Promise<boolean> {
  const si = RE_SI.test(testo);
  const no = !si && RE_NO.test(testo);
  if (!si && !no) return false;

  const app = prossimoAppuntamentoDiCliente(cliente.id);
  if (!app || !app.promemoria_inviato) return false;
  const oreAllInizio = (new Date(app.inizio).getTime() - Date.now()) / 3600_000;
  if (oreAllInizio < 0 || oreAllInizio > 72) return false;

  if (si) {
    if (app.stato !== "confermato") aggiornaStatoAppuntamento(app.id, "confermato");
    logEvento({
      tipo: "appuntamento_confermato",
      soggetto: cliente.nome,
      cliente_id: cliente.id,
      descrizione: `${cliente.nome} ha confermato via WhatsApp l'appuntamento di ${quandoLeggibile(app.inizio)}`,
    });
    logAudit({ canale: "whatsapp", azione: "conferma_automatica", dettaglio: `${cliente.nome} — ${app.inizio}` });
    await rispondi(cliente.telefono ?? "", cliente.id, `Grazie ${cliente.nome.split(" ")[0]}, l'appuntamento di ${quandoLeggibile(app.inizio)} è confermato. A presto!`);
    return true;
  }

  // NO: a segreteria spenta si fa il copione storico (richiamo + push);
  // con la segreteria accesa lascia fare all'AI (che può anche agire).
  if (livello !== "spenta") return false;
  creaPromemoria({
    cliente_id: cliente.id,
    testo: `Richiamare ${cliente.nome}: chiede di spostare/disdire l'appuntamento di ${quandoLeggibile(app.inizio)}`,
    categoria: "richiamo",
    scadenza: new Date().toISOString().slice(0, 10),
  });
  logEvento({
    tipo: "richiesta_disdetta",
    soggetto: cliente.nome,
    cliente_id: cliente.id,
    descrizione: `${cliente.nome} ha chiesto via WhatsApp di spostare/disdire l'appuntamento di ${quandoLeggibile(app.inizio)}`,
  });
  logAudit({ canale: "whatsapp", azione: "richiesta_disdetta", dettaglio: `${cliente.nome} — ${app.inizio}` });
  await inviaPushATutti({
    titolo: "Richiesta di spostamento",
    corpo: `${cliente.nome} vuole spostare l'appuntamento di ${quandoLeggibile(app.inizio)}. C'è un promemoria di richiamo.`,
    url: "/",
  });
  await rispondi(cliente.telefono ?? "", cliente.id, `Capito ${cliente.nome.split(" ")[0]}, avviso subito lo studio: la ricontatteremo per trovare un nuovo orario.`);
  return true;
}

// Invio + registro di ogni risposta in uscita (firma inclusa).
async function rispondi(telefono: string, clienteId: number | null, testo: string): Promise<void> {
  if (!telefono || !testo) return;
  const esito = await inviaMessaggioWhatsApp(telefono, testo + FIRMA);
  if (esito.ok) {
    logCommunication({ cliente_id: clienteId, direzione: "out", contenuto: testo + FIRMA, stato: esito.simulato ? "simulato" : "inviato" });
  }
}

// ── Gli attrezzi (pochi e sicuri) della segreteria AI ────────────────────────

function durataStandardMin(): number {
  const p = getProfilo();
  const d = Number(p?.durata_visita_min || 0);
  return d >= 10 && d <= 240 ? d : 30;
}

// Slot liberi di un giorno (9→19, passo = durata standard, senza conflitti).
function slotLiberiDelGiorno(giorno: string, max = 6): string[] {
  const durata = durataStandardMin();
  const liberi: string[] = [];
  for (let h = 9 * 60; h + durata <= 19 * 60 && liberi.length < max; h += durata) {
    const inizio = new Date(`${giorno}T${String(Math.floor(h / 60)).padStart(2, "0")}:${String(h % 60).padStart(2, "0")}:00`);
    if (inizio.getTime() < Date.now()) continue;
    const fine = new Date(inizio.getTime() + durata * 60_000);
    if (trovaConflitti(inizio.toISOString(), fine.toISOString()).length === 0) liberi.push(inizio.toISOString());
  }
  return liberi;
}

function pushAlProfessionista(titolo: string, corpo: string): void {
  void inviaPushATutti({ titolo, corpo, url: "/" }).catch(() => {});
}

// L'appuntamento è del cliente ed è nel futuro? (guardrail per le azioni)
function appuntamentoDelCliente(id: number, clienteId: number) {
  const app = getAppuntamento(id);
  if (!app || app.cliente_id !== clienteId) return null;
  if (new Date(app.inizio).getTime() < Date.now()) return null;
  return app;
}

// ── LA SEGRETERIA AI ─────────────────────────────────────────────────────────

const TOOLS_SEGRETERIA: Anthropic.Tool[] = [
  {
    name: "agenda",
    description: "I prossimi appuntamenti di QUESTO cliente (id, quando, stato). Usalo prima di parlare di appuntamenti.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "slot_liberi",
    description: "Gli orari liberi dello studio in un giorno (per proporre alternative). giorno = YYYY-MM-DD.",
    input_schema: { type: "object", properties: { giorno: { type: "string" } }, required: ["giorno"] },
  },
  {
    name: "prendi_messaggio",
    description:
      "Lascia un messaggio/richiamo al professionista (con push immediata). Usalo per tutto ciò che non puoi o non devi gestire da solo: richieste fuori dal tuo raggio, casi dubbi, clienti da richiamare.",
    input_schema: { type: "object", properties: { messaggio: { type: "string" } }, required: ["messaggio"] },
  },
  {
    name: "disdici",
    description: "SOLO IN AUTOPILOTA. Disdice DAVVERO un appuntamento del cliente (l'ora liberata viene offerta da sola alla lista d'attesa). Serve l'id preso da 'agenda'.",
    input_schema: { type: "object", properties: { appuntamento_id: { type: "number" } }, required: ["appuntamento_id"] },
  },
  {
    name: "sposta",
    description: "SOLO IN AUTOPILOTA. Sposta DAVVERO un appuntamento del cliente a un nuovo orario (ISO, es. 2026-07-18T15:00:00). Se l'orario è occupato ricevi le alternative libere.",
    input_schema: {
      type: "object",
      properties: { appuntamento_id: { type: "number" }, nuovo_inizio: { type: "string" } },
      required: ["appuntamento_id", "nuovo_inizio"],
    },
  },
  {
    name: "prenota",
    description: "SOLO IN AUTOPILOTA. Prenota DAVVERO un nuovo appuntamento per questo cliente a un orario libero (ISO). Se occupato ricevi le alternative.",
    input_schema: { type: "object", properties: { inizio: { type: "string" } }, required: ["inizio"] },
  },
];

function sistemaSegreteria(cliente: Cliente | undefined, livello: string): string {
  const p = getProfilo();
  const studio = [p?.nome ? `il professionista si chiama ${p.nome}` : null, p?.professione ? `professione: ${p.professione}` : null]
    .filter(Boolean)
    .join("; ");
  const chi = cliente
    ? `Stai parlando con ${cliente.nome}, cliente dello studio.`
    : `Stai parlando con un numero NON in anagrafica: sii cortese, chiedi il nome e prendi un messaggio con prendi_messaggio (includi il fatto che è un numero nuovo). NON prenotare per numeri sconosciuti.`;
  const poteri =
    livello === "autopilota"
      ? `Hai l'AUTOPILOTA: puoi davvero disdire, spostare e prenotare (strumenti disdici/sposta/prenota) — solo per appuntamenti di QUESTO cliente e solo in orari liberi. Conferma sempre nel messaggio ciò che HAI FATTO.`
      : `Sei in modalità ASSISTITA: NON puoi toccare l'agenda. Per disdette/spostamenti/prenotazioni rassicura il cliente che lo studio lo ricontatterà e usa prendi_messaggio. Gli strumenti disdici/sposta/prenota NON sono disponibili.`;
  const oggi = new Date();
  return `Sei la segreteria automatica di uno studio professionale italiano (${studio || "studio professionale"}). Rispondi ai CLIENTI su WhatsApp, di giorno e di notte, mentre il professionista non c'è.
${chi}
Oggi è ${GIORNI[oggi.getDay()]} ${oggi.getDate()} ${MESI[oggi.getMonth()]} ${oggi.getFullYear()}, ore ${String(oggi.getHours()).padStart(2, "0")}:${String(oggi.getMinutes()).padStart(2, "0")}.
${poteri}
REGOLE D'ACCIAIO:
- VERITÀ OPERATIVA: di' che una cosa è fatta SOLO se lo strumento l'ha confermata (ok:true) in questo scambio. Mai fingere.
- Brevità e calore: 1-3 frasi, tono cortese e umano, dai del lei. NON aggiungere firme (viene aggiunta in automatico).
- MAI: parlare di altri clienti o dei loro dati; dare consigli medici/legali/tecnici; inventare prezzi, orari di apertura o informazioni che non conosci → in quei casi: "riferisco allo studio" + prendi_messaggio.
- Se il cliente chiede qualcosa fuori dal tuo raggio o insiste per parlare col professionista: prendi_messaggio e rassicura.
- Se non c'è nulla da rispondere di utile (spam, vocali che non puoi ascoltare), rispondi con una frase che invita a scrivere il motivo del contatto.`;
}

export type EsitoSegreteria = { risposta: string | null; azioni: string[] };

// Il cervello della segreteria: risponde al cliente, con o senza poteri d'agenda.
export async function segreteriaAI(cliente: Cliente | undefined, telefono: string, livello: "assistita" | "autopilota"): Promise<EsitoSegreteria> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { risposta: null, azioni: [] };
  const client = new Anthropic({ apiKey });
  const azioni: string[] = [];

  // Contesto: gli ultimi scambi con QUESTO cliente (il messaggio corrente è già registrato).
  const storia = cliente
    ? listComunicazioni(cliente.id)
        .slice(-12) // gli ultimi scambi (la lista è in ordine cronologico)
        .filter((c) => (c.contenuto ?? "").trim())
        .map((c) => ({ role: c.direzione === "in" ? ("user" as const) : ("assistant" as const), content: (c.contenuto ?? "").replace(FIRMA, "") }))
    : [];
  // Compatta i turni consecutivi dello stesso ruolo e garantisci l'apertura utente.
  const messages: Anthropic.MessageParam[] = [];
  for (const m of storia) {
    const ultimo = messages[messages.length - 1];
    if (ultimo && ultimo.role === m.role && typeof ultimo.content === "string") ultimo.content = `${ultimo.content}\n${m.content}`;
    else messages.push({ role: m.role, content: m.content });
  }
  if (!messages.length || messages[0].role !== "user") messages.unshift({ role: "user", content: "(nuovo contatto)" });
  if (messages[messages.length - 1].role !== "user") messages.push({ role: "user", content: "(continua)" });

  const system = sistemaSegreteria(cliente, livello);
  const consumo = { input: 0, output: 0, cacheScrittura: 0, cacheLettura: 0, chiamate: 0 };
  let testo = "";

  try {
    for (let giro = 0; giro < MAX_GIRI; giro++) {
      const resp = await client.messages.create({
        model: MODEL_RAPIDO,
        max_tokens: 600,
        system,
        tools: TOOLS_SEGRETERIA,
        messages,
      });
      consumo.chiamate++;
      consumo.input += resp.usage.input_tokens;
      consumo.output += resp.usage.output_tokens;
      consumo.cacheScrittura += resp.usage.cache_creation_input_tokens ?? 0;
      consumo.cacheLettura += resp.usage.cache_read_input_tokens ?? 0;
      messages.push({ role: "assistant", content: resp.content });

      if (resp.stop_reason === "tool_use") {
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of resp.content) {
          if (block.type !== "tool_use") continue;
          const out = eseguiAttrezzo(block.name, block.input, cliente, telefono, livello, azioni);
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      testo = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }
  } catch (e) {
    console.error("[segreteria] errore AI:", e instanceof Error ? e.message : e);
    return { risposta: null, azioni };
  } finally {
    try {
      registraConsumo(tenantIdCorrente(), MODEL_RAPIDO, consumo);
    } catch {
      /* fuori contesto: pazienza */
    }
  }
  return { risposta: testo || null, azioni };
}

// Gli attrezzi, con i guardrail dentro (il modello non può scavalcarli).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eseguiAttrezzo(nome: string, input: any, cliente: Cliente | undefined, telefono: string, livello: string, azioni: string[]): unknown {
  try {
    switch (nome) {
      case "agenda": {
        if (!cliente) return { appuntamenti: [] };
        return {
          appuntamenti: appuntamentiFuturiDiCliente(cliente.id).map((a) => ({ id: a.id, quando: quandoLeggibile(a.inizio), inizio: a.inizio, stato: a.stato, titolo: a.titolo })),
        };
      }
      case "slot_liberi": {
        const giorno = String(input?.giorno ?? "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) return { ok: false, errore: "giorno non valido (YYYY-MM-DD)" };
        return { liberi: slotLiberiDelGiorno(giorno).map((iso) => ({ inizio: iso, quando: quandoLeggibile(iso) })) };
      }
      case "prendi_messaggio": {
        const msg = String(input?.messaggio ?? "").slice(0, 400);
        if (!msg) return { ok: false, errore: "messaggio vuoto" };
        const chi = cliente ? cliente.nome : `numero nuovo ${telefono}`;
        creaPromemoria({
          cliente_id: cliente?.id ?? null,
          testo: `Richiamare ${chi}: ${msg}`,
          categoria: "richiamo",
          scadenza: new Date().toISOString().slice(0, 10),
        });
        logEvento({ tipo: "messaggio_cliente", soggetto: chi, cliente_id: cliente?.id ?? null, descrizione: `Segreteria: ${chi} — ${msg}` });
        pushAlProfessionista("Messaggio dalla segreteria", `${chi}: ${msg}`);
        azioni.push("messaggio");
        return { ok: true };
      }
      case "disdici": {
        if (livello !== "autopilota" || !cliente) return { ok: false, errore: "non permesso in questa modalità" };
        const app = appuntamentoDelCliente(Number(input?.appuntamento_id), cliente.id);
        if (!app) return { ok: false, errore: "appuntamento non trovato o non di questo cliente" };
        aggiornaStatoAppuntamento(app.id, "disdetto");
        logEvento({ tipo: "disdetta_automatica", soggetto: cliente.nome, cliente_id: cliente.id, descrizione: `Segreteria: disdetto l'appuntamento di ${quandoLeggibile(app.inizio)} su richiesta di ${cliente.nome} (WhatsApp)` });
        logAudit({ canale: "whatsapp", azione: "disdetta_autopilota", dettaglio: `${cliente.nome} — ${app.inizio}` });
        pushAlProfessionista("Disdetta gestita da ORION", `${cliente.nome} ha disdetto ${quandoLeggibile(app.inizio)}. Sto offrendo l'ora alla lista d'attesa.`);
        void avviaOffertaSlot(app.inizio, app.fine).catch(() => {});
        azioni.push("disdetta");
        return { ok: true, disdetto: quandoLeggibile(app.inizio) };
      }
      case "sposta": {
        if (livello !== "autopilota" || !cliente) return { ok: false, errore: "non permesso in questa modalità" };
        const app = appuntamentoDelCliente(Number(input?.appuntamento_id), cliente.id);
        if (!app) return { ok: false, errore: "appuntamento non trovato o non di questo cliente" };
        const inizio = new Date(String(input?.nuovo_inizio ?? ""));
        if (isNaN(inizio.getTime()) || inizio.getTime() < Date.now()) return { ok: false, errore: "orario non valido o nel passato" };
        const durata = new Date(app.fine).getTime() - new Date(app.inizio).getTime();
        const fine = new Date(inizio.getTime() + durata);
        if (trovaConflitti(inizio.toISOString(), fine.toISOString(), app.id).length > 0) {
          return { ok: false, occupato: true, alternative: slotLiberiDelGiorno(inizio.toISOString().slice(0, 10)).map((iso) => quandoLeggibile(iso)) };
        }
        const vecchio = { inizio: app.inizio, fine: app.fine };
        spostaAppuntamento(app.id, inizio.toISOString(), fine.toISOString());
        aggiornaStatoAppuntamento(app.id, "confermato");
        logEvento({ tipo: "spostamento_automatico", soggetto: cliente.nome, cliente_id: cliente.id, descrizione: `Segreteria: spostato ${cliente.nome} da ${quandoLeggibile(vecchio.inizio)} a ${quandoLeggibile(inizio.toISOString())} (WhatsApp)` });
        logAudit({ canale: "whatsapp", azione: "spostamento_autopilota", dettaglio: `${cliente.nome} → ${inizio.toISOString()}` });
        pushAlProfessionista("Spostamento gestito da ORION", `${cliente.nome}: da ${quandoLeggibile(vecchio.inizio)} a ${quandoLeggibile(inizio.toISOString())}. Offro la vecchia ora alla lista d'attesa.`);
        void avviaOffertaSlot(vecchio.inizio, vecchio.fine).catch(() => {});
        azioni.push("spostamento");
        return { ok: true, nuovo: quandoLeggibile(inizio.toISOString()) };
      }
      case "prenota": {
        if (livello !== "autopilota" || !cliente) return { ok: false, errore: "non permesso in questa modalità" };
        const inizio = new Date(String(input?.inizio ?? ""));
        if (isNaN(inizio.getTime()) || inizio.getTime() < Date.now()) return { ok: false, errore: "orario non valido o nel passato" };
        const fine = new Date(inizio.getTime() + durataStandardMin() * 60_000);
        if (trovaConflitti(inizio.toISOString(), fine.toISOString()).length > 0) {
          return { ok: false, occupato: true, alternative: slotLiberiDelGiorno(inizio.toISOString().slice(0, 10)).map((iso) => quandoLeggibile(iso)) };
        }
        creaAppuntamento({ cliente_id: cliente.id, titolo: cliente.nome, inizio: inizio.toISOString(), fine: fine.toISOString(), stato: "confermato" });
        logEvento({ tipo: "prenotazione_automatica", soggetto: cliente.nome, cliente_id: cliente.id, descrizione: `Segreteria: prenotato ${cliente.nome} per ${quandoLeggibile(inizio.toISOString())} (WhatsApp)` });
        logAudit({ canale: "whatsapp", azione: "prenotazione_autopilota", dettaglio: `${cliente.nome} — ${inizio.toISOString()}` });
        pushAlProfessionista("Prenotazione gestita da ORION", `${cliente.nome}: nuovo appuntamento ${quandoLeggibile(inizio.toISOString())}.`);
        azioni.push("prenotazione");
        return { ok: true, prenotato: quandoLeggibile(inizio.toISOString()) };
      }
      default:
        return { ok: false, errore: `attrezzo sconosciuto: ${nome}` };
    }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) };
  }
}

// ── L'INGRESSO UNICO (webhook e simulatore passano da qui) ───────────────────
// Ordine: offerte di slot (primo sì vince) → conferma scriptata → segreteria AI
// (se accesa). Torna true se il cliente ha ricevuto una risposta.
export async function gestisciMessaggioCliente(opts: { cliente: Cliente | undefined; telefono: string; testo: string }): Promise<boolean> {
  const { cliente, telefono, testo } = opts;
  if (!testo?.trim()) return false;

  const livello = getRisponditore();

  if (cliente) {
    try {
      if (await processaRispostaOfferta(cliente, testo)) return true;
      if (await copionePromemoria(cliente, testo, livello)) return true;
    } catch (e) {
      console.error("[segreteria] copioni:", e);
    }
  }

  if (livello === "spenta") return false;

  // Anti ping-pong: mai più di 6 risposte l'ora per numero.
  try {
    if (!rateLimit(`segreteria:${tenantIdCorrente()}:${telefono}`, 6, 60 * 60 * 1000).ok) return false;
  } catch {
    return false;
  }

  const esito = await segreteriaAI(cliente, telefono, livello);

  // Se l'agenda è cambiata, la modifica parte SUBITO verso Google Calendar e
  // il gestionale (fire-and-forget; il cron resta la rete di sicurezza).
  if (esito.azioni.some((a) => a === "disdetta" || a === "spostamento" || a === "prenotazione")) {
    void import("../uscita").then((u) => u.consegnaEventiUscita(10)).catch(() => {});
    void import("../gcal").then((g) => g.sincronizzaCalendario()).catch(() => {});
  }

  if (!esito.risposta) return false;
  await rispondi(telefono, cliente?.id ?? null, esito.risposta);
  return true;
}
