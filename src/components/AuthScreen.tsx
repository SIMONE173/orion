"use client";

import { useState } from "react";
import { OrionCore } from "@/components/OrionCore";

type Utente = { id: number; email: string; nome: string | null };

export function AuthScreen({ onAuth }: { onAuth: (u: Utente) => void }) {
  const [modo, setModo] = useState<"login" | "signup">("login");
  const [fase, setFase] = useState<"credenziali" | "codice">("credenziali");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codice, setCodice] = useState("");
  const [scopo, setScopo] = useState<"signup" | "login">("signup");
  const [ricorda, setRicorda] = useState(true);
  const [codiceDev, setCodiceDev] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setFase("credenziali");
    setCodice("");
    setCodiceDev(null);
    setErrore(null);
    setAvviso(null);
  };

  // Passo 1: credenziali → il server risponde "serve verifica" (con codice) o
  // apre subito la sessione (dispositivo fidato).
  const submitCredenziali = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrore(null);
    setLoading(true);
    try {
      const url = modo === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body =
        modo === "login" ? { email, password } : { email, password, nome: nome.trim() || undefined };
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrore(data?.errore ?? "Qualcosa è andato storto. Riprova.");
        return;
      }
      if (data.serve_verifica) {
        setScopo(data.scopo === "login" ? "login" : "signup");
        setCodiceDev(data.codice_dev ?? null);
        setAvviso(data.nota ?? null);
        setFase("codice");
        return;
      }
      onAuth(data.utente); // dispositivo fidato: entrata diretta
    } catch {
      setErrore("Connessione non riuscita. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  // Passo 2: il codice a 6 cifre.
  const submitCodice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrore(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verifica", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, codice: codice.trim(), scopo, ricorda }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrore(data?.errore ?? "Codice non valido.");
        return;
      }
      onAuth(data.utente);
    } catch {
      setErrore("Connessione non riuscita. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  const reinvia = async () => {
    setErrore(null);
    setAvviso(null);
    try {
      const res = await fetch("/api/auth/reinvia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, scopo }),
      });
      const data = await res.json();
      setCodiceDev(data?.codice_dev ?? null);
      setAvviso("Ti abbiamo inviato un nuovo codice.");
    } catch {
      setErrore("Non sono riuscito a reinviare il codice.");
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="fade-in flex w-full max-w-sm flex-col items-center">
        <OrionCore state="idle" size={130} />
        <div className="mt-5 flex items-center gap-2.5">
          <span className="text-base font-semibold tracking-[0.35em] text-slate-100">ORION</span>
        </div>
        <p className="mt-1 text-center text-sm text-slate-400">Il tuo Sistema Operativo Conversazionale.</p>

        {fase === "credenziali" ? (
          <>
            <div className="mt-7 flex w-full rounded-xl border border-white/10 bg-white/5 p-1 text-sm">
              <button
                onClick={() => { setModo("login"); setErrore(null); }}
                className={`flex-1 rounded-lg py-2 font-medium transition ${modo === "login" ? "bg-cyan-500/90 text-slate-900" : "text-slate-300 hover:text-slate-100"}`}
              >
                Accedi
              </button>
              <button
                onClick={() => { setModo("signup"); setErrore(null); }}
                className={`flex-1 rounded-lg py-2 font-medium transition ${modo === "signup" ? "bg-cyan-500/90 text-slate-900" : "text-slate-300 hover:text-slate-100"}`}
              >
                Crea account
              </button>
            </div>

            <form onSubmit={submitCredenziali} className="mt-5 flex w-full flex-col gap-3">
              {modo === "signup" && (
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Come ti chiami? (es. Dr. Rossi)"
                  autoComplete="name"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
                />
              )}
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Email" autoComplete="email" required
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
              />
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Password" autoComplete={modo === "login" ? "current-password" : "new-password"} required
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
              />
              {errore && (
                <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3.5 py-2 text-sm text-rose-200">{errore}</div>
              )}
              <button type="submit" disabled={loading} className="mt-1 rounded-xl bg-cyan-500/90 px-5 py-3 font-medium text-slate-900 transition hover:bg-cyan-400 disabled:opacity-50">
                {loading ? "Un attimo…" : modo === "login" ? "Accedi" : "Inizia con ORION"}
              </button>
            </form>

            <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
              {modo === "signup"
                ? "Ti invieremo un codice via email per confermare che sei tu. La tua segreteria operativa parte subito dopo."
                : "Bentornato. Per la tua sicurezza, all'accesso ti chiediamo un codice via email."}
            </p>
          </>
        ) : (
          <form onSubmit={submitCodice} className="mt-7 flex w-full flex-col gap-3">
            <p className="text-center text-sm text-slate-300">
              Abbiamo inviato un codice a<br />
              <span className="font-medium text-cyan-300">{email}</span>
            </p>
            {avviso && (
              <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3.5 py-2 text-center text-xs text-cyan-200">{avviso}</div>
            )}
            {codiceDev && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3.5 py-2 text-center text-xs text-amber-200">
                Modalità test (email non ancora configurata): codice <b>{codiceDev}</b>
              </div>
            )}
            <input
              inputMode="numeric" pattern="[0-9]*" maxLength={6} value={codice}
              onChange={(e) => setCodice(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="______" autoFocus autoComplete="one-time-code"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-2xl tracking-[0.5em] text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={ricorda} onChange={(e) => setRicorda(e.target.checked)} className="accent-cyan-500" />
              Ricorda questo dispositivo per 30 giorni
            </label>
            {errore && (
              <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3.5 py-2 text-sm text-rose-200">{errore}</div>
            )}
            <button type="submit" disabled={loading || codice.length < 6} className="mt-1 rounded-xl bg-cyan-500/90 px-5 py-3 font-medium text-slate-900 transition hover:bg-cyan-400 disabled:opacity-50">
              {loading ? "Verifico…" : "Conferma e entra"}
            </button>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <button type="button" onClick={reset} className="hover:text-slate-300">← Indietro</button>
              <button type="button" onClick={reinvia} className="hover:text-cyan-300">Reinvia il codice</button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
