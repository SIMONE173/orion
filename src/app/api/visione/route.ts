import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MODALITÀ VISIONE: percorso DEDICATO e leggero, isolato dal cervello principale
// e dalla memoria. Analizza un fotogramma con un modello vision economico e veloce
// (Haiku) e restituisce { parla, evidenzia } per la guida vocale + gli overlay.
// Stateless: i fotogrammi NON vengono salvati.
const MODELLO_VISIONE = "claude-haiku-4-5-20251001";

const SYSTEM = `Sei ORION in MODALITÀ VISIONE: guardi dal vivo ciò che l'utente sta facendo con le mani (montaggio, riparazioni, elettronica, falegnameria, stampa 3D, cucina, manutenzione, laboratorio…) e lo assisti come un collega esperto accanto a lui.
Compiti: riconosci gli oggetti, capisci cosa sta facendo, segui l'avanzamento, individua errori, suggerisci il passo successivo. Parla in italiano, brevissimo e naturale (verrà letto ad alta voce).
Rispondi SEMPRE e SOLO con un oggetto JSON valido, senza testo attorno, in questa forma:
{"parla": "frase breve da dire ad alta voce, oppure stringa VUOTA se non c'è nulla di utile da aggiungere ora", "evidenzia": [{"etichetta":"breve","forma":"box|punto|freccia|attenzione","x":0.0,"y":0.0,"w":0.0,"h":0.0}]}
Regole:
- Coordinate NORMALIZZATE 0..1 rispetto all'immagine (x,y = angolo in alto a sinistra del box; per "punto"/"freccia" basta x,y; w,h solo per "box"). Usa "attenzione" per pericoli/errori.
- Evidenzia solo gli elementi davvero utili (max 4). Se non serve evidenziare nulla, usa "evidenzia": [].
- In modo "osserva": resta in silenzio (parla="") a meno che tu non noti un ERRORE, un passo completato o il PROSSIMO passo da fare. Non commentare ogni fotogramma.
- In modo "domanda": rispondi alla domanda dell'utente in modo diretto e concreto.
- Se l'inquadratura non è chiara, dillo brevemente e suggerisci come inquadrare meglio.`;

type Corpo = { frame?: string; domanda?: string; modo?: "osserva" | "domanda"; storia?: string[] };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Corpo;
  const m = (body.frame || "").match(/^data:(.+?);base64,(.*)$/);
  if (!m) return NextResponse.json({ parla: "", evidenzia: [] });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ parla: "Mi manca la chiave per vedere: aggiungi ANTHROPIC_API_KEY.", evidenzia: [] });
  }

  // Protetta da sessione (come tutto il resto), ma non tocca i dati del tenant.
  const auth = await conTenant(() => true);
  if (!auth.ok) return NextResponse.json({ parla: "", evidenzia: [], errore: "auth" }, { status: 401 });

  const modo = body.modo === "domanda" ? "domanda" : "osserva";
  const storia = Array.isArray(body.storia) ? body.storia.slice(-4) : [];
  const istruzione =
    modo === "domanda"
      ? `Modo: DOMANDA. L'utente chiede: "${body.domanda ?? ""}". Rispondi guardando l'inquadratura.`
      : `Modo: OSSERVA. Guarda e intervieni solo se utile (errore / passo completato / prossimo passo).`;
  const ctxStoria = storia.length ? `\nUltime tue osservazioni: ${storia.join(" | ")}` : "";

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: MODELLO_VISIONE,
      max_tokens: 500,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: m[1] as "image/jpeg" | "image/png" | "image/webp",
                data: m[2],
              },
            },
            { type: "text", text: `${istruzione}${ctxStoria}` },
          ],
        },
      ],
    });
    const testo = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = testo.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ parla: testo.trim().slice(0, 300), evidenzia: [] });
    const dato = JSON.parse(match[0]) as { parla?: string; evidenzia?: unknown[] };
    const evidenzia = Array.isArray(dato.evidenzia)
      ? dato.evidenzia
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .slice(0, 4)
          .map((e) => ({
            etichetta: String(e.etichetta ?? ""),
            forma: ["box", "punto", "freccia", "attenzione"].includes(String(e.forma)) ? String(e.forma) : "box",
            x: Number(e.x) || 0,
            y: Number(e.y) || 0,
            w: e.w != null ? Number(e.w) : undefined,
            h: e.h != null ? Number(e.h) : undefined,
          }))
      : [];
    return NextResponse.json({ parla: String(dato.parla ?? "").trim(), evidenzia });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    if (msg.includes("credit") || msg.includes("billing") || msg.includes("insufficient")) {
      return NextResponse.json({ parla: "Credito esaurito: non riesco a continuare a vedere.", evidenzia: [], errore: "credito" });
    }
    return NextResponse.json({ parla: "", evidenzia: [] });
  }
}
