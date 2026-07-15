import { NextRequest, NextResponse } from "next/server";
import { statoBeta, iscriviBeta, SCONTO_BETA } from "@/lib/beta";
import { emailValida } from "@/lib/validazione";
import { rateLimit, ipRichiesta } from "@/lib/ratelimit";
import { inviaEmailBeta } from "@/lib/email-orion";
import { quandoInParole } from "@/lib/lancio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stato dei posti beta (per mostrare "X posti rimasti" nella vetrina).
export async function GET() {
  const s = statoBeta();
  return NextResponse.json(s, { headers: { "Cache-Control": "public, max-age=30" } });
}

// Iscrizione beta dalla vetrina (pubblica, senza login).
export async function POST(req: NextRequest) {
  const lim = rateLimit(`beta:${ipRichiesta(req)}`, 8, 60 * 60 * 1000);
  if (!lim.ok) return NextResponse.json({ ok: false, errore: "Troppe richieste. Riprova più tardi." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!emailValida(email)) return NextResponse.json({ ok: false, errore: "Inserisci un'email valida." }, { status: 400 });

  const esito = iscriviBeta({
    email,
    nome: body?.nome ? String(body.nome) : null,
    professione: body?.professione ? String(body.professione) : null,
  });
  const s = statoBeta();
  if (esito === "pieno") return NextResponse.json({ ok: false, pieno: true, ...s }, { status: 409 });
  if (esito === "gia") return NextResponse.json({ ok: true, gia: true, ...s });

  // Founding member confermato → email di benvenuto tra i primi (fire-and-forget).
  void inviaEmailBeta(email, SCONTO_BETA, quandoInParole()).catch((e) =>
    console.error("[email] beta non inviata:", e instanceof Error ? e.message : e)
  );
  return NextResponse.json({ ok: true, ...s });
}
