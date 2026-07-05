import { randomUUID } from "node:crypto";
import { db } from "./db";
import { tenantIdCorrente } from "./tenant";
import {
  creaCliente,
  aggiornaCliente,
  creaAppuntamento,
  upsertEntitaEsterna,
  registraConnessione,
  listConnessioni,
  logEvento,
  type Cliente,
} from "./data";

// ──────────────────────────────────────────────────────────────────────────
// IMPORT DEI DATI ESISTENTI — il ponte reale coi software che il professionista
// usa già. Ogni gestionale sa ESPORTARE (CSV/Excel): qui il file viene letto,
// la struttura (colonne) capita e messa in staging; ORION propone la mappatura
// in conversazione e poi l'import esegue con dedup, collegando tutto alla
// connessione (sistema) di provenienza. Le statistiche finali servono a ORION
// per ADATTARSI: durate reali, giorni/orari tipici, prestazioni più frequenti.
// ──────────────────────────────────────────────────────────────────────────

const T = () => tenantIdCorrente();
const nowISO = () => new Date().toISOString();

const MAX_RIGHE = 5000;
const MAX_CELLA = 300;

export type AnalisiImport = {
  stage_id: string;
  nome_file: string;
  colonne: string[];
  totale: number;
  esempi: Record<string, string>[];
};

export type EsitoImport = {
  ok: boolean;
  errore?: string;
  destinazione?: "clienti" | "appuntamenti" | "entita_esterne";
  sistema?: string | null;
  totale?: number;
  importati?: number;
  aggiornati?: number;
  saltati?: number;
  motivi_salto?: string[];
  analisi?: Record<string, unknown>;
};

// ── Parsing CSV ─────────────────────────────────────────────────────────────

// I gestionali italiani esportano spesso in windows-1252/latin1: se l'UTF-8
// produce caratteri di rimpiazzo, si riprova in latin1.
function decodifica(buf: Buffer): string {
  let testo = buf.toString("utf8");
  if (testo.includes("�")) testo = buf.toString("latin1");
  if (testo.charCodeAt(0) === 0xfeff) testo = testo.slice(1); // BOM
  return testo;
}

// Sceglie il separatore contando le occorrenze FUORI dalle virgolette sulla prima riga.
function rilevaSeparatore(riga: string): string {
  const conta: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let inQuote = false;
  for (const ch of riga) {
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch in conta) conta[ch]++;
  }
  return Object.entries(conta).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(conta).sort((a, b) => b[1] - a[1])[0][0]
    : ";";
}

function parseCsv(testo: string): string[][] {
  const righe: string[][] = [];
  const primaRiga = testo.slice(0, testo.indexOf("\n") === -1 ? testo.length : testo.indexOf("\n"));
  const sep = rilevaSeparatore(primaRiga);
  let campo = "";
  let riga: string[] = [];
  let inQuote = false;
  for (let i = 0; i < testo.length; i++) {
    const ch = testo[i];
    if (inQuote) {
      if (ch === '"') {
        if (testo[i + 1] === '"') {
          campo += '"';
          i++;
        } else inQuote = false;
      } else campo += ch;
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === sep) {
      riga.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && testo[i + 1] === "\n") i++;
      riga.push(campo);
      campo = "";
      if (riga.some((c) => c.trim() !== "")) righe.push(riga);
      riga = [];
      if (righe.length > MAX_RIGHE) break;
    } else {
      campo += ch;
    }
  }
  if (campo !== "" || riga.length) {
    riga.push(campo);
    if (riga.some((c) => c.trim() !== "")) righe.push(riga);
  }
  return righe;
}

// ── Parsing XLSX (exceljs, solo server) ─────────────────────────────────────

function cellaTesto(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    // Data "pura" (mezzanotte) → solo giorno; altrimenti data+ora.
    const p = (n: number) => String(n).padStart(2, "0");
    const base = `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
    return v.getUTCHours() || v.getUTCMinutes() ? `${base} ${p(v.getUTCHours())}:${p(v.getUTCMinutes())}` : base;
  }
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return cellaTesto(o.result);
    if (o.text !== undefined) return cellaTesto(o.text);
    return "";
  }
  return String(v);
}

async function parseXlsx(buf: Buffer): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets.find((w) => w.rowCount > 0);
  if (!ws) return [];
  const righe: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (righe.length > MAX_RIGHE) return;
    const valori = row.values as unknown[]; // 1-based: [empty, col1, col2, …]
    const r: string[] = [];
    for (let c = 1; c < valori.length; c++) r.push(cellaTesto(valori[c]).trim());
    if (r.some((x) => x !== "")) righe.push(r);
  });
  return righe;
}

// ── Analisi + staging ───────────────────────────────────────────────────────

export async function analizzaEStagia(nomeFile: string, buf: Buffer): Promise<AnalisiImport> {
  const ext = nomeFile.toLowerCase().split(".").pop() ?? "";
  let griglia: string[][];
  if (ext === "xlsx" || ext === "xlsm") griglia = await parseXlsx(buf);
  else if (ext === "csv" || ext === "txt" || ext === "tsv") griglia = parseCsv(decodifica(buf));
  else throw new Error(`Formato ".${ext}" non supportato: esporta in CSV o Excel (.xlsx).`);

  if (griglia.length < 2) throw new Error("Il file sembra vuoto (serve una riga di intestazione e almeno una di dati).");

  // Intestazioni: la prima riga; celle vuote/duplicate → nomi univoci.
  const viste = new Set<string>();
  const colonne = griglia[0].map((c, i) => {
    let nome = c.trim().slice(0, 80) || `Colonna ${i + 1}`;
    while (viste.has(nome.toLowerCase())) nome = `${nome}_`;
    viste.add(nome.toLowerCase());
    return nome;
  });
  const righe = griglia
    .slice(1, MAX_RIGHE + 1)
    .map((r) => colonne.map((_, i) => (r[i] ?? "").trim().slice(0, MAX_CELLA)));

  // Staging (e pulizia delle voci più vecchie di 24 ore).
  const id = randomUUID();
  const ieri = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  db().prepare("DELETE FROM import_stage WHERE created_at < ?").run(ieri);
  db()
    .prepare("INSERT INTO import_stage (id, tenant_id, nome_file, colonne, righe, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, T(), nomeFile, JSON.stringify(colonne), JSON.stringify(righe), nowISO());

  const esempi = righe.slice(0, 3).map((r) => {
    const o: Record<string, string> = {};
    colonne.forEach((c, i) => {
      if (r[i]) o[c] = r[i];
    });
    return o;
  });
  return { stage_id: id, nome_file: nomeFile, colonne, totale: righe.length, esempi };
}

function getStage(stageId: string): { nome_file: string; colonne: string[]; righe: string[][] } | null {
  const r = db()
    .prepare("SELECT nome_file, colonne, righe FROM import_stage WHERE id = ? AND tenant_id = ?")
    .get(stageId, T()) as { nome_file: string; colonne: string; righe: string } | undefined;
  if (!r) return null;
  return { nome_file: r.nome_file, colonne: JSON.parse(r.colonne), righe: JSON.parse(r.righe) };
}

// ── Date e orari (formati dei gestionali italiani) ─────────────────────────

// "15/01/2026", "15-01-26", "2026-01-15", "15.01.2026", con eventuale ora attaccata.
function parseData(s: string): { data: string; ora: string | null } | null {
  const t = s.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2})[:.](\d{2}))?/);
  if (m) return { data: `${m[1]}-${m[2]}-${m[3]}`, ora: m[4] ? `${m[4].padStart(2, "0")}:${m[5]}` : null };
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2})[:.](\d{2}))?/);
  if (m) {
    const anno = m[3].length === 2 ? `20${m[3]}` : m[3];
    const mese = m[2].padStart(2, "0");
    const giorno = m[1].padStart(2, "0");
    if (Number(mese) > 12 || Number(giorno) > 31) return null;
    return { data: `${anno}-${mese}-${giorno}`, ora: m[4] ? `${m[4].padStart(2, "0")}:${m[5]}` : null };
  }
  return null;
}

function parseOra(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

function sommaMinuti(iso: string, min: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + min);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── Esecuzione dell'import ──────────────────────────────────────────────────

const soloCifre = (s: string) => s.replace(/\D/g, "");

export function eseguiImport(opz: {
  stage_id: string;
  destinazione: "clienti" | "appuntamenti" | "entita_esterne";
  sistema?: string | null;
  mappa: Record<string, string>;
  tipo_entita?: string | null;
  durata_min_default?: number | null;
}): EsitoImport {
  const stage = getStage(opz.stage_id);
  if (!stage) return { ok: false, errore: "stage_non_trovato: fai ricaricare il file (importa_dati)." };

  // Indice di colonna per ogni campo mappato (nome esatto, poi contiene).
  const idx: Record<string, number> = {};
  const lower = stage.colonne.map((c) => c.toLowerCase());
  for (const [campo, colonna] of Object.entries(opz.mappa ?? {})) {
    if (!colonna) continue;
    let i = lower.indexOf(String(colonna).toLowerCase());
    if (i === -1) i = lower.findIndex((c) => c.includes(String(colonna).toLowerCase()));
    if (i !== -1) idx[campo] = i;
  }
  const val = (riga: string[], campo: string): string => (idx[campo] !== undefined ? (riga[idx[campo]] ?? "").trim() : "");

  // La connessione di provenienza: registrata (o riusata) così tutto resta
  // tracciato come parte dell'ecosistema.
  let connessioneId: number | null = null;
  let sistemaNome: string | null = null;
  if (opz.sistema) {
    const nome = String(opz.sistema).trim();
    const esistente = listConnessioni().find((c) => c.nome.toLowerCase() === nome.toLowerCase());
    const conn = esistente ?? registraConnessione({ nome, tipo: "gestionale", descrizione: `Origine dell'import "${stage.nome_file}"` });
    connessioneId = conn.id;
    sistemaNome = conn.nome;
  }

  const motivi: string[] = [];
  const salta = (motivo: string) => {
    if (motivi.length < 8 && !motivi.includes(motivo)) motivi.push(motivo);
  };
  let importati = 0;
  let aggiornati = 0;
  let saltati = 0;

  if (opz.destinazione === "clienti") {
    if (idx.nome === undefined) return { ok: false, errore: "mappa_incompleta: serve almeno la colonna del nome." };
    const esistenti = db()
      .prepare("SELECT * FROM clienti WHERE tenant_id = ?")
      .all(T()) as Cliente[];
    const perTelefono = new Map<string, Cliente>();
    const perNome = new Map<string, Cliente>();
    for (const c of esistenti) {
      const tel = soloCifre(c.telefono ?? "").slice(-9);
      if (tel) perTelefono.set(tel, c);
      perNome.set(c.nome.trim().toLowerCase(), c);
    }
    let conTelefono = 0;
    let conEmail = 0;
    for (const riga of stage.righe) {
      const nome = val(riga, "nome");
      if (!nome) {
        saltati++;
        salta("riga senza nome");
        continue;
      }
      const dati: Partial<Cliente> = {
        telefono: val(riga, "telefono") || undefined,
        email: val(riga, "email") || undefined,
        codice_fiscale: val(riga, "codice_fiscale") || undefined,
        piva: val(riga, "piva") || undefined,
        indirizzo: val(riga, "indirizzo") || undefined,
        cap: val(riga, "cap") || undefined,
        comune: val(riga, "comune") || undefined,
        provincia: val(riga, "provincia") || undefined,
        note: val(riga, "note") || undefined,
      };
      if (dati.telefono) conTelefono++;
      if (dati.email) conEmail++;
      const tel = soloCifre(dati.telefono ?? "").slice(-9);
      const match = (tel && perTelefono.get(tel)) || perNome.get(nome.trim().toLowerCase());
      if (match) {
        // Integra SOLO i campi vuoti: l'import non sovrascrive mai ciò che c'è già.
        const daAggiornare: Partial<Cliente> = {};
        for (const k of ["telefono", "email", "codice_fiscale", "piva", "indirizzo", "cap", "comune", "provincia", "note"] as const) {
          if (dati[k] && !match[k]) daAggiornare[k] = dati[k];
        }
        if (Object.keys(daAggiornare).length) {
          aggiornaCliente(match.id, daAggiornare);
          aggiornati++;
        } else {
          saltati++;
          salta("già presente e completo");
        }
      } else {
        const nuovo = creaCliente({ nome: nome.slice(0, 120), ...dati });
        const nTel = soloCifre(nuovo.telefono ?? "").slice(-9);
        if (nTel) perTelefono.set(nTel, nuovo);
        perNome.set(nuovo.nome.trim().toLowerCase(), nuovo);
        importati++;
      }
    }
    logEvento({ tipo: "import", descrizione: `Import clienti da "${stage.nome_file}"${sistemaNome ? ` (${sistemaNome})` : ""}: ${importati} nuovi, ${aggiornati} integrati.` });
    return {
      ok: true, destinazione: "clienti", sistema: sistemaNome, totale: stage.righe.length,
      importati, aggiornati, saltati, motivi_salto: motivi,
      analisi: { con_telefono: conTelefono, con_email: conEmail },
    };
  }

  if (opz.destinazione === "appuntamenti") {
    if (idx.inizio === undefined && idx.data === undefined)
      return { ok: false, errore: "mappa_incompleta: serve la colonna della data (inizio, oppure data + ora)." };
    const clienti = db().prepare("SELECT * FROM clienti WHERE tenant_id = ?").all(T()) as Cliente[];
    const perTelefono = new Map<string, Cliente>();
    const perNome = new Map<string, Cliente>();
    for (const c of clienti) {
      const tel = soloCifre(c.telefono ?? "").slice(-9);
      if (tel) perTelefono.set(tel, c);
      perNome.set(c.nome.trim().toLowerCase(), c);
    }
    const esistenti = db()
      .prepare("SELECT cliente_id, inizio, titolo FROM appuntamenti WHERE tenant_id = ? AND stato != 'cancellato'")
      .all(T()) as { cliente_id: number | null; inizio: string; titolo: string }[];
    const visti = new Set(esistenti.map((a) => `${a.cliente_id ?? a.titolo.toLowerCase()}|${a.inizio}`));

    const durataDefault = opz.durata_min_default && opz.durata_min_default > 0 ? opz.durata_min_default : 60;
    const durate: number[] = [];
    const perGiorno = new Map<string, number>();
    const perOra = new Map<string, number>();
    const perTitolo = new Map<string, number>();
    const clientiDistinti = new Set<string>();
    let dal: string | null = null;
    let al: string | null = null;
    const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

    for (const riga of stage.righe) {
      const grezzo = idx.inizio !== undefined ? val(riga, "inizio") : val(riga, "data");
      const d = parseData(grezzo);
      if (!d) {
        saltati++;
        salta("data non riconosciuta");
        continue;
      }
      const ora = d.ora ?? (idx.ora !== undefined ? parseOra(val(riga, "ora")) : null);
      if (!ora) {
        saltati++;
        salta("manca l'ora (importale come entita_esterne se è solo storico)");
        continue;
      }
      const inizio = `${d.data}T${ora}`;
      const durata = Number(soloCifre(val(riga, "durata_min"))) || durataDefault;
      const nomeCliente = val(riga, "cliente_nome");
      let cliente: Cliente | undefined;
      if (nomeCliente) {
        cliente = perNome.get(nomeCliente.trim().toLowerCase());
        if (!cliente) {
          // Il cliente dello storico non esiste ancora: si crea (solo nome), così
          // la storia resta collegata a una scheda vera.
          cliente = creaCliente({ nome: nomeCliente.slice(0, 120) });
          perNome.set(cliente.nome.trim().toLowerCase(), cliente);
        }
      }
      const titolo = val(riga, "titolo") || (nomeCliente ? `Appuntamento — ${nomeCliente}` : "Appuntamento importato");
      const chiave = `${cliente?.id ?? titolo.toLowerCase()}|${inizio}`;
      if (visti.has(chiave)) {
        saltati++;
        salta("appuntamento già presente");
        continue;
      }
      visti.add(chiave);
      creaAppuntamento({
        cliente_id: cliente?.id ?? null,
        titolo: titolo.slice(0, 160),
        inizio,
        fine: sommaMinuti(inizio, durata),
        stato: "confermato",
        note: val(riga, "note") || (sistemaNome ? `Importato da ${sistemaNome}` : "Importato"),
      });
      importati++;
      // Statistiche per l'adattamento.
      durate.push(durata);
      const giorno = GIORNI[new Date(inizio).getDay()];
      perGiorno.set(giorno, (perGiorno.get(giorno) ?? 0) + 1);
      perOra.set(ora.slice(0, 2) + ":00", (perOra.get(ora.slice(0, 2) + ":00") ?? 0) + 1);
      perTitolo.set(titolo.toLowerCase(), (perTitolo.get(titolo.toLowerCase()) ?? 0) + 1);
      if (nomeCliente) clientiDistinti.add(nomeCliente.trim().toLowerCase());
      if (!dal || d.data < dal) dal = d.data;
      if (!al || d.data > al) al = d.data;
    }
    const top = (m: Map<string, number>, n: number) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} (${v})`);
    logEvento({ tipo: "import", descrizione: `Import appuntamenti da "${stage.nome_file}"${sistemaNome ? ` (${sistemaNome})` : ""}: ${importati} importati.` });
    return {
      ok: true, destinazione: "appuntamenti", sistema: sistemaNome, totale: stage.righe.length,
      importati, aggiornati, saltati, motivi_salto: motivi,
      analisi: {
        periodo: dal && al ? `${dal} → ${al}` : null,
        durata_media_min: durate.length ? Math.round(durate.reduce((s, x) => s + x, 0) / durate.length) : null,
        giorni_frequenti: top(perGiorno, 3),
        orari_frequenti: top(perOra, 3),
        prestazioni_frequenti: top(perTitolo, 5),
        clienti_distinti: clientiDistinti.size || null,
      },
    };
  }

  // entita_esterne — tutto ciò che non è anagrafica/agenda: ordini, pratiche,
  // schede, interventi… Le colonne NON mappate finiscono nei dettagli (dati),
  // così non si perde nulla del gestionale d'origine.
  if (!connessioneId)
    return { ok: false, errore: "serve_sistema: indica il software di provenienza (sistema) per le entità esterne." };
  const colonneMappate = new Set(Object.values(idx));
  const tipi = new Map<string, number>();
  for (let r = 0; r < stage.righe.length; r++) {
    const riga = stage.righe[r];
    const titolo = val(riga, "titolo") || riga.find((c) => c.trim()) || null;
    if (!titolo) {
      saltati++;
      salta("riga vuota");
      continue;
    }
    const dettagli: Record<string, string> = {};
    stage.colonne.forEach((c, i) => {
      if (!colonneMappate.has(i) && riga[i]) dettagli[c] = riga[i];
    });
    const chiave = val(riga, "chiave_esterna") || `${stage.nome_file}#${r + 1}`;
    const tipo = (opz.tipo_entita ?? "altro").trim() || "altro";
    upsertEntitaEsterna({
      connessione_id: connessioneId,
      tipo,
      chiave_esterna: chiave,
      titolo: String(titolo).slice(0, 160),
      dati: Object.keys(dettagli).length ? dettagli : null,
      cliente_nome: val(riga, "cliente_nome") || null,
      riferimento: val(riga, "riferimento") || null,
    });
    importati++;
    tipi.set(tipo, (tipi.get(tipo) ?? 0) + 1);
  }
  logEvento({ tipo: "import", descrizione: `Import entità da "${stage.nome_file}" (${sistemaNome}): ${importati} registrate.` });
  return {
    ok: true, destinazione: "entita_esterne", sistema: sistemaNome, totale: stage.righe.length,
    importati, aggiornati, saltati, motivi_salto: motivi,
    analisi: { tipi: [...tipi.entries()].map(([k, v]) => `${k} (${v})`) },
  };
}
