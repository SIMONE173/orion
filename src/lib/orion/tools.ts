import type Anthropic from "@anthropic-ai/sdk";
import type { Vista } from "./views";
import type { Cliente } from "../data";
import {
  getProfilo,
  aggiornaProfilo,
  listClienti,
  cercaCliente,
  getCliente,
  creaCliente,
  schedaCliente,
  listAppuntamenti,
  creaAppuntamento,
  spostaAppuntamento,
  eliminaAppuntamento,
  aggiornaStatoAppuntamento,
  trovaConflitti,
  getAppuntamento,
  creaNota,
  listNote,
  registraPagamento,
  analisiEconomica,
  logCommunication,
  listComunicazioni,
  prossimoNumeroFattura,
  creaFattura,
  briefingOggi,
  creaPromemoria,
  listPromemoria,
  completaPromemoria,
  creaDocumento,
  listDocumenti,
  aggiungiAttesa,
  listAttesa,
  rimuoviAttesa,
  analisiProattiva,
  statoAbbonamento,
} from "../data";
import { inviaMessaggioWhatsApp } from "../whatsapp";

// Contesto del turno: dati extra disponibili agli strumenti (es. immagine allegata).
export type TurnoContext = { allegato?: { dataUrl: string } };

// ──────────────────────────────────────────────────────────────────────────
// Strumenti che ORION può invocare. Ogni handler ritorna:
//   result → JSON restituito al modello come tool_result
//   vista? → pannello da mostrare a schermo (focus totale / split)
// ──────────────────────────────────────────────────────────────────────────

type Esito = { result: unknown; vista?: Vista };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (input: any, ctx: TurnoContext) => Esito | Promise<Esito>;

// ── Helper ──────────────────────────────────────────────────────────────────

function localISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
}

function addMinutes(iso: string, min: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + min);
  return localISO(d);
}

function oggi(): string {
  return new Date().toISOString().slice(0, 10);
}

type ClienteLite = { id: number; nome: string };
type Risolto = { cliente: ClienteLite | null } | { chiedi: Esito };

// Quando un nome è ambiguo (es. due "Rossi") NON sceglie a caso: chiede quale.
function buildAskClienti(candidati: Cliente[], nome: string): Esito {
  return {
    result: {
      ok: false,
      serve_chiarimento: true,
      motivo: `Più clienti corrispondono a "${nome}"`,
      candidati: candidati.map((c) => ({ id: c.id, nome: c.nome, telefono: c.telefono })),
    },
    vista: { tipo: "clienti", titolo: `Quale "${nome}"?`, dati: { clienti: candidati } },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function risolvi(input: any): Risolto {
  if (input?.cliente_id) {
    const c = getCliente(Number(input.cliente_id));
    return { cliente: c ? { id: c.id, nome: c.nome } : null };
  }
  if (input?.cliente_nome) {
    const nome = String(input.cliente_nome).trim();
    const found = cercaCliente(nome);
    const exact = found.filter((c) => c.nome.toLowerCase() === nome.toLowerCase());
    if (exact.length === 1) return { cliente: { id: exact[0].id, nome: exact[0].nome } };
    if (found.length === 1) return { cliente: { id: found[0].id, nome: found[0].nome } };
    if (found.length > 1) return { chiedi: buildAskClienti(found, nome) };
    return { cliente: null }; // nessun cliente con questo nome
  }
  return { cliente: null };
}

// Spazi liberi in un giorno (orario di lavoro 9:00–19:00) della durata richiesta.
function slotLiberi(data: string, durata: number) {
  const appuntamenti = listAppuntamenti(data, data).sort((a, b) => a.inizio.localeCompare(b.inizio));
  const slots: { inizio: string; fine: string }[] = [];
  let cursore = new Date(`${data}T09:00`);
  const fineGiornata = new Date(`${data}T19:00`);
  for (const a of appuntamenti) {
    const ai = new Date(a.inizio);
    if (ai.getTime() - cursore.getTime() >= durata * 60000) {
      slots.push({ inizio: localISO(cursore), fine: localISO(ai) });
    }
    const af = new Date(a.fine);
    if (af > cursore) cursore = af;
  }
  if (fineGiornata.getTime() - cursore.getTime() >= durata * 60000) {
    slots.push({ inizio: localISO(cursore), fine: localISO(fineGiornata) });
  }
  return { appuntamenti, slots };
}

function rangeFromPreset(preset?: string, da?: string, a?: string): { da: string; a: string } {
  if (da && a) return { da, a };
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case "oggi":
      return { da: fmt(now), a: fmt(now) };
    case "settimana": {
      const start = new Date(now);
      const day = (start.getDay() + 6) % 7; // lunedì = 0
      start.setDate(start.getDate() - day);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { da: fmt(start), a: fmt(end) };
    }
    case "mese_scorso": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { da: fmt(start), a: fmt(end) };
    }
    case "anno": {
      return { da: `${now.getFullYear()}-01-01`, a: `${now.getFullYear()}-12-31` };
    }
    case "mese":
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { da: fmt(start), a: fmt(end) };
    }
  }
}

// ── Definizioni degli strumenti (schema) ────────────────────────────────────

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "aggiorna_profilo",
    description:
      "Salva o aggiorna i dati del professionista nella memoria operativa (Chiamata 0 e oltre): come chiamarlo, professione, durata media visita, gestione cancellazioni, canale comunicazione, problemi che fanno perdere tempo, abitudini, e dati fiscali (P.IVA, codice fiscale, indirizzo, regime fiscale, PEC, SDI). Imposta onboarding_completo a 1 SOLO quando hai raccolto abbastanza per iniziare a lavorare.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Come l'utente vuole essere chiamato" },
        professione: { type: "string" },
        durata_visita_min: { type: "integer", description: "Durata media di una visita in minuti" },
        gestione_cancellazioni: { type: "string" },
        canale_comunicazione: { type: "string" },
        problemi_tempo: { type: "string" },
        abitudini: { type: "string", description: "Note libere sul metodo di lavoro" },
        piva: { type: "string" },
        codice_fiscale: { type: "string" },
        indirizzo: { type: "string" },
        regime_fiscale: { type: "string" },
        pec: { type: "string" },
        sdi: { type: "string" },
        onboarding_completo: { type: "integer", enum: [0, 1] },
      },
    },
  },
  {
    name: "mostra_agenda",
    description:
      "Mostra l'agenda degli appuntamenti in un intervallo di date. Senza parametri mostra oggi. Usalo ogni volta che l'utente vuole vedere l'agenda o gli impegni.",
    input_schema: {
      type: "object",
      properties: {
        data_da: { type: "string", description: "Data inizio YYYY-MM-DD" },
        data_a: { type: "string", description: "Data fine YYYY-MM-DD" },
      },
    },
  },
  {
    name: "crea_appuntamento",
    description:
      "Crea un nuovo appuntamento. Rileva automaticamente i conflitti. Fornisci 'inizio' (YYYY-MM-DDTHH:MM) e 'fine' oppure 'durata_min'. Collega il cliente con cliente_nome o cliente_id se possibile.",
    input_schema: {
      type: "object",
      properties: {
        titolo: { type: "string" },
        inizio: { type: "string", description: "YYYY-MM-DDTHH:MM" },
        fine: { type: "string", description: "YYYY-MM-DDTHH:MM (opzionale se dai durata_min)" },
        durata_min: { type: "integer" },
        cliente_nome: { type: "string" },
        cliente_id: { type: "integer" },
        stato: { type: "string", enum: ["confermato", "da_confermare"] },
        note: { type: "string" },
      },
      required: ["titolo", "inizio"],
    },
  },
  {
    name: "sposta_appuntamento",
    description: "Sposta un appuntamento esistente a un nuovo orario.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        nuovo_inizio: { type: "string", description: "YYYY-MM-DDTHH:MM" },
        nuova_fine: { type: "string" },
        durata_min: { type: "integer" },
      },
      required: ["id", "nuovo_inizio"],
    },
  },
  {
    name: "elimina_appuntamento",
    description: "Cancella un appuntamento dato il suo id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },
  {
    name: "conferma_appuntamento",
    description: "Imposta lo stato di un appuntamento a 'confermato'.",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },
  {
    name: "trova_slot_liberi",
    description:
      "Trova gli spazi liberi in agenda in un giorno, per riempire buchi o proporre orari. Orario di lavoro 9:00–19:00.",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "YYYY-MM-DD" },
        durata_min: { type: "integer", description: "Durata richiesta in minuti" },
      },
      required: ["data"],
    },
  },
  {
    name: "lista_clienti",
    description: "Mostra l'elenco dei clienti.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "cerca_cliente",
    description: "Cerca clienti per nome o telefono.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "scheda_cliente",
    description:
      "Apre la scheda completa di un cliente (dati, appuntamenti, pagamenti, comunicazioni, note). Usa cliente_id o cliente_nome.",
    input_schema: {
      type: "object",
      properties: { cliente_id: { type: "integer" }, cliente_nome: { type: "string" } },
    },
  },
  {
    name: "crea_cliente",
    description: "Crea un nuovo cliente.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        telefono: { type: "string" },
        email: { type: "string" },
        note: { type: "string" },
        piva: { type: "string" },
        codice_fiscale: { type: "string" },
        indirizzo: { type: "string" },
      },
      required: ["nome"],
    },
  },
  {
    name: "crea_nota",
    description:
      "Crea una nota/appunto in tempo reale. Può essere collegata a un cliente con cliente_nome.",
    input_schema: {
      type: "object",
      properties: {
        contenuto: { type: "string" },
        titolo: { type: "string" },
        cliente_nome: { type: "string" },
      },
      required: ["contenuto"],
    },
  },
  {
    name: "mostra_note",
    description: "Mostra le ultime note.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "registra_pagamento",
    description:
      "Registra un pagamento (contanti, pos, bonifico, link). Collega il cliente con cliente_nome se indicato.",
    input_schema: {
      type: "object",
      properties: {
        importo: { type: "number" },
        metodo: { type: "string", enum: ["contanti", "pos", "bonifico", "link"] },
        cliente_nome: { type: "string" },
        descrizione: { type: "string" },
        stato: { type: "string", enum: ["incassato", "da_incassare"] },
      },
      required: ["importo", "metodo"],
    },
  },
  {
    name: "analisi_economica",
    description:
      "Analisi degli incassi in un periodo: totale incassato, da incassare, per metodo, clienti top, giorno più redditizio. Usa 'preset' (oggi, settimana, mese, mese_scorso, anno) oppure data_da/data_a.",
    input_schema: {
      type: "object",
      properties: {
        preset: { type: "string", enum: ["oggi", "settimana", "mese", "mese_scorso", "anno"] },
        data_da: { type: "string" },
        data_a: { type: "string" },
      },
    },
  },
  {
    name: "prepara_whatsapp",
    description:
      "Prepara la BOZZA di un messaggio WhatsApp già formalizzato e la mostra per l'approvazione. NON invia. Passa il testo finale formale in 'contenuto' e il destinatario in cliente_nome.",
    input_schema: {
      type: "object",
      properties: {
        cliente_nome: { type: "string" },
        cliente_id: { type: "integer" },
        contenuto: { type: "string", description: "Testo finale, già formalizzato" },
      },
      required: ["contenuto"],
    },
  },
  {
    name: "invia_whatsapp",
    description:
      "Invia il messaggio WhatsApp (simulato: viene registrato come inviato). Usalo SOLO dopo che l'utente ha confermato la bozza.",
    input_schema: {
      type: "object",
      properties: {
        cliente_nome: { type: "string" },
        cliente_id: { type: "integer" },
        contenuto: { type: "string" },
      },
      required: ["contenuto"],
    },
  },
  {
    name: "mostra_messaggi",
    description: "Mostra le comunicazioni WhatsApp, opzionalmente di un singolo cliente.",
    input_schema: {
      type: "object",
      properties: { cliente_nome: { type: "string" }, cliente_id: { type: "integer" } },
    },
  },
  {
    name: "prepara_fattura",
    description:
      "Prepara l'ANTEPRIMA di una fattura usando i dati fiscali del profilo e del cliente. NON emette. Segnala i campi mancanti.",
    input_schema: {
      type: "object",
      properties: {
        cliente_nome: { type: "string" },
        cliente_id: { type: "integer" },
        importo: { type: "number" },
        descrizione: { type: "string" },
      },
      required: ["importo"],
    },
  },
  {
    name: "emetti_fattura",
    description: "Emette la fattura. Usalo SOLO dopo conferma finale dell'utente.",
    input_schema: {
      type: "object",
      properties: {
        cliente_nome: { type: "string" },
        cliente_id: { type: "integer" },
        importo: { type: "number" },
        descrizione: { type: "string" },
      },
      required: ["importo"],
    },
  },
  {
    name: "briefing",
    description:
      "Mostra il briefing operativo della giornata: appuntamenti, da confermare, messaggi, pagamenti in sospeso, clienti inattivi, promemoria.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "analisi_proattiva",
    description:
      "Analizza la situazione e segnala problemi da gestire: appuntamenti non confermati, pagamenti mancanti, clienti inattivi, promemoria in scadenza, buchi in agenda da riempire con la lista d'attesa. Usalo quando l'utente chiede 'cosa devo fare', 'come va', o per essere proattivo.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "crea_promemoria",
    description:
      "Crea un promemoria/attività da ricordare. Categoria tra: attivita, richiamo, commercialista, scadenza, documento, pagamento. Può avere una scadenza (YYYY-MM-DD) e un cliente.",
    input_schema: {
      type: "object",
      properties: {
        testo: { type: "string" },
        categoria: {
          type: "string",
          enum: ["attivita", "richiamo", "commercialista", "scadenza", "documento", "pagamento"],
        },
        scadenza: { type: "string", description: "YYYY-MM-DD" },
        cliente_nome: { type: "string" },
      },
      required: ["testo"],
    },
  },
  {
    name: "mostra_promemoria",
    description: "Mostra i promemoria attivi.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "completa_promemoria",
    description: "Segna un promemoria come completato.",
    input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "chiama",
    description:
      "Avvia una chiamata verso un cliente (cliente_nome) o un contatto (nome + numero). Mostra il pannello chiamata. Su dispositivo apre il telefono; su desktop è dimostrativo.",
    input_schema: {
      type: "object",
      properties: {
        cliente_nome: { type: "string" },
        cliente_id: { type: "integer" },
        nome: { type: "string", description: "Nome del contatto se non è un cliente (es. 'il commercialista')" },
        numero: { type: "string" },
      },
    },
  },
  {
    name: "archivia_documento",
    description:
      "Archivia un documento digitalizzato dalla fotocamera. Quando l'utente inquadra un foglio, TU leggi l'immagine, ricostruisci fedelmente il contenuto del testo e lo passi in 'testo'. Dai un 'titolo' chiaro, scegli un 'tipo' (es. referto, ricevuta, documento, certificato) e collega un cliente se pertinente. L'immagine viene allegata automaticamente.",
    input_schema: {
      type: "object",
      properties: {
        titolo: { type: "string" },
        tipo: { type: "string" },
        testo: { type: "string", description: "Il contenuto ricostruito del documento (OCR)" },
        cliente_nome: { type: "string" },
      },
      required: ["titolo", "testo"],
    },
  },
  {
    name: "mostra_documenti",
    description: "Mostra l'archivio dei documenti digitalizzati.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "aggiungi_attesa",
    description:
      "Aggiunge una persona alla lista d'attesa (per riempire eventuali buchi in agenda). Priorità: alta o normale.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        cliente_nome: { type: "string" },
        motivo: { type: "string" },
        priorita: { type: "string", enum: ["alta", "normale"] },
      },
      required: ["nome"],
    },
  },
  {
    name: "mostra_lista_attesa",
    description: "Mostra la lista d'attesa.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "rimuovi_attesa",
    description: "Rimuove una persona dalla lista d'attesa (es. dopo averle dato un appuntamento).",
    input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "mostra_profilo",
    description:
      "Mostra la memoria operativa: cosa ORION sa del professionista (nome, professione, abitudini) e i dati fiscali. Usalo per 'cosa sai di me', 'mostra il mio profilo', 'aggiorna i miei dati'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "collega_whatsapp",
    description:
      "Avvia il collegamento del numero WhatsApp del professionista (Embedded Signup di Meta). Usalo quando l'utente vuole usare il proprio WhatsApp con te: 'collega WhatsApp', 'connetti il mio numero', 'voglio rispondere ai pazienti da qui', 'attiva WhatsApp'. Mostra a schermo il pannello con il pulsante di collegamento. Login e consenso su Meta li fa l'utente (non automatizzabili): tu apri la schermata e lo guidi a voce, con calma, un passo alla volta.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "mostra_abbonamento",
    description:
      "Mostra il pannello dell'abbonamento (piano, prova gratuita, stato pagamento). Usalo per 'il mio abbonamento', 'quanto manca alla prova', 'voglio abbonarmi', 'gestisci pagamento', 'disdici'. Il pannello contiene i pulsanti per abbonarsi o gestire il pagamento.",
    input_schema: { type: "object", properties: {} },
  },
];

// ── Handler ──────────────────────────────────────────────────────────────────

const handlers: Record<string, Handler> = {
  aggiorna_profilo: (input) => {
    const profilo = aggiornaProfilo(input);
    return { result: { ok: true, profilo } };
  },

  mostra_agenda: (input) => {
    const da = input.data_da || oggi();
    const a = input.data_a || da;
    const appuntamenti = listAppuntamenti(da, a);
    const titolo = da === a ? `Agenda ${da}` : `Agenda ${da} → ${a}`;
    return {
      result: { appuntamenti },
      vista: { tipo: "agenda", titolo, dati: { periodo: { da, a }, appuntamenti } },
    };
  },

  crea_appuntamento: (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;

    const inizioRaw: string = input.inizio || "";
    const haOra = /T\d{2}:\d{2}/.test(inizioRaw);
    // Ora mancante (es. "segnami Rossi per martedì"): proponi uno slot, non inventarlo.
    if (!haOra) {
      const giorno = (inizioRaw && inizioRaw.slice(0, 10)) || input.giorno || oggi();
      const durata = input.durata_min || getProfilo().durata_visita_min || 30;
      const { appuntamenti, slots } = slotLiberi(giorno, durata);
      return {
        result: { ok: false, serve_orario: true, giorno, slot_liberi: slots },
        vista: { tipo: "agenda", titolo: `Agenda ${giorno}`, dati: { periodo: { da: giorno, a: giorno }, appuntamenti } },
      };
    }

    const inizio = inizioRaw;
    const fine = input.fine || addMinutes(inizio, input.durata_min || getProfilo().durata_visita_min || 30);
    const conflitti = trovaConflitti(inizio, fine);
    const app = creaAppuntamento({
      cliente_id: cliente?.id ?? null,
      titolo: input.titolo,
      inizio,
      fine,
      stato: input.stato || "da_confermare",
      note: input.note ?? null,
    });
    const giorno = inizio.slice(0, 10);
    const appuntamenti = listAppuntamenti(giorno, giorno);
    return {
      result: {
        ok: true,
        appuntamento: app,
        conflitti,
        cliente_non_trovato: input.cliente_nome && !cliente ? true : undefined,
      },
      vista: { tipo: "agenda", titolo: `Agenda ${giorno}`, dati: { periodo: { da: giorno, a: giorno }, appuntamenti } },
    };
  },

  sposta_appuntamento: (input) => {
    const esistente = getAppuntamento(Number(input.id));
    if (!esistente) return { result: { ok: false, errore: "Appuntamento non trovato" } };
    const inizio = input.nuovo_inizio;
    const durata =
      input.durata_min ||
      Math.round((new Date(esistente.fine).getTime() - new Date(esistente.inizio).getTime()) / 60000);
    const fine = input.nuova_fine || addMinutes(inizio, durata);
    const conflitti = trovaConflitti(inizio, fine, Number(input.id));
    const app = spostaAppuntamento(Number(input.id), inizio, fine);
    const giorno = inizio.slice(0, 10);
    const appuntamenti = listAppuntamenti(giorno, giorno);
    return {
      result: { ok: true, appuntamento: app, conflitti },
      vista: { tipo: "agenda", titolo: `Agenda ${giorno}`, dati: { periodo: { da: giorno, a: giorno }, appuntamenti } },
    };
  },

  elimina_appuntamento: (input) => {
    const esistente = getAppuntamento(Number(input.id));
    const ok = eliminaAppuntamento(Number(input.id));
    const giorno = esistente?.inizio.slice(0, 10) || oggi();
    const appuntamenti = listAppuntamenti(giorno, giorno);
    return {
      result: { ok },
      vista: { tipo: "agenda", titolo: `Agenda ${giorno}`, dati: { periodo: { da: giorno, a: giorno }, appuntamenti } },
    };
  },

  conferma_appuntamento: (input) => {
    const app = aggiornaStatoAppuntamento(Number(input.id), "confermato");
    const giorno = app?.inizio.slice(0, 10) || oggi();
    const appuntamenti = listAppuntamenti(giorno, giorno);
    return {
      result: { ok: !!app, appuntamento: app },
      vista: { tipo: "agenda", titolo: `Agenda ${giorno}`, dati: { periodo: { da: giorno, a: giorno }, appuntamenti } },
    };
  },

  trova_slot_liberi: (input) => {
    const data = input.data || oggi();
    const durata = input.durata_min || getProfilo().durata_visita_min || 30;
    const { appuntamenti, slots } = slotLiberi(data, durata);
    return {
      result: { data, durata_min: durata, slot_liberi: slots },
      vista: {
        tipo: "agenda",
        titolo: `Agenda ${data}`,
        dati: { periodo: { da: data, a: data }, appuntamenti },
      },
    };
  },

  lista_clienti: () => {
    const clienti = listClienti();
    return {
      result: { clienti: clienti.map((c) => ({ id: c.id, nome: c.nome, telefono: c.telefono })) },
      vista: { tipo: "clienti", titolo: "Clienti", dati: { clienti } },
    };
  },

  cerca_cliente: (input) => {
    const clienti = cercaCliente(String(input.query || ""));
    return {
      result: { clienti: clienti.map((c) => ({ id: c.id, nome: c.nome, telefono: c.telefono })) },
      vista: { tipo: "clienti", titolo: `Risultati: "${input.query}"`, dati: { clienti } },
    };
  },

  scheda_cliente: (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    if (!cliente) return { result: { ok: false, errore: "Cliente non trovato" } };
    const scheda = schedaCliente(cliente.id);
    if (!scheda) return { result: { ok: false, errore: "Cliente non trovato" } };
    return { result: scheda, vista: { tipo: "cliente", dati: scheda } };
  },

  crea_cliente: (input) => {
    const cliente = creaCliente(input);
    const scheda = schedaCliente(cliente.id)!;
    return { result: { ok: true, cliente }, vista: { tipo: "cliente", dati: scheda } };
  },

  crea_nota: (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    creaNota({ contenuto: input.contenuto, titolo: input.titolo ?? null, cliente_id: cliente?.id ?? null });
    const note = listNote();
    return { result: { ok: true }, vista: { tipo: "note", dati: { note } } };
  },

  mostra_note: () => {
    const note = listNote();
    return { result: { note }, vista: { tipo: "note", dati: { note } } };
  },

  registra_pagamento: (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    const pagamento = registraPagamento({
      cliente_id: cliente?.id ?? null,
      importo: Number(input.importo),
      metodo: input.metodo,
      stato: input.stato || "incassato",
      descrizione: input.descrizione ?? null,
    });
    const { da, a } = rangeFromPreset("mese");
    const dati = analisiEconomica(da, a);
    return {
      result: { ok: true, pagamento },
      vista: { tipo: "pagamenti", titolo: "Pagamento registrato — mese in corso", dati },
    };
  },

  analisi_economica: (input) => {
    const { da, a } = rangeFromPreset(input.preset, input.data_da, input.data_a);
    const dati = analisiEconomica(da, a);
    return { result: dati, vista: { tipo: "pagamenti", titolo: `Incassi ${da} → ${a}`, dati } };
  },

  prepara_whatsapp: (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    const messaggi = cliente ? listComunicazioni(cliente.id) : listComunicazioni();
    return {
      result: { ok: true, anteprima: input.contenuto, cliente: cliente?.nome ?? null },
      vista: {
        tipo: "whatsapp",
        dati: {
          cliente: cliente?.nome ?? null,
          messaggi,
          bozza: { contenuto: input.contenuto, cliente: cliente?.nome ?? null },
        },
      },
    };
  },

  invia_whatsapp: async (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    const datiCliente = cliente ? getCliente(cliente.id) : null;
    const numero = datiCliente?.telefono ?? input.numero ?? "";

    const esito = await inviaMessaggioWhatsApp(numero, input.contenuto);
    if (!esito.ok) {
      return {
        result: { ok: false, errore: esito.errore ?? "Invio non riuscito" },
        vista: {
          tipo: "whatsapp",
          dati: {
            cliente: cliente?.nome ?? null,
            messaggi: cliente ? listComunicazioni(cliente.id) : listComunicazioni(),
          },
        },
      };
    }

    logCommunication({
      cliente_id: cliente?.id ?? null,
      direzione: "out",
      tipo: "testo",
      contenuto: input.contenuto,
      stato: "inviato",
    });
    const messaggi = cliente ? listComunicazioni(cliente.id) : listComunicazioni();
    return {
      result: { ok: true, inviato: true, simulato: esito.simulato ?? false },
      vista: { tipo: "whatsapp", dati: { cliente: cliente?.nome ?? null, messaggi } },
    };
  },

  mostra_messaggi: (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    const messaggi = cliente ? listComunicazioni(cliente.id) : listComunicazioni();
    return {
      result: { messaggi },
      vista: { tipo: "whatsapp", dati: { cliente: cliente?.nome ?? null, messaggi } },
    };
  },

  prepara_fattura: (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    const profilo = getProfilo();
    const datiCliente = cliente ? getCliente(cliente.id) : null;
    const campiMancanti: string[] = [];
    if (!cliente) campiMancanti.push("cliente");
    if (!profilo.piva) campiMancanti.push("P.IVA emittente");
    if (datiCliente && !datiCliente.codice_fiscale && !datiCliente.piva)
      campiMancanti.push("codice fiscale/P.IVA del cliente");
    return {
      result: {
        ok: true,
        numero: prossimoNumeroFattura(),
        campiMancanti,
      },
      vista: {
        tipo: "fattura",
        dati: {
          numero: prossimoNumeroFattura(),
          emessa: false,
          cliente: {
            nome: datiCliente?.nome ?? input.cliente_nome ?? "—",
            piva: datiCliente?.piva ?? null,
            codice_fiscale: datiCliente?.codice_fiscale ?? null,
            indirizzo: datiCliente?.indirizzo ?? null,
          },
          emittente: {
            nome: profilo.nome,
            piva: profilo.piva,
            indirizzo: profilo.indirizzo,
            regime_fiscale: profilo.regime_fiscale,
            pec: profilo.pec,
            sdi: profilo.sdi,
          },
          importo: Number(input.importo),
          descrizione: input.descrizione ?? null,
          data: oggi(),
          campiMancanti,
        },
      },
    };
  },

  emetti_fattura: (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    if (!cliente) return { result: { ok: false, errore: "Serve un cliente per emettere la fattura" } };
    const profilo = getProfilo();
    const datiCliente = getCliente(cliente.id)!;
    const fattura = creaFattura({
      cliente_id: cliente.id,
      importo: Number(input.importo),
      descrizione: input.descrizione ?? null,
      stato: "emessa",
    }) as { numero: string; data: string };
    return {
      result: { ok: true, fattura },
      vista: {
        tipo: "fattura",
        dati: {
          numero: fattura.numero,
          emessa: true,
          cliente: {
            nome: datiCliente.nome,
            piva: datiCliente.piva,
            codice_fiscale: datiCliente.codice_fiscale,
            indirizzo: datiCliente.indirizzo,
          },
          emittente: {
            nome: profilo.nome,
            piva: profilo.piva,
            indirizzo: profilo.indirizzo,
            regime_fiscale: profilo.regime_fiscale,
            pec: profilo.pec,
            sdi: profilo.sdi,
          },
          importo: Number(input.importo),
          descrizione: input.descrizione ?? null,
          data: fattura.data,
          campiMancanti: [],
        },
      },
    };
  },

  briefing: () => {
    const dati = briefingOggi();
    return { result: dati, vista: { tipo: "briefing", dati } };
  },

  analisi_proattiva: () => {
    const dati = analisiProattiva();
    return { result: dati, vista: { tipo: "proattiva", dati } };
  },

  crea_promemoria: (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    creaPromemoria({
      testo: input.testo,
      categoria: input.categoria,
      scadenza: input.scadenza ?? null,
      cliente_id: cliente?.id ?? null,
    });
    const promemoria = listPromemoria();
    return { result: { ok: true }, vista: { tipo: "promemoria", dati: { promemoria } } };
  },

  mostra_promemoria: () => {
    const promemoria = listPromemoria();
    return { result: { promemoria }, vista: { tipo: "promemoria", dati: { promemoria } } };
  },

  completa_promemoria: (input) => {
    const ok = completaPromemoria(Number(input.id));
    const promemoria = listPromemoria();
    return { result: { ok }, vista: { tipo: "promemoria", dati: { promemoria } } };
  },

  chiama: (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    const datiCliente = cliente ? getCliente(cliente.id) : null;
    const nome = datiCliente?.nome ?? input.nome ?? "Contatto";
    const numero = datiCliente?.telefono ?? input.numero ?? null;
    return {
      result: { ok: true, nome, numero },
      vista: { tipo: "chiamata", dati: { nome, numero } },
    };
  },

  archivia_documento: (input, ctx) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    const documento = creaDocumento({
      cliente_id: cliente?.id ?? null,
      titolo: input.titolo,
      tipo: input.tipo ?? "documento",
      testo: input.testo ?? null,
      immagine: ctx.allegato?.dataUrl ?? null,
    });
    return { result: { ok: true, id: documento.id }, vista: { tipo: "documento", dati: { documento } } };
  },

  mostra_documenti: () => {
    const documenti = listDocumenti();
    return { result: { documenti }, vista: { tipo: "documenti", dati: { documenti } } };
  },

  aggiungi_attesa: (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    aggiungiAttesa({
      nome: input.nome,
      cliente_id: cliente?.id ?? null,
      motivo: input.motivo ?? null,
      priorita: input.priorita ?? "normale",
    });
    const voci = listAttesa();
    return { result: { ok: true }, vista: { tipo: "attesa", dati: { voci } } };
  },

  mostra_lista_attesa: () => {
    const voci = listAttesa();
    return { result: { voci }, vista: { tipo: "attesa", dati: { voci } } };
  },

  rimuovi_attesa: (input) => {
    const ok = rimuoviAttesa(Number(input.id));
    const voci = listAttesa();
    return { result: { ok }, vista: { tipo: "attesa", dati: { voci } } };
  },

  mostra_profilo: () => {
    const profilo = getProfilo();
    return { result: { profilo }, vista: { tipo: "profilo", dati: { profilo } } };
  },

  collega_whatsapp: () => ({
    result: {
      ok: true,
      azione: "Mostro il pannello di collegamento WhatsApp. L'utente farà login e darà il consenso su Meta; tu guidalo a voce.",
    },
    vista: { tipo: "whatsapp_connect", dati: {} },
  }),

  mostra_abbonamento: () => {
    const stato = statoAbbonamento();
    return { result: { abbonamento: stato }, vista: { tipo: "abbonamento", dati: { stato } } };
  },
};

export async function dispatch(
  name: string,
  input: unknown,
  ctx: TurnoContext = {}
): Promise<Esito> {
  const h = handlers[name];
  if (!h) return { result: { ok: false, errore: `Strumento sconosciuto: ${name}` } };
  try {
    return await h(input, ctx);
  } catch (e) {
    return { result: { ok: false, errore: e instanceof Error ? e.message : String(e) } };
  }
}
