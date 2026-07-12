import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, dispatch, type TurnoContext } from "./tools";
import { buildSystem, DIRETTIVA_AVVIO } from "./system";
import { consolidaSeNecessario } from "./memoria";
import { suggerimentiPerViste, estraiSuggerimenti } from "./suggerimenti";
import { salvaMessaggio } from "../data";
import type { Vista, Azione, RisultatoConversazione } from "./views";
import type { Utente } from "../auth";

// ── ROUTING DEI MODELLI (economia senza perdere intelligenza) ───────────────
// Le richieste OPERATIVE brevi ("mostrami l'agenda", "segna Rossi alle 15",
// "quanto ho incassato") non hanno bisogno del modello massimo: le gestisce il
// modello RAPIDO (più veloce e ~10-20 volte più economico). Tutto il resto —
// onboarding, analisi, scrittura, immagini, richieste lunghe o ambigue — resta
// sul modello PIENO. Override: ORION_MODEL, ORION_MODEL_RAPIDO, ORION_ROUTING=off.
const MODEL = (process.env.ORION_MODEL || "claude-opus-4-8").trim();
const MODEL_RAPIDO = (process.env.ORION_MODEL_RAPIDO || "claude-haiku-4-5-20251001").trim();
const ROUTING_ATTIVO = (process.env.ORION_ROUTING || "on").trim() !== "off";

const RE_OPERATIVA =
  /\b(agenda|appuntament|prenot|fissa|segna|sposta|disdic|conferma|slot|liber[oi]|mostra|apri|chiudi|cliente|clienti|scheda|incass|pagament|fattur|promemoria|ricorda(mi)?|nota|note|whatsapp|messagg|email|posta|chiam|briefing|oggi|domani|settimana|attesa|documenti|profilo|calendario)\b/i;

function scegliModello(storico: MessaggioStorico[], avvio: boolean, allegato?: Allegato, onboarding = true): string {
  if (!ROUTING_ATTIVO) return MODEL;
  if (avvio || allegato || !onboarding) return MODEL; // briefing/colloquio/vision: piena potenza
  const ultimo = storico.length ? storico[storico.length - 1] : null;
  if (!ultimo || ultimo.role !== "user") return MODEL;
  const testo = ultimo.content.trim();
  if (testo.length > 160) return MODEL; // richieste articolate → modello pieno
  return RE_OPERATIVA.test(testo) ? MODEL_RAPIDO : MODEL;
}

const MAX_GIRI = 8;
// La conversazione è persistita per intero, ma al modello inviamo solo una
// FINESTRA recente (i ricordi più vecchi vivono nella memoria viva / diario /
// tool `ricorda`): contesto limitato = costi sotto controllo.
const MAX_STORICO = 40;

export type MessaggioStorico = { role: "user" | "assistant"; content: string };
export type Allegato = { dataUrl: string };

export async function runConversation(
  storico: MessaggioStorico[],
  avvio = false,
  allegato?: Allegato,
  desktop = false,
  utente?: Utente
): Promise<RisultatoConversazione> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      testo:
        "Non riesco a connettermi al mio cervello: manca la chiave API. Aggiungi ANTHROPIC_API_KEY nel file .env.local e riavvia.",
      viste: [],
      errore: "no_key",
    };
  }

  const client = new Anthropic({ apiKey });

  // All'avvio della giornata: consolidazione PIGRA della memoria (1 sola volta/
  // giorno, modello economico) → aggiorna diario e intuizioni PRIMA di costruire
  // il prompt, così il saluto sa già "dove eravamo rimasti".
  if (avvio) {
    try {
      await consolidaSeNecessario();
    } catch {
      /* la consolidazione non deve mai bloccare l'avvio */
    }
  }

  // Persisti il nuovo messaggio dell'utente (continuità + memoria). L'ultimo turno
  // dello storico è l'input appena inviato; la DIRETTIVA_AVVIO di sistema non si salva.
  if (!avvio && storico.length && storico[storico.length - 1].role === "user") {
    salvaMessaggio("user", storico[storico.length - 1].content, utente?.id);
  }

  const system = buildSystem(desktop, utente);

  const messages: Anthropic.MessageParam[] = storico.slice(-MAX_STORICO).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  if (avvio) {
    messages.push({ role: "user", content: DIRETTIVA_AVVIO });
  }
  // La prima riga della conversazione deve essere dell'utente.
  if (messages.length === 0 || messages[0].role !== "user") {
    messages.unshift({ role: "user", content: DIRETTIVA_AVVIO });
  }

  // Se c'è un'immagine (fotocamera/documento), la collego all'ultimo turno utente per la lettura (vision).
  const ctx: TurnoContext = { utenteId: utente?.id };
  if (allegato?.dataUrl) {
    const m = allegato.dataUrl.match(/^data:(.+?);base64,(.*)$/);
    if (m) {
      ctx.allegato = { dataUrl: allegato.dataUrl };
      const mediaType = m[1];
      const base64 = m[2];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          const testo = typeof messages[i].content === "string" ? (messages[i].content as string) : "";
          messages[i] = {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: base64,
                },
              },
              { type: "text", text: testo || "Digitalizza questo documento e proponi dove archiviarlo." },
            ],
          };
          break;
        }
      }
    }
  }

  const viste: Vista[] = [];
  const azioni: Azione[] = [];
  let testo = "";

  const onboardingCompleto = utente ? utente.onboarding_completo === 1 : true;
  const modello = scegliModello(storico, avvio, allegato, onboardingCompleto);
  const usaThinking = modello === MODEL; // il rapido risponde diretto (velocità)

  // PROMPT CACHING, parte due. Il blocco FISSO (106 strumenti + sistema
  // stabile, ~28k token) è già a cache dentro buildSystem. Qui si aggiunge il
  // breakpoint MOBILE sull'ultimo messaggio: nei giri di tool e nei turni
  // successivi la conversazione già letta (coi tool result, che pesano) si
  // riusa dal cache invece di essere ripagata per intero a ogni chiamata.
  const conCacheSullaCoda = (msgs: Anthropic.MessageParam[]): Anthropic.MessageParam[] =>
    msgs.map((m, i) => {
      if (i !== msgs.length - 1) return m;
      // Ultimo messaggio: breakpoint sull'ultimo blocco (solo tipi che lo
      // supportano; una stringa diventa blocco testo).
      if (typeof m.content === "string") {
        if (!m.content) return m;
        return { ...m, content: [{ type: "text" as const, text: m.content, cache_control: { type: "ephemeral" as const } }] };
      }
      return {
        ...m,
        content: m.content.map((b, j) =>
          j === m.content.length - 1 && (b.type === "text" || b.type === "tool_result" || b.type === "tool_use")
            ? { ...b, cache_control: { type: "ephemeral" as const } }
            : b
        ),
      };
    });

  // Contabilità del turno: token reali spesi (per giro e totali). Torna al
  // chiamante: osservabilità dei costi in produzione e negli stress test.
  const consumo = { input: 0, output: 0, cacheScrittura: 0, cacheLettura: 0, chiamate: 0 };

  try {
    for (let giro = 0; giro < MAX_GIRI; giro++) {
      const resp = await client.messages.create({
        model: modello,
        max_tokens: 16000,
        // Priorità all'INTELLIGENZA sul modello pieno: thinking adattivo.
        ...(usaThinking ? { thinking: { type: "adaptive" as const } } : {}),
        system,
        tools: TOOLS,
        messages: conCacheSullaCoda(messages),
      });
      consumo.chiamate++;
      consumo.input += resp.usage.input_tokens;
      consumo.output += resp.usage.output_tokens;
      consumo.cacheScrittura += resp.usage.cache_creation_input_tokens ?? 0;
      consumo.cacheLettura += resp.usage.cache_read_input_tokens ?? 0;

      // Conserva l'intero contenuto (inclusi i blocchi thinking firmati) nella storia.
      messages.push({ role: "assistant", content: resp.content });

      if (resp.stop_reason === "tool_use") {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of resp.content) {
          if (block.type === "tool_use") {
            const { result, vista, azione } = await dispatch(block.name, block.input, ctx);
            if (vista) viste.push(vista);
            if (azione) azioni.push(azione);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // Fine turno: raccogli il testo da leggere ad alta voce.
      testo = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }
  } catch (e) {
    console.error("[ORION] errore API:", e);
    let errore: RisultatoConversazione["errore"] = "api_error";
    let testo = "Ho avuto un problema a elaborare la richiesta. Riprova tra un momento.";
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();

    if (e instanceof Anthropic.AuthenticationError) {
      errore = "auth";
      testo = "La chiave API non è valida. Controlla ANTHROPIC_API_KEY nel file .env.local.";
    } else if (
      msg.includes("credit balance") ||
      msg.includes("billing") ||
      msg.includes("insufficient")
    ) {
      errore = "credito";
      testo =
        "Il credito del tuo account Anthropic è esaurito. Ricarica i crediti su console.anthropic.com per usare ORION.";
    } else if (e instanceof Anthropic.RateLimitError) {
      errore = "rate_limit";
      testo = "Troppe richieste in poco tempo. Riprova tra qualche secondo.";
    } else if (e instanceof Anthropic.APIError && (e.status === 401 || e.status === 403)) {
      errore = "auth";
      testo =
        "Problema di autorizzazione con l'API. Verifica la chiave e che l'account abbia accesso al modello.";
    }

    return { testo, viste, errore, consumo };
  }

  // CANALE D'USCITA: le modifiche fatte in questo turno (appuntamenti, clienti)
  // partono SUBITO verso il gestionale del cliente, senza far aspettare la
  // risposta (fire-and-forget; il cron è la rete di sicurezza con i ritentativi).
  void import("../uscita")
    .then((u) => u.consegnaEventiUscita(10))
    .catch(() => {});

  // Estrai le pillole dalla riga [suggerimenti: ...] e PULISCI il testo prima di
  // salvarlo/leggerlo: il parlato non deve mai contenere quella riga.
  const { testoPulito, suggerimenti: suggerimentiAI } = estraiSuggerimenti(testo);
  testo = testoPulito;

  // Persisti la risposta di ORION (continuità tra sessioni + richiamo esatto).
  if (testo) salvaMessaggio("assistant", testo, utente?.id);

  // Dedup per tipo (l'ultima vista di ogni tipo vince), mantenendo l'ordine d'apparizione.
  const perTipo = new Map<string, Vista>();
  for (const v of viste) perTipo.set(v.tipo, v);
  const visteDedup = Array.from(perTipo.values());

  // Suggerimenti: mai durante l'onboarding; altrimenti quelli del modello, con
  // fallback deterministico all'ultima vista aperta se il modello non li ha dati.
  let suggerimenti = onboardingCompleto ? suggerimentiAI : [];
  if (onboardingCompleto && !suggerimenti.length) suggerimenti = suggerimentiPerViste(visteDedup);

  return { testo, viste: visteDedup, azioni, suggerimenti: suggerimenti.length ? suggerimenti : undefined, consumo };
}
