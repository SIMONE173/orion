import { NextRequest, NextResponse } from "next/server";
import { conTenant } from "@/lib/sessione";
import {
  getEmailAccount,
  emailConfigurato,
  salvaEmailAccount,
  rimuoviEmailAccount,
  presetPerEmail,
  verificaConnessione,
  type EmailAccount,
} from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stato del collegamento email (senza mai esporre la password).
export async function GET() {
  const r = await conTenant(() => {
    const a = getEmailAccount();
    return {
      configurato: emailConfigurato(),
      email: a?.email ?? null,
      from_name: a?.from_name ?? null,
      stato: a?.stato ?? null,
    };
  });
  if (!r.ok) return NextResponse.json({ configurato: false }, { status: 401 });
  return NextResponse.json(r.data);
}

// Collega: verifica le credenziali (IMAP) PRIMA di salvarle.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim();
  const password = String(body?.password ?? "");
  if (!email.includes("@") || !password) {
    return NextResponse.json({ ok: false, errore: "Inserisci email e password." }, { status: 400 });
  }
  const preset = presetPerEmail(email);
  const imap_host = String(body?.imap_host ?? preset?.imap_host ?? "").trim();
  const smtp_host = String(body?.smtp_host ?? preset?.smtp_host ?? "").trim();
  if (!imap_host || !smtp_host) {
    return NextResponse.json(
      { ok: false, errore: "Server email non riconosciuto: indica host IMAP e SMTP.", serviServer: true },
      { status: 400 }
    );
  }
  const candidato: EmailAccount = {
    tenant_id: 0,
    email,
    password,
    imap_host,
    imap_port: Number(body?.imap_port) || preset?.imap_port || 993,
    smtp_host,
    smtp_port: Number(body?.smtp_port) || preset?.smtp_port || 465,
    from_name: body?.from_name ? String(body.from_name) : null,
    stato: "collegato",
    created_at: "",
    updated_at: "",
  };

  const r = await conTenant(async () => {
    const test = await verificaConnessione(candidato);
    if (!test.ok) return { ok: false, errore: `Connessione non riuscita: ${test.errore ?? "credenziali errate"}` };
    salvaEmailAccount({
      email,
      password,
      imap_host: candidato.imap_host!,
      imap_port: candidato.imap_port!,
      smtp_host: candidato.smtp_host!,
      smtp_port: candidato.smtp_port!,
      from_name: candidato.from_name ?? undefined,
    });
    return { ok: true, email };
  });
  if (!r.ok) return NextResponse.json({ ok: false, errore: "Sessione scaduta." }, { status: 401 });
  return NextResponse.json(r.data, { status: r.data.ok ? 200 : 400 });
}

export async function DELETE() {
  const r = await conTenant(() => {
    rimuoviEmailAccount();
    return { ok: true };
  });
  if (!r.ok) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json(r.data);
}
