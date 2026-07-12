import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { runWithTenant } from "../tenant";
import { db } from "../db";
import {
  creaAppuntamento,
  spostaAppuntamento,
  aggiornaStatoAppuntamento,
  creaCliente,
  attivaCanaleUscita,
  emettiEventoUscita,
} from "../data";
import { consegnaEventiUscita, firmaUscita } from "../uscita";
import { decifra } from "../crypto";

// CANALE D'USCITA end-to-end: un VERO server HTTP locale fa da "gestionale",
// riceve gli eventi firmati e ne verifica l'autenticità. Poi il lato storto:
// il gestionale è giù → l'evento resta in coda, l'ordine non si inverte mai.
// Come in produzione: la chiave di cifratura a riposo esiste (senza, cifra()
// degrada in chiaro per design e l'assert sul segreto cifrato non avrebbe senso).
process.env.ORION_ENC_KEY = "chiave-test-canale-uscita-123456";

const TN = 990303;
let server: http.Server;
let porta = 0;
let ricevuti: { evento: string; corpo: string; firma: string | null }[] = [];
let rispondi = 200; // il "gestionale" può fingersi rotto
let CONN = 0;
let SEGRETO = "";

function pulisci() {
  for (const t of ["appuntamenti", "clienti", "connessioni", "eventi_uscita", "eventi"]) {
    db().prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(TN);
  }
}

before(async () => {
  pulisci();
  // Il finto gestionale in ascolto su una porta libera.
  server = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      ricevuti.push({ evento: String(req.headers["x-orion-evento"] ?? ""), corpo, firma: (req.headers["x-orion-firma"] as string) ?? null });
      res.writeHead(rispondi).end();
    });
  });
  await new Promise<void>((ok) => server.listen(0, () => ok()));
  porta = (server.address() as { port: number }).port;

  runWithTenant(TN, () => {
    const ora = new Date().toISOString();
    CONN = Number(
      db()
        .prepare("INSERT INTO connessioni (tenant_id, tipo, nome, modalita, created_at, updated_at) VALUES (?, 'gestionale', 'FintoGest', 'descritto', ?, ?)")
        .run(TN, ora, ora).lastInsertRowid
    );
    const r = attivaCanaleUscita(CONN, `http://127.0.0.1:${porta}/webhook`);
    SEGRETO = r.segreto!;
  });
});

after(() => {
  server.close();
  pulisci();
});

test("l'agenda di ORION scrive nel gestionale: eventi firmati, in ordine, con la chiave esterna", async () => {
  await runWithTenant(TN, async () => {
    // Il segreto a riposo è cifrato, non in chiaro.
    const salvato = db().prepare("SELECT segreto_uscita FROM connessioni WHERE id = ?").get(CONN) as { segreto_uscita: string };
    assert.notEqual(salvato.segreto_uscita, SEGRETO);
    assert.equal(decifra(salvato.segreto_uscita), SEGRETO);

    const cliente = creaCliente({ nome: "Mario Verdi", telefono: "333 000 1122" });
    const app = creaAppuntamento({ cliente_id: cliente.id, titolo: "Tagliando", inizio: "2026-07-20T10:00", fine: "2026-07-20T11:00" });
    spostaAppuntamento(app.id, "2026-07-20T15:00", "2026-07-20T16:00");
    aggiornaStatoAppuntamento(app.id, "confermato");

    const esito = await consegnaEventiUscita();
    assert.equal(esito.consegnati, 4);
    assert.equal(esito.falliti, 0);

    // Ordine cronologico rispettato.
    assert.deepEqual(
      ricevuti.map((r) => r.evento),
      ["cliente_creato", "appuntamento_creato", "appuntamento_spostato", "appuntamento_stato"]
    );
    // Firma HMAC verificabile dal ricevente (come farebbe il gestionale).
    for (const r of ricevuti) {
      assert.equal(r.firma, firmaUscita(r.corpo, SEGRETO));
      const attesa = "sha256=" + crypto.createHmac("sha256", SEGRETO).update(r.corpo, "utf8").digest("hex");
      assert.equal(r.firma, attesa);
    }
    // Il contenuto è utilizzabile: lo spostamento porta il nuovo orario e lo stato la conferma.
    const spostato = JSON.parse(ricevuti[2].corpo);
    assert.equal(spostato.dati.inizio, "2026-07-20T15:00");
    const stato = JSON.parse(ricevuti[3].corpo);
    assert.equal(stato.dati.stato, "confermato");
    // Nulla resta in coda.
    const inAttesa = db().prepare("SELECT COUNT(*) n FROM eventi_uscita WHERE tenant_id = ? AND consegnato = 0").get(TN) as { n: number };
    assert.equal(inAttesa.n, 0);
  });
});

test("gestionale giù: l'evento aspetta con pazienza e l'ordine non si inverte", async () => {
  await runWithTenant(TN, async () => {
    ricevuti = [];
    rispondi = 500; // il gestionale è rotto
    emettiEventoUscita("appuntamento_creato", { orion_id: 991, titolo: "prima" });
    emettiEventoUscita("appuntamento_spostato", { orion_id: 991, titolo: "dopo" });

    let esito = await consegnaEventiUscita();
    assert.equal(esito.consegnati, 0);
    assert.equal(esito.falliti, 1); // il primo fallisce, il SECONDO non viene nemmeno tentato
    assert.equal(ricevuti.length, 1);

    const fila = db()
      .prepare("SELECT tentativi, prossimo_tentativo, ultimo_errore FROM eventi_uscita WHERE tenant_id = ? AND consegnato = 0 ORDER BY id")
      .all(TN) as { tentativi: number; prossimo_tentativo: string; ultimo_errore: string | null }[];
    assert.equal(fila.length, 2);
    assert.equal(fila[0].tentativi, 1);
    assert.match(fila[0].ultimo_errore ?? "", /500/);
    assert.ok(new Date(fila[0].prossimo_tentativo).getTime() > Date.now()); // backoff: non subito

    // Il gestionale torna su: al giro dopo (forzando l'orologio) arrivano ENTRAMBI, in ordine.
    rispondi = 200;
    ricevuti = [];
    db().prepare("UPDATE eventi_uscita SET prossimo_tentativo = ? WHERE tenant_id = ?").run(new Date(0).toISOString(), TN);
    esito = await consegnaEventiUscita();
    assert.equal(esito.consegnati, 2);
    assert.deepEqual(ricevuti.map((r) => JSON.parse(r.corpo).dati.titolo), ["prima", "dopo"]);
  });
});

test("senza canale attivo l'emissione è un no-op (zero righe, zero costi)", () => {
  runWithTenant(990304, () => {
    emettiEventoUscita("appuntamento_creato", { orion_id: 1 });
    const n = (db().prepare("SELECT COUNT(*) n FROM eventi_uscita WHERE tenant_id = 990304").get() as { n: number }).n;
    assert.equal(n, 0);
  });
});
