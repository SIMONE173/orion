import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { conTenant } from "@/lib/sessione";
import { registraConsumo } from "@/lib/consumi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── LA MANO DI ORION · il cervello ───────────────────────────────────────────
// Un passo alla volta: riceve lo screenshot dello schermo dell'utente,
// l'obiettivo e la storia dei passi già fatti → decide UNA sola prossima
// azione (clic / scrivi / tasto / attendi / fatto / aiuto). Il ciclo vive nel
// client Desktop (che ha gli occhi e le mani); qui c'è solo la decisione.

const MODEL_MANO = (process.env.ORION_MODEL_MANO || process.env.ORION_MODEL || "claude-opus-4-8").trim();
const MAX_PASSI = 25;

const TOOL_MANO: Anthropic.Tool = {
  name: "prossima_azione",
  description: "La prossima singola azione da compiere sullo schermo.",
  input_schema: {
    type: "object",
    properties: {
      tipo: { type: "string", enum: ["clic", "doppio_clic", "scrivi", "tasto", "attendi", "fatto", "aiuto"] },
      x: { type: "number", description: "coordinata X nello spazio dell'IMMAGINE (per clic/doppio_clic)" },
      y: { type: "number", description: "coordinata Y nello spazio dell'IMMAGINE" },
      testo: { type: "string", description: "il testo da digitare (per 'scrivi')" },
      tasto: {
        type: "string",
        description: "per 'tasto': invio | tab | esc | backspace | canc | su | giu | sinistra | destra | pagina_su | pagina_giu | cmd+lettera | ctrl+lettera",
      },
      spiegazione: { type: "string", description: "cosa stai facendo, in 5-10 parole semplici (viene mostrata all'utente)" },
      esito_finale: { type: "string", description: "SOLO per 'fatto' o 'aiuto': cosa è stato fatto/verificato, o la domanda per l'utente" },
    },
    required: ["tipo", "spiegazione"],
  },
};

function sistemaMano(piattaforma: string): string {
  const mod = piattaforma === "darwin" ? "cmd" : "ctrl";
  return `Sei LA MANO DI ORION: operi l'interfaccia del software del professionista al posto suo, come farebbe una segretaria esperta e prudente. Vedi lo SCREENSHOT dello schermo, conosci l'OBIETTIVO e i passi già fatti. Decidi UNA SOLA prossima azione per volta con lo strumento prossima_azione.

REGOLE D'ACCIAIO:
- Clicca ESATTAMENTE al centro dell'elemento che vuoi colpire (coordinate nello spazio dell'immagine che vedi).
- Prima di scrivere in un campo: clicca il campo. Per SOSTITUIRE un valore esistente: clicca il campo, poi tasto "${mod}+a", poi scrivi il nuovo valore.
- Dopo un'azione lo schermo che vedrai al prossimo passo è aggiornato: VERIFICA sempre che l'azione precedente abbia avuto effetto prima di proseguire.
- Se una schermata sta caricando usa 'attendi'.
- MAI: chiudere finestre o app, usare menu non necessari, toccare dati che non c'entrano con l'obiettivo, salvare/confermare dialoghi distruttivi non richiesti.
- Se non trovi ciò che serve, se lo schermo non corrisponde alle attese, o se l'azione è ambigua/rischiosa → tipo 'aiuto' con una domanda CHIARA per l'utente (esito_finale). Meglio una domanda che un pasticcio.
- Quando l'obiettivo è COMPLETO e lo VEDI confermato sullo schermo (incluso l'eventuale salvataggio richiesto dall'obiettivo) → tipo 'fatto' con esito_finale che racconta cosa hai fatto. VERITÀ OPERATIVA: mai dire fatto senza averlo visto.
- spiegazione: sempre, brevissima, in italiano semplice ("apro la scheda di Rossi", "scrivo 20 nel campo chili").`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, errore: "no_key" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const obiettivo = String(body?.obiettivo ?? "").slice(0, 600);
  const screenshot = String(body?.screenshot ?? "");
  const piattaforma = body?.piattaforma === "win32" ? "win32" : "darwin";
  const passi: { spiegazione?: string; esito?: string }[] = Array.isArray(body?.passi) ? body.passi.slice(-MAX_PASSI) : [];
  const m = screenshot.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
  if (!obiettivo || !m) return NextResponse.json({ ok: false, errore: "obiettivo o screenshot mancanti" }, { status: 400 });
  if (passi.length >= MAX_PASSI) {
    return NextResponse.json({
      ok: true,
      azione: { tipo: "aiuto", spiegazione: "troppi passi", esito_finale: "Ci sto mettendo troppo: meglio finire insieme. Cosa vedi di strano sullo schermo?" },
    });
  }

  const r = await conTenant(async (u) => {
    const client = new Anthropic({ apiKey });
    const storia =
      passi.length > 0
        ? `\n\nPASSI GIÀ FATTI (in ordine):\n${passi.map((p, i) => `${i + 1}. ${p.spiegazione ?? "?"}${p.esito ? ` → ${p.esito}` : ""}`).join("\n")}`
        : "";
    const resp = await client.messages.create({
      model: MODEL_MANO,
      max_tokens: 350,
      system: sistemaMano(piattaforma),
      tools: [TOOL_MANO],
      tool_choice: { type: "tool", name: "prossima_azione" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: m[1] as "image/png" | "image/jpeg", data: m[2] } },
            { type: "text", text: `OBIETTIVO: ${obiettivo}${storia}\n\nQuesto è lo schermo ADESSO. Decidi la prossima singola azione.` },
          ],
        },
      ],
    });
    try {
      registraConsumo(u.id, MODEL_MANO, {
        input: resp.usage.input_tokens,
        output: resp.usage.output_tokens,
        cacheScrittura: resp.usage.cache_creation_input_tokens ?? 0,
        cacheLettura: resp.usage.cache_read_input_tokens ?? 0,
        chiamate: 1,
      });
    } catch {
      /* la contabilità non blocca la mano */
    }
    const blocco = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    return blocco ? blocco.input : null;
  });

  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  if (!r.data) return NextResponse.json({ ok: false, errore: "decisione mancante" }, { status: 502 });
  return NextResponse.json({ ok: true, azione: r.data });
}
