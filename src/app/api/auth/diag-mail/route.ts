import { NextRequest, NextResponse } from "next/server";
import { mailerConfigurato } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostica invio email (protetta dal segreto interno x-orion-cron). Dice se
// il mailer è configurato, con che metodo, e — con ?to=<email> — tenta un invio
// via API Resend restituendo lo STATO e il CORPO esatto della risposta (così si
// legge l'errore vero, es. "domain is not verified"). Nessun segreto esposto.
export async function GET(req: NextRequest) {
  const segreto = process.env.VAPID_PRIVATE_KEY || "";
  if (!segreto || req.headers.get("x-orion-cron") !== segreto) {
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
