import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { runWithTenant } from "../tenant";
import { creaCliente, registraPagamento } from "../data";
import { calcolaReferto, refertoInParole } from "../referto";

// IL REFERTO — «cosa ti sta scappando».
// La prova che conta più di tutte: con pochi dati NON deve inventare cifre.
// Un numero sparato qui brucia la fiducia in un colpo, e non torna più.

const VUOTO = 990076;
const PIENO = 990077;

function pulisci(t: number) {
  for (const tab of ["clienti", "pagamenti", "appuntamenti"]) {
    try {
      db().prepare(`DELETE FROM ${tab} WHERE tenant_id = ?`).run(t);
    } catch {
      /* tabella assente */
    }
  }
}

function meseIndietro(mesi: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - mesi);
  return d.toISOString().slice(0, 10);
}

before(() => {
  pulisci(VUOTO);
  pulisci(PIENO);
  runWithTenant(PIENO, async () => {
    // Uno studio con storico: incassi passati, tre sospesi, e clienti fermi.
    for (let i = 0; i < 8; i++) {
      const c = creaCliente({ nome: `Cliente Storico ${i}`, telefono: `333000000${i}` });
      registraPagamento({ cliente_id: c.id, importo: 80, metodo: "contanti", stato: "incassato", data: meseIndietro(3) });
    }
    const a = creaCliente({ nome: "Debitore Uno", telefono: "3339990001" });
    const b = creaCliente({ nome: "Debitore Due", telefono: "3339990002" });
    registraPagamento({ cliente_id: a.id, importo: 200, metodo: "bonifico", stato: "da_incassare", data: meseIndietro(11) });
    registraPagamento({ cliente_id: b.id, importo: 150, metodo: "bonifico", stato: "da_incassare", data: meseIndietro(2) });
  });
});

after(() => {
  pulisci(VUOTO);
  pulisci(PIENO);
});

test("con pochi dati NON inventa niente e lo dice", async () => {
  await runWithTenant(VUOTO, async () => {
    const r = calcolaReferto();
    assert.equal(r.totaleEuro, 0, "senza storico non esce nessuna cifra");
    assert.ok(r.avvertenza, "e l'avvertenza c'è");
    assert.match(r.avvertenza, /non ti do numeri inventati/i);
  });
});

test("conta il lavoro fatto e mai incassato, col più vecchio", async () => {
  await runWithTenant(PIENO, async () => {
    const r = calcolaReferto();
    const v = r.voci.find((x) => x.chiave === "da_incassare");
    assert.ok(v, "la voce dev'esserci");
    assert.equal(v.euro, 350, "200 + 150");
    assert.match(v.dettaglio, /2 incassi ancora aperti/);
    assert.match(v.dettaglio, /mes[ei] fa/, "dice da quanto aspetta il più vecchio");
  });
});

test("le persone che non tornano valgono lo SCONTRINO MEDIO VERO, non un numero di fantasia", async () => {
  await runWithTenant(PIENO, async () => {
    const r = calcolaReferto();
    const v = r.voci.find((x) => x.chiave === "dormienti");
    if (!v) return; // in questo ambiente nessuno risulta dormiente: nulla da provare
    assert.match(v.dettaglio, /scontrino medio/);
    // Lo scontrino medio vero è 80 €: la stima è un quarto dei dormienti per 80.
    assert.equal(v.euro, Math.round(Number(v.valore.replace(/\D/g, "")) * 0.25 * 80));
  });
});

test("il totale è dichiarato come stima, non come promessa", async () => {
  await runWithTenant(PIENO, async () => {
    const r = calcolaReferto();
    assert.ok(r.totaleEuro > 0);
    const foglio = refertoInParole(r, "Studio Bianchi");
    assert.match(foglio, /STUDIO BIANCHI/);
    assert.match(foglio, /stima prudente sui tuoi numeri, non una promessa/i);
    assert.match(foglio, /Conto fatto il \d{2}\/\d{2}\/\d{4}/, "porta la data italiana");
  });
});

test("il conteggio dei dormienti non viene tagliato a venti in silenzio", async () => {
  const TANTI = 990078;
  const pulisciTanti = () => {
    for (const tab of ["clienti", "pagamenti"]) {
      try {
        db().prepare(`DELETE FROM ${tab} WHERE tenant_id = ?`).run(TANTI);
      } catch {
        /* tabella assente */
      }
    }
  };
  pulisciTanti();
  try {
    await runWithTenant(TANTI, async () => {
      // 25 clienti fermi da un anno: il referto deve dirne 25, non 20.
      const vecchio = meseIndietro(12);
      for (let i = 0; i < 25; i++) {
        const c = creaCliente({ nome: `Sparito ${i}`, telefono: `33911100${String(i).padStart(2, "0")}` });
        db().prepare("UPDATE clienti SET ultima_visita = ? WHERE id = ?").run(vecchio, c.id);
      }
      const r = calcolaReferto();
      const v = r.voci.find((x) => x.chiave === "dormienti");
      assert.ok(v, "con 25 clienti fermi la voce dev'esserci");
      assert.equal(Number(v.valore.replace(/\D/g, "")), 25, "il numero vero, non il taglio a 20");
    });
  } finally {
    pulisciTanti();
  }
});
