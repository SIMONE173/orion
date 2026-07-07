import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MODALITÀ AFFIANCAMENTO: percorso DEDICATO e isolato dal cervello principale.
// Guarda uno SCREENSHOT del software/gestionale/sito che il professionista già usa,
// ne fa un briefing sintetico e indica le zone da evidenziare sullo schermo. Non
// copia i dati e non salva nulla: stateless. Modello vision economico (Haiku).
const MODELLO = "claude-haiku-4-5-20251001";

const SYSTEM = `Sei ORION in MODALITÀ AFFIANCAMENTO: guardi la SCHERMATA del software, gestionale o sito che un professionista (es. medico, avvocato, fisioterapista, commercialista) sta già usando — agenda, gestionale pazienti/clienti, email, portale, foglio di calcolo…
Il tuo compito NON è copiare i dati: è AFFIANCARE. Capisci cosa c'è a schermo, fai un briefing sintetico di ciò che conta ORA per il professionista, e indichi le zone da EVIDENZIARE direttamente sullo schermo (come se le cerchiassi con un pennarello).
Rispondi SEMPRE e SOLO con un oggetto JSON valido, senza testo attorno, in questa forma:
{"riassunto": "2-4 frasi brevi e concrete su ciò che conta a schermo, in italiano", "parla": "una frase brevissima da dire ad alta voce, oppure vuota", "evidenzia": [{"etichetta":"breve","forma":"box|punto|freccia|attenzione","x":0.0,"y":0.0,"w":0.0,"h":0.0}]}
Regole:
- Coordinate NORMALIZZATE 0..1 rispetto all'immagine (x,y = angolo in alto a sinistra; per "punto"/"freccia" bastano x,y; w,h solo per "box"). "attenzione" per scadenze/urgenze/errori.
- Evidenzia SOLO ciò che conta davvero (max 5): l'appuntamento imminente, il dato da confermare, la scadenza vicina, la riga importante. Se non c'è nulla da evidenziare, "evidenzia": [].
- Se c'è una DOMANDA dell'utente, rispondi a quella guardando la schermata (cosa cercare/evidenziare).
- Se la schermata non è leggibile o non è un contesto di lavoro, dillo con garbo nel riassunto e lascia "evidenzia": [].
- Sii concreto e utile, mai generico. Niente dati inventati: descrivi solo ciò che vedi.`;

type Corpo = { frame?: string; domanda?: string; contesto?: string };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Corpo;
  const m = (body.frame || "").match(/^data:(.+?);base64,(.*)$/);
  if (!m) return NextResponse.json({ riassunto: "", parla: "", evidenzia: [] });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ riassunto: "Mi manca la chiave per vedere lo schermo: aggiungi ANTHROPIC_API_KEY.", parla: "", evidenzia: [] });
  }

  const auth = await conTenant(() => true);
  if (!auth.ok) return NextResponse.json({ riassunto: "", parla: "", evidenzia: [], errore: "auth" }, { status: 401 });

  const istruzione = body.domanda
    ? `L'utente chiede: "${body.domanda}". Guarda la schermata e rispondi/evidenzia di conseguenza.`
    : `Fai il briefing di ciò che conta in questa schermata ed evidenzia gli elementi importanti.`;
  const ctx = body.contesto ? `\nContesto: ${body.contesto}` : "";

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: MODELLO,
      max_tokens: 700,
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
            { type: "text", text: `${istruzione}${ctx}` },
          ],
        },
      ],
    });
    const testo = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = testo.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ riassunto: testo.trim().slice(0, 500), parla: "", evidenzia: [] });
    const dato = JSON.parse(match[0]) as { riassunto?: string; parla?: string; evidenzia?: unknown[] };
    const evidenzia = Array.isArray(dato.evidenzia)
      ? dato.evidenzia
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .slice(0, 5)
          .map((e) => ({
            etichetta: String(e.etichetta ?? ""),
            forma: ["box", "punto", "freccia", "attenzione"].includes(String(e.forma)) ? String(e.forma) : "box",
            x: Number(e.x) || 0,
            y: Number(e.y) || 0,
            w: e.w != null ? Number(e.w) : undefined,
            h: e.h != null ? Number(e.h) : undefined,
          }))
      : [];
    return NextResponse.json({
      riassunto: String(dato.riassunto ?? "").trim(),
      parla: String(dato.parla ?? "").trim(),
      evidenzia,
    });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    if (msg.includes("credit") || msg.includes("billing") || msg.includes("insufficient")) {
      return NextResponse.json({ riassunto: "Credito esaurito: non riesco a leggere lo schermo.", parla: "", evidenzia: [], errore: "credito" });
    }
    return NextResponse.json({ riassunto: "", parla: "", evidenzia: [] });
  }
}
