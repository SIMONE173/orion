import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, dispatch, type TurnoContext } from "./tools";
import { buildSystem, DIRETTIVA_AVVIO } from "./system";
import type { Vista, Azione, RisultatoConversazione } from "./views";

const MODEL = "claude-opus-4-8";
const MAX_GIRI = 8;

export type MessaggioStorico = { role: "user" | "assistant"; content: string };
export type Allegato = { dataUrl: string };

export async function runConversation(
  storico: MessaggioStorico[],
  avvio = false,
  allegato?: Allegato
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
  const system = buildSystem();

  const messages: Anthropic.MessageParam[] = storico.map((m) => ({
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
  const ctx: TurnoContext = {};
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

  try {
    for (let giro = 0; giro < MAX_GIRI; giro++) {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system,
        tools: TOOLS,
        messages,
      });

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

    return { testo, viste, errore };
  }

  // Dedup per tipo (l'ultima vista di ogni tipo vince), mantenendo l'ordine d'apparizione.
  const perTipo = new Map<string, Vista>();
  for (const v of viste) perTipo.set(v.tipo, v);

  return { testo, viste: Array.from(perTipo.values()), azioni };
}
