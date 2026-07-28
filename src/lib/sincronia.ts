// ═══════════════════════════════════════════════════════════════════════════
// LA SINCRONIA AL RISVEGLIO — «hai riacceso il computer: mentre eri via sono
// successe delle cose, e adesso le riporto io nei tuoi programmi».
//
// Il pezzo delicato non è usare il computer (quello lo fa già la Mano): è
// DECIDERE COSA FARE. Se durante la notte un appuntamento è stato creato,
// spostato due volte e poi disdetto, nel gestionale non deve succedere niente:
// là dentro non è mai esistito. Se invece è stato creato e spostato, si scrive
// UNA volta sola, con l'orario giusto — non tre volte.
//
// Questo file fa esattamente quello: prende la coda grezza degli eventi non
// ancora riportati e la COLLASSA in poche righe pulite, una per cosa vera.
// Nessun modello AI è coinvolto: è aritmetica.
// ═══════════════════════════════════════════════════════════════════════════
import { db } from "./db";
import { tenantIdCorrente } from "./tenant";

export type VoceSincronia = {
  /** Cosa bisogna fare davvero nel programma dell'utente. */
  azione: "crea" | "sposta" | "disdici" | "aggiorna" | "niente";
  /** Di che cosa si tratta, in italiano: «appuntamento», «cliente», «pagamento»… */
  categoria: string;
  /** La frase che ORION può leggere ad alta voce. */
  riga: string;
  /** Il sistema di destinazione (nome della connessione). */
  sistema: string;
  /** I dati finali, già collassati (l'ultimo stato, non la storia). */
  dettagli: Record<string, unknown>;
  /** Le righe della coda che questa voce spegne una volta riportata. */
  ids: number[];
};

export type PianoSincronia = {
  voci: VoceSincronia[];
  /** Righe da spuntare SENZA toccare il computer (nate e morte mentre eri via). */
  daSpuntareSubito: number[];
  /** Quante cose vanno davvero riportate a mano. */
  daFare: number;
  sistemi: string[];
  /** L'evento non riportato più vecchio: dice da quanto ORION è indietro. */
  piuVecchio: string | null;
};

const CATEGORIE: { prefisso: string; categoria: string; parola: string }[] = [
  { prefisso: "appuntamento", categoria: "appuntamento", parola: "l'appuntamento" },
  { prefisso: "cliente", categoria: "cliente", parola: "il cliente" },
  { prefisso: "pagamento", categoria: "pagamento", parola: "l'incasso" },
  { prefisso: "fattura", categoria: "fattura", parola: "la fattura" },
];

function categoriaDi(evento: string): { categoria: string; parola: string } {
  for (const c of CATEGORIE) if (evento.startsWith(c.prefisso)) return { categoria: c.categoria, parola: c.parola };
  return { categoria: "modifica", parola: "la modifica" };
}

/** Il nome della persona/cosa, come lo direbbe un essere umano. */
function comeSiChiama(p: Record<string, unknown>): string {
  if (p.numero) return `n. ${String(p.numero)}`;
  const c = p.cliente_nome ?? p.nome ?? p.titolo;
  return c ? String(c) : "";
}

function quando(p: Record<string, unknown>): string {
  const i = p.inizio ?? p.data;
  if (!i) return "";
  const s = String(i);
  const g = s.slice(8, 10) + "/" + s.slice(5, 7);
  const ora = s.length > 11 ? " alle " + s.slice(11, 16) : "";
  return g + ora;
}

/**
 * IL PIANO. Legge tutto ciò che non è ancora stato riportato e lo riduce
 * all'osso: una voce per cosa vera, con l'azione giusta e i dati finali.
 */
export function pianoSincronia(limite = 60): PianoSincronia {
  const righe = db()
    .prepare(
      `SELECT e.id, e.evento, e.payload, e.created_at, c.nome AS sistema
       FROM eventi_uscita e JOIN connessioni c ON c.id = e.connessione_id
       WHERE e.tenant_id = ? AND e.consegnato = 0
       ORDER BY e.id ASC LIMIT ?`
    )
    .all(tenantIdCorrente(), limite) as { id: number; evento: string; payload: string; created_at: string; sistema: string }[];

  if (!righe.length) return { voci: [], daSpuntareSubito: [], daFare: 0, sistemi: [], piuVecchio: null };

  // ── Raggruppo per COSA, non per evento: la stessa entità è UNA riga. ──
  type Gruppo = { eventi: string[]; ids: number[]; ultimo: Record<string, unknown>; sistema: string; categoria: string; parola: string };
  const gruppi = new Map<string, Gruppo>();

  for (const r of righe) {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(r.payload || "{}");
    } catch {
      /* payload illeggibile: la riga vale come «aggiorna» generico */
    }
    const { categoria, parola } = categoriaDi(r.evento);
    const chiave = `${categoria}:${payload.orion_id ?? "x" + r.id}`;
    const g = gruppi.get(chiave);
    if (g) {
      g.eventi.push(r.evento);
      g.ids.push(r.id);
      g.ultimo = payload; // vince sempre l'ULTIMO stato: si scrive una volta sola
    } else {
      gruppi.set(chiave, { eventi: [r.evento], ids: [r.id], ultimo: payload, sistema: r.sistema, categoria, parola });
    }
  }

  const voci: VoceSincronia[] = [];
  const daSpuntareSubito: number[] = [];

  for (const g of gruppi.values()) {
    const primo = g.eventi[0];
    const ultimo = g.eventi[g.eventi.length - 1];
    // Nascono anche gli incassi («registrato») e le fatture («emessa»).
    const nato = /_(creat[oa]|registrat[oa]|emess[ao])$/.test(primo);
    const morto = /_cancellat[oa]$/.test(ultimo) || String(g.ultimo.stato ?? "") === "cancellato";
    const nome = comeSiChiama(g.ultimo);
    const data = quando(g.ultimo);

    // ── NATO E MORTO MENTRE ERI VIA: nel gestionale non è mai esistito.
    //    Non si tocca il computer: si spegne la riga e basta. ──
    if (nato && morto) {
      daSpuntareSubito.push(...g.ids);
      voci.push({
        azione: "niente",
        categoria: g.categoria,
        sistema: g.sistema,
        riga: `${g.parola}${nome ? " di " + nome : ""}${data ? " del " + data : ""} è stato preso e poi disdetto mentre eri via: nel tuo programma non è mai esistito, non tocco niente`,
        dettagli: g.ultimo,
        ids: g.ids,
      });
      continue;
    }

    let azione: VoceSincronia["azione"] = "aggiorna";
    let riga = "";
    if (nato) {
      azione = "crea";
      riga = `inserisci ${g.parola}${nome ? " di " + nome : ""}${data ? " del " + data : ""}`;
      if (g.eventi.length > 1) riga += " (nel frattempo è cambiato: scrivi direttamente questi dati, sono quelli buoni)";
    } else if (morto) {
      azione = "disdici";
      riga = `disdici ${g.parola}${nome ? " di " + nome : ""}${data ? " del " + data : ""}`;
    } else if (g.eventi.some((e) => /_spostat[oa]$/.test(e))) {
      azione = "sposta";
      riga = `sposta ${g.parola}${nome ? " di " + nome : ""} a ${data}`;
    } else {
      riga = `aggiorna ${g.parola}${nome ? " di " + nome : ""}${data ? " (" + data + ")" : ""}`;
    }

    voci.push({ azione, categoria: g.categoria, sistema: g.sistema, riga, dettagli: g.ultimo, ids: g.ids });
  }

  // Prima si crea, poi si sposta, poi si disdice: è l'ordine che non lascia
  // buchi se qualcosa va storto a metà strada.
  const peso = { crea: 0, sposta: 1, aggiorna: 2, disdici: 3, niente: 4 } as const;
  voci.sort((a, b) => peso[a.azione] - peso[b.azione]);

  const daFare = voci.filter((v) => v.azione !== "niente").length;
  return {
    voci,
    daSpuntareSubito,
    daFare,
    sistemi: Array.from(new Set(voci.filter((v) => v.azione !== "niente").map((v) => v.sistema))),
    piuVecchio: righe[0]?.created_at ?? null,
  };
}

/** Spegne le righe della coda: usato per il «niente da fare» e a lavoro finito. */
export function spuntaRighe(ids: number[]): number {
  if (!ids.length) return 0;
  const segnaposto = ids.map(() => "?").join(",");
  return db()
    .prepare(
      `UPDATE eventi_uscita SET consegnato = 1, consegnato_at = ?
       WHERE tenant_id = ? AND consegnato = 0 AND id IN (${segnaposto})`
    )
    .run(new Date().toISOString(), tenantIdCorrente(), ...ids).changes;
}

/** L'obiettivo da dare alla Mano: una riga per cosa, in ordine, senza fronzoli. */
export function obiettivoPerLaMano(piano: PianoSincronia, sistema: string): string {
  const mie = piano.voci.filter((v) => v.sistema === sistema && v.azione !== "niente");
  if (!mie.length) return "";
  return (
    `In ${sistema} riporta queste modifiche, una per riga, esattamente come sono scritte:\n` +
    mie.map((v, i) => `${i + 1}. ${v.riga} — dati: ${JSON.stringify(v.dettagli)}`).join("\n") +
    "\nNon inventare nulla che non sia in questo elenco. Se una cosa c'è già, lasciala com'è e passa alla prossima."
  );
}

/** Da quanto ORION è indietro, detto in italiano. */
export function daQuanto(iso: string | null): string {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 90) return `${min} minut${min === 1 ? "o" : "i"}`;
  const ore = Math.round(min / 60);
  if (ore < 36) return `${ore} or${ore === 1 ? "a" : "e"}`;
  return `${Math.round(ore / 24)} giorni`;
}
