"use client";

import { useEffect, useState } from "react";

// ── IL PANNELLO DEL PROPRIETARIO · /admin (non linkato) ─────────────────────
// Consumi AI del mese per account, budget e sessioni attive: si vede col
// binocolo chi corre tanto (i tuoi migliori clienti) e chi condivide l'account.
// L'API è blindata lato server: risponde solo a ORION_ADMIN_EMAIL.

type Riga = {
  tenantId: number;
  email: string;
  nome: string | null;
  piano: string | null;
  statoAbbonamento: string | null;
  turni: number;
  chiamate: number;
  token: number;
  costoMicro: number;
  sessioniAttive: number;
};

const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(2)}`;

export default function PannelloConsumi() {
  const [dati, setDati] = useState<{ mese: string; righe: Riga[]; totaleMicro: number; totaleTurni: number } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/consumi")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d?.errore || "Accesso negato");
        setDati(d);
      })
      .catch((e) => setErrore(e instanceof Error ? e.message : "Errore"));
  }, []);

  if (errore) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#05070d", color: "#8fb2c2", fontFamily: "-apple-system, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🔐</div>
          <p style={{ marginTop: 12 }}>{errore} — accedi con l&apos;account del proprietario da <a href="/app" style={{ color: "#38e8ff" }}>/app</a>.</p>
        </div>
      </main>
    );
  }
  if (!dati) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#05070d", color: "#8fb2c2" }}>Un attimo…</main>;
  }

  const attivi = dati.righe.filter((r) => r.turni > 0).length;
  return (
    <main style={{ minHeight: "100vh", background: "#05070d", color: "#dff6fc", fontFamily: "-apple-system, 'Segoe UI', sans-serif", padding: "34px 22px" }}>
      <div style={{ maxWidth: 1060, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Consumi AI · {dati.mese}</h1>
          <span style={{ color: "#5e8798", fontSize: 13 }}>il pannello del proprietario — aggiornato in tempo reale</span>
        </div>

        {/* I tre numeri che contano */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 20 }}>
          {[
            ["Spesa AI del mese", usd(dati.totaleMicro)],
            ["Comandi serviti", String(dati.totaleTurni)],
            ["Account attivi", String(attivi)],
          ].map(([k, v]) => (
            <div key={k} style={{ borderRadius: 14, border: "1px solid rgba(56,232,255,.2)", background: "rgba(56,232,255,.05)", padding: "16px 18px" }}>
              <div style={{ fontSize: 12, letterSpacing: ".12em", color: "#7fd7ea", fontWeight: 700 }}>{k.toUpperCase()}</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* La classifica degli account */}
        <div style={{ marginTop: 24, borderRadius: 16, border: "1px solid rgba(255,255,255,.1)", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 780 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,.04)", color: "#7fa5b5", textAlign: "left" }}>
                {["Account", "Piano", "Comandi", "Token", "Costo", "Sessioni"].map((h) => (
                  <th key={h} style={{ padding: "11px 14px", fontWeight: 700, letterSpacing: ".06em", fontSize: 11.5 }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dati.righe.map((r) => {
                const troppoCondiviso = r.piano !== "azienda" && r.sessioniAttive > 3;
                return (
                  <tr key={r.tenantId} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ fontWeight: 600, color: "#eaf6fb" }}>{r.nome || "—"}</div>
                      <div style={{ color: "#6f8c9c", fontSize: 12 }}>{r.email}</div>
                    </td>
                    <td style={{ padding: "11px 14px", color: "#9fdcec" }}>
                      {r.piano === "azienda" ? "Azienda" : r.piano === "pro" ? "Professionista" : "—"}
                      {r.statoAbbonamento ? <span style={{ color: "#5e8798" }}> · {r.statoAbbonamento}</span> : null}
                    </td>
                    <td style={{ padding: "11px 14px" }}>{r.turni}</td>
                    <td style={{ padding: "11px 14px", color: "#8fb2c2" }}>{r.token.toLocaleString("it-IT")}</td>
                    <td style={{ padding: "11px 14px", fontWeight: 700 }}>{usd(r.costoMicro)}</td>
                    <td style={{ padding: "11px 14px", color: troppoCondiviso ? "#fb7185" : "#8fb2c2", fontWeight: troppoCondiviso ? 800 : 400 }}>
                      {r.sessioniAttive}
                      {troppoCondiviso ? " ⚠️" : ""}
                    </td>
                  </tr>
                );
              })}
              {dati.righe.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 22, textAlign: "center", color: "#5e8798" }}>Nessun consumo questo mese.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p style={{ color: "#4d6373", fontSize: 12, marginTop: 14, lineHeight: 1.6 }}>
          Solo osservazione: nessun limite è applicato agli account. ⚠️ sulle sessioni = più di 3 dispositivi vivi su un
          piano individuale: possibile account condiviso — nel caso, una email cortese che propone il piano Azienda fa
          miracoli. I costi sono stime in dollari (i listini API sono in USD).
        </p>
      </div>
    </main>
  );
}
