import { test } from "node:test";
import assert from "node:assert/strict";
import { runWithTenant } from "../tenant";
import { db } from "../db";
import { eccezioneLancio, accessoGratuitoPermanente, ospiteInvitato } from "../lancio";
import { oggiRoma, statoAbbonamento, briefingOggi, creaCliente, creaAppuntamento } from "../data";

// Due cose piccole che, sbagliate, si pagano care.

// ── 1. GLI OSPITI INVITATI ────────────────────────────────────────────────
// Chi il titolare fa provare ORION completo PRIMA del lancio. La porta deve
// aprirsi per lui e per nessun altro — nemmeno per un indirizzo somigliante.

const ANDREA = "andrea.porce@gmail.com";

test("l'ospite invitato passa il lucchetto del lancio, e non è un regalo a vita", () => {
  assert.equal(eccezioneLancio(ANDREA), true);
  assert.equal(eccezioneLancio("  Andrea.Porce@Gmail.com "), true, "maiuscole e spazi non lo lasciano fuori");
  assert.equal(ospiteInvitato(ANDREA), true);
  assert.equal(accessoGratuitoPermanente(ANDREA), false, "l'ospite non è un regalo a vita: al lancio torna utente normale");
  assert.equal(accessoGratuitoPermanente("luca.lorito07@gmail.com"), true, "gli amici col regalo a vita restano tali");
});

test("nessun altro passa: dominio cambiato, nome accorciato, solo cognome, vuoto", () => {
  for (const estraneo of ["andrea.porce@gmail.it", "andrea@gmail.com", "porce@gmail.com", "chiunque@example.com", ""]) {
    assert.equal(eccezioneLancio(estraneo), false, `«${estraneo}» doveva restare fuori`);
  }
});

test("l'ospite usa ORION senza carta, un estraneo no", async () => {
  // Il paywall vive su Stripe: qui lo si accende per la durata della prova.
  const prima = { k: process.env.STRIPE_SECRET_KEY, p: process.env.STRIPE_PRICE_PRO };
  process.env.STRIPE_SECRET_KEY = "sk_prova";
  process.env.STRIPE_PRICE_PRO = "price_prova";
  try {
    await runWithTenant(990074, async () => {
      assert.equal(statoAbbonamento(ANDREA).accessoConsentito, true);
      assert.notEqual(statoAbbonamento("chiunque@example.com").accessoConsentito, true);
    });
  } finally {
    process.env.STRIPE_SECRET_KEY = prima.k;
    process.env.STRIPE_PRICE_PRO = prima.p;
  }
});

// ── 2. CHE GIORNO È OGGI ──────────────────────────────────────────────────
// ORION gira su un server che ragiona in UTC; i suoi utenti vivono in Italia.
// Fra mezzanotte e le due «oggi» in UTC è ancora IERI: l'agenda del giorno
// risultava vuota e una fattura emessa a mezzanotte e mezza portava la data
// sbagliata. «Oggi» dev'essere sempre il giorno italiano.

test("«oggi» è il giorno di chi usa ORION, non quello del server", () => {
  assert.match(oggiRoma(), /^\d{4}-\d{2}-\d{2}$/);
  const atteso = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
  assert.equal(oggiRoma(), atteso);
});

test("l'agenda di OGGI è quella italiana, anche all'una di notte", async () => {
  // Il caso che rompeva tutto: alle 00:30 italiane il server (UTC) è ancora a
  // ieri. Un appuntamento di oggi deve comunque comparire nel briefing.
  const TEN = 990075;
  const pulisci = () => {
    for (const t of ["appuntamenti", "clienti"]) {
      try {
        db().prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(TEN);
      } catch {
        /* tabella assente */
      }
    }
  };
  pulisci();
  try {
    await runWithTenant(TEN, async () => {
      const c = creaCliente({ nome: "Prova Fuso", telefono: "3331230000" });
      const oggi = oggiRoma();
      creaAppuntamento({ cliente_id: c.id, titolo: "Seduta — Prova Fuso", inizio: `${oggi}T10:00`, fine: `${oggi}T10:45` });
      const b = briefingOggi() as unknown as { appuntamenti: unknown[] };
      assert.equal(b.appuntamenti.length, 1, "il briefing guarda il giorno ITALIANO, non quello del server");
    });
  } finally {
    pulisci();
  }
});
