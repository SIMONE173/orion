"use client";

import { useCallback, useEffect, useState } from "react";

// Pannello "Collega email": form sicuro per IMAP/SMTP con app-password. ORION lo
// fa comparire a voce; la password si SCRIVE qui (non si detta). Host/porte sono
// dedotti dal dominio (Gmail/Outlook/…); per domini ignoti si possono indicare.

type Stato = { configurato: boolean; email: string | null; from_name: string | null };

export function EmailConnectPanel() {
  const [stato, setStato] = useState<Stato | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [avanzate, setAvanzate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const carica = useCallback(async () => {
    try {
      const r = await fetch("/api/email/connect");
      setStato(await r.json());
    } catch {
      setStato({ configurato: false, email: null, from_name: null });
    }
  }, []);

  useEffect(() => {
    carica();
  }, [carica]);

  const collega = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/email/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          from_name: fromName || undefined,
          imap_host: imapHost || undefined,
          smtp_host: smtpHost || undefined,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setPassword("");
        setMsg("Email collegata.");
        await carica();
      } else {
        setMsg(d.errore || "Collegamento non riuscito.");
        if (d.serviServer) setAvanzate(true);
      }
    } catch {
      setMsg("Errore di rete.");
    } finally {
      setBusy(false);
    }
  }, [email, password, fromName, imapHost, smtpHost, carica]);

  const scollega = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/email/connect", { method: "DELETE" });
      await carica();
      setMsg(null);
    } finally {
      setBusy(false);
    }
  }, [carica]);

  const inputCls =
    "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/40";

  if (stato?.configurato) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <h2 className="mb-2 text-lg font-semibold tracking-tight text-cyan-100">Email collegata</h2>
        <p className="mb-5 text-sm text-slate-400">{stato.email}</p>
        <button
          onClick={scollega}
          disabled={busy}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/[0.04] disabled:opacity-50"
        >
          Scollega
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-1 text-lg font-semibold tracking-tight text-cyan-100">Collega la tua email</h2>
      <p className="mb-4 text-sm text-slate-400">
        Inserisci l&apos;indirizzo e una <strong>password per le app</strong> (consigliata rispetto alla
        password normale). Host e porte si impostano da soli per Gmail, Outlook e altri.
      </p>
      <div className="max-w-md space-y-3">
        <input className={inputCls} type="email" placeholder="indirizzo@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inputCls} type="password" placeholder="password per le app" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input className={inputCls} type="text" placeholder="Nome mittente (opzionale)" value={fromName} onChange={(e) => setFromName(e.target.value)} />

        {avanzate && (
          <>
            <input className={inputCls} type="text" placeholder="Server IMAP (es. imap.dominio.it)" value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
            <input className={inputCls} type="text" placeholder="Server SMTP (es. smtp.dominio.it)" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
          </>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={collega}
            disabled={busy || !email || !password}
            className="rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            {busy ? "Verifico…" : "Collega"}
          </button>
          {!avanzate && (
            <button onClick={() => setAvanzate(true)} className="text-xs text-slate-500 hover:text-slate-300">
              Imposta i server a mano
            </button>
          )}
        </div>
        {msg && <p className="text-sm text-slate-400">{msg}</p>}
      </div>
    </div>
  );
}
