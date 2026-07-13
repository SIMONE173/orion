import { NextRequest, NextResponse } from "next/server";
import { mailerConfigurato } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostica invio email (protetta dal segreto interno x-orion-cron). Dice se
// il mailer è configurato, con che metodo, e — con ?to=<email> — tenta un invio
// via API Resend restituendo lo STATO e il CORPO esatto della risposta (così si
// legge l'errore vero, es. "domain is not verified"). Nessun segreto esposto.
// Token temporaneo di diagnosi (endpoint da rimuovere subito dopo). Non protegge
// alcun segreto: la risposta maschera la chiave e mostra solo config + errore Resend.
const TOKEN_DIAG = "orion-diag-7f3a9c2e1b8d4056";

export async function GET(req: NextRequest) {
  const segreto = process.env.VAPID_PRIVATE_KEY || "";
  const autorizzato =
    (segreto && req.headers.get("x-orion-cron") === segreto) ||
    req.nextUrl.searchParams.get("k") === TOKEN_DIAG;
  if (!autorizzato) {
    return NextResponse.json({ ok: false, errore: "non autorizzato" }, { status: 403 });
  }
  const key = (process.env.RESEND_API_KEY || process.env.MAIL_PASS || "").trim();
  const info: Record<string, unknown> = {
    configurato: mailerConfigurato(),
    metodo: key.startsWith("re_") ? "resend-api" : process.env.MAIL_HOST ? "smtp" : "nessuno",
    from: process.env.MAIL_FROM || "(default) ORION <no-reply@orionvision.it>",
    chiave: key ? `${key.slice(0, 3)}…(${key.length} caratteri)` : "(vuota)",
  };
  const to = req.nextUrl.searchParams.get("to");
  if (to && key.startsWith("re_")) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: info.from, to: [to], subject: "Diagnostica ORION", text: "Se leggi questo, l'invio funziona." }),
        signal: AbortSignal.timeout(10_000),
      });
      info.resend_status = r.status;
      info.resend_risposta = (await r.text()).slice(0, 500);
    } catch (e) {
      info.resend_errore = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json(info);
}
