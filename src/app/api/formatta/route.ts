import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { conTenant } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Riordina appunti dettati a voce: punteggiatura corretta, a capo, elenchi in
// lista. Usa un modello veloce/economico. Punto d'integrazione voce → appunti.
const SYSTEM = `Sei un assistente che SISTEMA appunti dettati a voce in italiano.
Regole:
- Aggiungi la punteggiatura corretta (punti, virgole, maiuscole a inizio frase).
- Vai a capo dove ha senso; separa i concetti.
- Quando riconosci un ELENCO (più voci, dati tipo "altezza 180 peso 70"), trasformalo in lista: una voce per riga che inizia con "- ", con "campo: valore" dove appropriato (es. "- Altezza: 180 cm").
- Correggi refusi evidenti del riconoscimento vocale, ma NON cambiare il significato.
- NON aggiungere contenuti, NON commentare, NON usare titoli o markdown extra.
Restituisci SOLO il testo sistemato.`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const testo = String(body?.testo ?? "").trim();
  if (!testo) return NextResponse.json({ ok: false, errore: "Niente da sistemare." }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: true, testo }); // degrada: testo invariato

  const r = await conTenant(async () => {
    try {
      const client = new Anthropic({ apiKey });
      const resp = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: testo }],
      });
      const out = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return out || testo;
    } catch (e) {
      console.error("[/api/formatta]", e);
      return testo; // in caso di errore, meglio il testo grezzo che niente
    }
  });
  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  return NextResponse.json({ ok: true, testo: r.data });
}
