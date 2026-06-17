"use client";

import { useState } from "react";
import { OrionCore } from "@/components/OrionCore";

type Utente = { id: number; email: string; nome: string | null };

export function AuthScreen({ onAuth }: { onAuth: (u: Utente) => void }) {
  const [modo, setModo] = useState<"login" | "signup">("login");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrore(null);
    setLoading(true);
    try {
      const url = modo === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body =
        modo === "login"
          ? { email, password }
          : { email, password, nome: nome.trim() || undefined };
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
      onAuth(data.utente);
    } catch {
      setErrore("Connessione non riuscita. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="fade-in flex w-full max-w-sm flex-col items-center">
        <OrionCore state="idle" size={130} />
        <div className="mt-5 flex items-center gap-2.5">
          <span className="text-base font-semibold tracking-[0.35em] text-slate-100">ORION</span>
        </div>
        <p className="mt-1 text-center text-sm text-slate-400">
          Il tuo Sistema Operativo Conversazionale.
        </p>

        <div className="mt-7 flex w-full rounded-xl border border-white/10 bg-white/5 p-1 text-sm">
          <button
            onClick={() => { setModo("login"); setErrore(null); }}
            className={`flex-1 rounded-lg py-2 font-medium transition ${
              modo === "login" ? "bg-cyan-500/90 text-slate-900" : "text-slate-300 hover:text-slate-100"
            }`}
          >
            Accedi
          </button>
          <button
            onClick={() => { setModo("signup"); setErrore(null); }}
            className={`flex-1 rounded-lg py-2 font-medium transition ${
              modo === "signup" ? "bg-cyan-500/90 text-slate-900" : "text-slate-300 hover:text-slate-100"
            }`}
          >
            Crea account
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 flex w-full flex-col gap-3">
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
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            required
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={modo === "login" ? "current-password" : "new-password"}
            required
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
          />

          {errore && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3.5 py-2 text-sm text-rose-200">
              {errore}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-xl bg-cyan-500/90 px-5 py-3 font-medium text-slate-900 transition hover:bg-cyan-400 disabled:opacity-50"
          >
            {loading ? "Un attimo…" : modo === "login" ? "Accedi" : "Inizia con ORION"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
          {modo === "signup"
            ? "Creando l'account avrai subito la tua segreteria operativa, con dati di esempio da esplorare."
            : "Bentornato. Accedi per ritrovare la tua agenda e i tuoi clienti."}
        </p>
      </div>
    </main>
  );
}
