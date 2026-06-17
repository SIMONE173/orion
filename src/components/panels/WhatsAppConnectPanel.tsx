"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Pannello "Collega WhatsApp" (Embedded Signup di Meta). ORION lo fa comparire a
// voce; il login e il consenso li fa l'utente nella finestra di Meta — noi
// raccogliamo il codice + i dati del numero e completiamo lato server.

type Stato = {
  disponibile: boolean;
  appId: string | null;
  configId: string | null;
  graphVersion: string;
  collegato: boolean;
  numero: string | null;
  nome: string | null;
};

type FBLoginResponse = { authResponse?: { code?: string } | null; status?: string };
declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void;
      login: (cb: (r: FBLoginResponse) => void, opts: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

function caricaSdk(appId: string, version: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.FB) {
      resolve();
      return;
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve();
    };
    if (document.getElementById("facebook-jssdk")) return;
    const s = document.createElement("script");
    s.id = "facebook-jssdk";
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    document.body.appendChild(s);
  });
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M.06 24l1.68-6.16A11.87 11.87 0 0 1 .16 11.9C.16 5.34 5.5 0 12.06 0a11.82 11.82 0 0 1 8.41 3.49 11.82 11.82 0 0 1 3.48 8.42c0 6.56-5.34 11.9-11.9 11.9a11.9 11.9 0 0 1-5.68-1.45L.06 24zM6.6 20.13c1.68.99 3.28 1.59 5.45 1.59 5.45 0 9.89-4.43 9.89-9.88a9.82 9.82 0 0 0-2.89-6.99 9.82 9.82 0 0 0-6.99-2.9c-5.46 0-9.89 4.44-9.89 9.89 0 2.28.6 3.99 1.6 5.66l-.99 3.63 3.81-1zM17.96 14.6c-.07-.12-.27-.2-.56-.34-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.48 0 1.46 1.06 2.87 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.17-1.42z" />
    </svg>
  );
}

export function WhatsAppConnectPanel() {
  const [stato, setStato] = useState<Stato | null>(null);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const sessionInfoRef = useRef<{ waba_id: string; phone_number_id: string } | null>(null);

  const carica = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/connect");
      if (!r.ok) {
        setStato(null);
        return;
      }
      setStato(await r.json());
    } catch {
      /* riprova al prossimo render */
    }
  }, []);

  useEffect(() => {
    carica();
  }, [carica]);

  // Cattura waba_id + phone_number_id dal postMessage del popup Meta.
  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      if (!String(event.origin).endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.data?.phone_number_id) {
          sessionInfoRef.current = {
            waba_id: data.data.waba_id,
            phone_number_id: data.data.phone_number_id,
          };
        }
      } catch {
        /* messaggio non pertinente */
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const finalizza = useCallback(
    async (code: string) => {
      // Attendi che il postMessage col numero arrivi (corre in parallelo al callback).
      for (let i = 0; i < 25 && !sessionInfoRef.current; i++) {
        await new Promise((r) => setTimeout(r, 120));
      }
      const si = sessionInfoRef.current;
      if (!si) {
        setBusy(false);
        setErrore("Non ho ricevuto i dati del numero. Riprova il collegamento.");
        return;
      }
      try {
        const res = await fetch("/api/whatsapp/connect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, waba_id: si.waba_id, phone_number_id: si.phone_number_id }),
        });
        const d = await res.json();
        setBusy(false);
        if (!res.ok || !d.ok) {
          setErrore(d?.errore ?? "Collegamento non riuscito.");
          return;
        }
        sessionInfoRef.current = null;
        carica();
      } catch {
        setBusy(false);
        setErrore("Errore di rete durante il collegamento.");
      }
    },
    [carica]
  );

  const collega = useCallback(async () => {
    if (!stato?.appId || !stato?.configId) return;
    setErrore(null);
    setBusy(true);
    try {
      await caricaSdk(stato.appId, stato.graphVersion);
      sessionInfoRef.current = null;
      window.FB!.login(
        (response) => {
          const code = response?.authResponse?.code;
          if (!code) {
            setBusy(false);
            setErrore("Collegamento annullato.");
            return;
          }
          finalizza(code);
        },
        {
          config_id: stato.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
        }
      );
    } catch {
      setBusy(false);
      setErrore("Non riesco ad aprire la finestra di Meta.");
    }
  }, [stato, finalizza]);

  const scollega = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/whatsapp/connect", { method: "DELETE" });
    } catch {
      /* noop */
    }
    setBusy(false);
    carica();
  }, [carica]);

  const Header = (
    <div className="mb-6 flex items-center gap-3">
      <span className="grid size-11 place-items-center rounded-xl bg-emerald-500/20 text-emerald-300">
        <WhatsAppGlyph className="h-6 w-6" />
      </span>
      <div>
        <div className="text-lg font-semibold text-slate-100">WhatsApp</div>
        <div className="text-xs text-slate-400">Il tuo numero, gestito da ORION</div>
      </div>
    </div>
  );

  if (!stato) {
    return (
      <div className="flex h-full flex-col">
        {Header}
        <div className="text-sm text-slate-500">Carico lo stato del collegamento…</div>
      </div>
    );
  }

  // Già collegato.
  if (stato.collegato) {
    return (
      <div className="flex h-full flex-col">
        {Header}
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5">
          <div className="flex items-center gap-2 text-emerald-200">
            <span className="size-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" />
            <span className="font-medium">Collegato</span>
          </div>
          <div className="mt-3 text-2xl font-semibold text-slate-100">
            {stato.numero ?? "Numero collegato"}
          </div>
          {stato.nome && <div className="mt-1 text-sm text-slate-400">{stato.nome}</div>}
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Da ora i messaggi dei tuoi clienti arrivano qui e li gestisco io: ti avviso quando
            qualcuno scrive e preparo le risposte per te.
          </p>
        </div>
        <button
          onClick={scollega}
          disabled={busy}
          className="mt-auto self-start rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-50"
        >
          {busy ? "Un attimo…" : "Scollega numero"}
        </button>
      </div>
    );
  }

  // Embedded Signup non ancora attivo su questo ambiente.
  if (!stato.disponibile) {
    return (
      <div className="flex h-full flex-col">
        {Header}
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5 text-sm leading-relaxed text-amber-100">
          Il collegamento del tuo numero WhatsApp è <strong>quasi pronto</strong>: stiamo
          completando l&apos;abilitazione con Meta (verifica dell&apos;attività). Appena è attiva,
          qui comparirà il pulsante per collegare il tuo numero in un minuto, senza passaggi tecnici.
        </div>
        <p className="mt-4 text-sm text-slate-400">
          Nel frattempo ORION funziona già su tutto il resto: agenda, clienti, promemoria, fatture.
        </p>
      </div>
    );
  }

  // Pronto a collegare.
  return (
    <div className="flex h-full flex-col">
      {Header}
      <p className="text-sm leading-relaxed text-slate-300">
        Collega il tuo numero WhatsApp Business: si aprirà una finestra di Meta dove fai
        l&apos;accesso e dai il consenso. Quella parte la fai tu (per sicurezza non posso farla io).
        Poi ci penso io a tutto il resto.
      </p>
      <ol className="mt-4 space-y-2 text-sm text-slate-400">
        <li>1. Tocca “Collega WhatsApp”.</li>
        <li>2. Accedi a Facebook e scegli (o crea) il tuo account WhatsApp Business.</li>
        <li>3. Conferma il numero: torni qui e siamo collegati.</li>
      </ol>

      {errore && (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3.5 py-2 text-sm text-rose-200">
          {errore}
        </div>
      )}

      <button
        onClick={collega}
        disabled={busy}
        className="mt-6 flex items-center justify-center gap-2.5 self-start rounded-xl bg-emerald-500/90 px-6 py-3 font-medium text-slate-900 transition hover:bg-emerald-400 disabled:opacity-50"
      >
        <WhatsAppGlyph className="h-5 w-5" />
        {busy ? "Apertura finestra Meta…" : "Collega WhatsApp"}
      </button>
    </div>
  );
}
