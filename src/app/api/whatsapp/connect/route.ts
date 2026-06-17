import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import { getWhatsappAccount, salvaWhatsappAccount, rimuoviWhatsappAccount } from "@/lib/data";
import {
  embeddedSignupConfigurato,
  metaAppId,
  metaConfigId,
  graphVersion,
  scambiaCodicePerToken,
  dettagliNumero,
  sottoscriviWaba,
  registraNumero,
} from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stato del collegamento WhatsApp del professionista + config per il client SDK.
export async function GET() {
  const r = await conTenant(() => {
    const acc = getWhatsappAccount();
    return {
      disponibile: embeddedSignupConfigurato(),
      appId: metaAppId() || null,
      configId: metaConfigId() || null,
      graphVersion: graphVersion(),
      collegato: Boolean(acc?.token && acc?.phone_number_id),
      numero: acc?.display_phone_number ?? null,
      nome: acc?.verified_name ?? null,
    };
  });
  if (!r.ok) return NextResponse.json({ errore: "Non autenticato" }, { status: 401 });
  return NextResponse.json(r.data);
}

// Completa il collegamento: code + waba_id + phone_number_id dal popup Meta.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code: string = String(body?.code ?? "").trim();
  const wabaId: string = String(body?.waba_id ?? "").trim();
  const phoneNumberId: string = String(body?.phone_number_id ?? "").trim();

  if (!embeddedSignupConfigurato()) {
    return NextResponse.json(
      { ok: false, errore: "Collegamento WhatsApp non ancora attivo su questo ambiente." },
      { status: 400 }
    );
  }
  if (!code || !wabaId || !phoneNumberId) {
    return NextResponse.json(
      { ok: false, errore: "Dati del collegamento incompleti." },
      { status: 400 }
    );
  }

  const r = await conTenant(async () => {
    // 1) code → business token
    const tok = await scambiaCodicePerToken(code);
    if (!tok.token) return { ok: false as const, errore: tok.errore ?? "Token non ottenuto." };

    // 2) iscrivi la nostra app ai webhook della WABA del cliente
    const sub = await sottoscriviWaba(wabaId, tok.token);
    if (!sub.ok) return { ok: false as const, errore: sub.errore ?? "Iscrizione webhook fallita." };

    // 3) registra il numero (best-effort) e leggi i dettagli leggibili
    await registraNumero(phoneNumberId, tok.token);
    const dett = await dettagliNumero(phoneNumberId, tok.token);

    // 4) salva l'account per questo tenant
    const acc = salvaWhatsappAccount({
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: dett.display_phone_number ?? null,
      verified_name: dett.verified_name ?? null,
      token: tok.token,
      stato: "collegato",
    });
    return {
      ok: true as const,
      numero: acc.display_phone_number,
      nome: acc.verified_name,
    };
  });

  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  return NextResponse.json(r.data, { status: r.data.ok ? 200 : 400 });
}

// Scollega il numero.
export async function DELETE() {
  const r = await conTenant(() => rimuoviWhatsappAccount());
  if (!r.ok) return NextResponse.json({ ok: false, errore: "Non autenticato" }, { status: 401 });
  return NextResponse.json({ ok: true, rimosso: r.data });
}
