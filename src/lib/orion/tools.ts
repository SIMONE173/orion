import type Anthropic from "@anthropic-ai/sdk";
import type { Vista, Azione } from "./views";
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
  getDocumento,
  cercaDocumenti,
  eliminaDocumento,
  eliminaNota,
  eliminaCliente,
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

type Esito = { result: unknown; vista?: Vista; azione?: Azione };
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
  {
    name: "apri",
    description:
      "Apre un sito o un'app web sullo schermo dell'utente, in una nuova scheda (come Jarvis). Usalo per: 'apri Gmail', 'apri YouTube e metti un video di X', 'metti musica di X', 'cerca X su Google', 'apri Maps e cerca Y', 'apri il calendario', 'apri Drive', 'apri il sito Z'. Scegli 'app' fra: gmail, youtube, musica, google, maps, calendario, drive, sito. Per un sito qualsiasi usa app='sito' e metti l'indirizzo in 'url'. In 'query' metti cosa cercare o riprodurre. NON apre file locali del computer (non è possibile da browser): se l'utente chiede un file del PC, spiega con garbo che serve la versione desktop di ORION.",
    input_schema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          enum: ["gmail", "youtube", "musica", "google", "maps", "calendario", "drive", "sito"],
        },
        query: { type: "string", description: "Cosa cercare o riprodurre" },
        url: { type: "string", description: "Indirizzo completo, solo per app='sito'" },
      },
      required: ["app"],
    },
  },
  {
    name: "apri_appunti",
    description:
      "Apre la MODALITÀ APPUNTI: una lavagna a schermo dove l'utente DETTA e ORION scrive in tempo reale. Usalo per 'prendimi appunti', 'apri un foglio note', 'scrivi quello che dico', 'appuntati una cosa'. Opzionali: 'titolo' degli appunti e 'cliente_nome' a cui collegarli. Dopo l'apertura l'utente detta liberamente; per salvarli dirà 'salva come PDF' o 'salva su ORION' (o userà i pulsanti). Tu apri e basta, con una frase breve ('Ti ascolto, detta pure').",
    input_schema: {
      type: "object",
      properties: {
        titolo: { type: "string" },
        cliente_nome: { type: "string" },
        cliente_id: { type: "integer" },
      },
    },
  },
  {
    name: "elimina_documento",
    description:
      "Elimina un documento archiviato. Usalo per 'elimina il documento X', 'cestina il file Y'. Identificalo con 'id' (se lo conosci) o con 'titolo' (cerco io). CHIEDI SEMPRE CONFERMA all'utente prima di chiamarlo. Se più documenti corrispondono, ti restituisco i candidati: chiedi quale.",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" }, titolo: { type: "string" } },
    },
  },
  {
    name: "elimina_cliente",
    description:
      "Elimina un cliente e lo scollega dai suoi dati. Usalo per 'elimina il cliente X'. CHIEDI SEMPRE CONFERMA prima. Gli omonimi vengono gestiti: se più clienti corrispondono, chiedi quale.",
    input_schema: {
      type: "object",
      properties: { cliente_nome: { type: "string" }, cliente_id: { type: "integer" } },
    },
  },
  {
    name: "elimina_nota",
    description:
      "Elimina una nota dato il suo 'id'. CHIEDI SEMPRE CONFERMA prima di chiamarlo.",
    input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "apri_documento",
    description:
      "Apre il VISORE di un documento/foto a schermo intero (immagine + testo digitalizzato). Usalo per 'apri la foto di X', 'apri il documento di Rossi', 'fammi vedere il referto di Y'. Identifica con 'id' oppure con 'titolo'/'cliente_nome' (cerco io). Opzionale 'cerca': una parola da evidenziare subito nel testo. Se più documenti corrispondono, ti do i candidati: chiedi quale.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        titolo: { type: "string" },
        cliente_nome: { type: "string" },
        cerca: { type: "string" },
      },
    },
  },
  {
    name: "zoom_documento",
    description:
      "Mentre un documento/foto è aperto nel visore, ne regola lo zoom. 'verso': 'avvicina' (zoom in), 'allontana' (zoom out), 'reset'. Usalo per 'zooma', 'ingrandisci', 'dezooma', 'rimpicciolisci', 'torna normale'.",
    input_schema: {
      type: "object",
      properties: { verso: { type: "string", enum: ["avvicina", "allontana", "reset"] } },
      required: ["verso"],
    },
  },
  {
    name: "cerca_documento",
    description:
      "Mentre un documento è aperto nel visore, cerca ed evidenzia una parola/frase nel suo testo. Usalo per 'trovami la riga dove si parla di X', 'cerca X nel documento', 'dove dice Y'.",
    input_schema: { type: "object", properties: { testo: { type: "string" } }, required: ["testo"] },
  },
  {
    name: "vai_in_pausa",
    description:
      "Mette ORION in modalità RIPOSO/standby. Usalo per 'riposati', 'vai in pausa', 'mettiti in standby', 'a dopo', 'ci sentiamo dopo'. Saluta brevemente; l'utente ti risveglierà battendo le mani due volte o toccando lo schermo.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "risolvi_matematica",
    description:
      "Apre la LAVAGNA e mostra la soluzione PASSO-PASSO di un problema matematico (operazioni complesse, espressioni, algebra, equazioni, derivate, integrali, percentuali, geometria…). Usalo quando l'utente chiede di calcolare/risolvere/spiegare il procedimento di qualcosa di matematico. RISOLVI TU il problema e passa: 'titolo' (il problema in chiaro), 'passi' (ogni passo con 'latex' = l'espressione in notazione LaTeX, SENZA simboli di dollaro, e 'spiegazione' = cosa fai a parole), e 'risultato' (in LaTeX). A voce di' solo il risultato e una frase di sintesi: i dettagli li mostra la lavagna.",
    input_schema: {
      type: "object",
      properties: {
        titolo: { type: "string" },
        passi: {
          type: "array",
          items: {
            type: "object",
            properties: {
              latex: { type: "string", description: "Espressione in LaTeX, senza $ " },
              spiegazione: { type: "string" },
            },
          },
        },
        risultato: { type: "string", description: "Risultato finale in LaTeX" },
      },
      required: ["titolo", "passi"],
    },
  },
  {
    name: "mostra_mappa",
    description:
      "Mostra una MAPPA dentro ORION (non apre Google Maps). Usalo quando l'utente dice 'mostrami/fammi vedere la mappa di X', 'dove si trova X', 'trova i bar/tabacchi/farmacie vicino a X' SENZA citare un'app o un sito. 'luogo' = città/indirizzo da centrare; 'cerca' (opzionale) = categoria di posti vicini (es. bar, tabacchi, farmacia, ristorante, supermercato, distributore, bancomat, hotel, banca, parcheggio, ospedale). NB: se l'utente dice 'aprimi Google Maps' o 'su maps', NON usare questo: usa 'apri'.",
    input_schema: {
      type: "object",
      properties: {
        luogo: { type: "string" },
        cerca: { type: "string", description: "Categoria di posti vicini (opzionale)" },
      },
      required: ["luogo"],
    },
  },
  {
    name: "mostra_notizie",
    description:
      "Mostra le ULTIME NOTIZIE dentro ORION (non apre un sito). Usalo quando l'utente dice 'che notizie ci sono', 'ultime notizie', 'novità su X', 'cosa succede con Y' SENZA citare un sito/app. 'argomento' (opzionale) = il tema su cui cercare (es. 'Inter', 'borsa', 'intelligenza artificiale'); se manca, dà le notizie principali del giorno. Dopo aver ricevuto i titoli, RIASSUMI tu a voce i 2-3 fatti principali in modo naturale (non leggere tutti i titoli). NB: se l'utente cita un sito ('aprimi il Corriere', 'vai su ANSA'), NON usare questo: usa 'apri'.",
    input_schema: {
      type: "object",
      properties: {
        argomento: { type: "string", description: "Tema su cui cercare le notizie (opzionale)" },
      },
    },
  },
  {
    name: "mostra_quotazione",
    description:
      "Mostra il PREZZO e il GRAFICO di una crypto, azione o ETF dentro ORION. Usalo per 'quanto vale il bitcoin', 'andamento di Apple', 'grafico Ethereum', 'come va Tesla', 'prezzo ETF X'. 'nome' = il nome/termine (es. 'Bitcoin', 'Apple', 'Tesla'); 'categoria' = 'crypto' per criptovalute, 'azione' per azioni ed ETF; 'simbolo' (opzionale, solo per azioni/ETF) = il ticker se lo conosci (es. 'AAPL', 'TSLA'). IMPORTANTE: tu fornisci SOLO dati e informazioni generali con un breve commento neutro; NON dai MAI consigli d'investimento personalizzati (non sei abilitato) — se te li chiedono, declina gentilmente e rimanda a un consulente.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        categoria: { type: "string", enum: ["crypto", "azione"] },
        simbolo: { type: "string", description: "Ticker per azioni/ETF (opzionale)" },
      },
      required: ["nome", "categoria"],
    },
  },
  {
    name: "mostra_sport",
    description:
      "Mostra CLASSIFICHE e RISULTATI sportivi (calcio) dentro ORION. Usalo per 'classifica di Serie A', 'come ha giocato l'Inter', 'prossima partita del Milan', 'risultati Premier League'. Imposta 'tipo'='classifica' con 'lega' (es. 'Serie A', 'Premier League', 'Liga', 'Bundesliga', 'Champions League') oppure 'tipo'='squadra' con 'squadra' (es. 'Inter', 'Juventus'). A voce commenta in breve i dati. NB: i risultati IN TEMPO REALE (minuto per minuto) e le formazioni non sono disponibili nella versione gratuita: se li chiedono, spiegalo e offri classifica/ultimi risultati.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["classifica", "squadra"] },
        lega: { type: "string", description: "Nome del campionato (per tipo=classifica)" },
        squadra: { type: "string", description: "Nome della squadra (per tipo=squadra)" },
      },
      required: ["tipo"],
    },
  },
  {
    name: "guarda_foto",
    description:
      "Apre la fotocamera (o caricamento immagine) per far DESCRIVERE a ORION una foto. Usalo quando l'utente dice 'descrivimi una foto', 'guarda questa immagine e dimmi cosa c'è', 'cosa vedi in questa foto'. Dopo che l'utente scatta/carica, riceverai l'immagine e dovrai descrivere a parole, in modo naturale, cosa si vede. A voce di' una frase tipo 'Inquadra pure la foto'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "riassumi_link",
    description:
      "Scarica il contenuto di un LINK (articolo, pagina web, o video di YouTube) e te lo restituisce come testo, così puoi RIASSUMERLO a voce. Usalo per 'riassumimi questo articolo/pagina/video: <url>', 'di cosa parla questo link'. Passa 'url' completo. Dopo aver ricevuto il testo, fai un riassunto chiaro e sintetico (i punti principali). NB: per i video di YouTube i sottotitoli a volte non sono accessibili: se manca il testo, dillo con naturalezza.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "URL completo della pagina o del video" } },
      required: ["url"],
    },
  },
  {
    name: "crea_schema",
    description:
      "Crea uno SCHEMA (mappa/scaletta) su un argomento e lo mostra a schermo, condivisibile e salvabile. Usalo per 'fammi uno schema su X', 'schematizza Y', 'mappa concettuale di Z'. Genera tu i contenuti e passa: 'titolo' (l'argomento), e 'rami' = i punti principali, ognuno con 'titolo' e una lista 'punti' di sotto-concetti brevi. Tieni i rami concisi (3-7) e i punti sintetici. A voce di' che hai preparato lo schema, senza leggerlo tutto.",
    input_schema: {
      type: "object",
      properties: {
        titolo: { type: "string" },
        rami: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titolo: { type: "string" },
              punti: { type: "array", items: { type: "string" } },
            },
            required: ["titolo"],
          },
        },
      },
      required: ["titolo", "rami"],
    },
  },
  {
    name: "apri_file_locale",
    description:
      "SOLO versione DESKTOP: trova e apre un FILE o cartella sul computer dell'utente, cercandolo per nome nelle cartelle principali (Scrivania, Documenti, Download…). Usalo per 'apri il file X', 'trovami e apri il documento Y'. Passa il nome (anche parziale) in 'nome'.",
    input_schema: { type: "object", properties: { nome: { type: "string" } }, required: ["nome"] },
  },
  {
    name: "apri_app",
    description:
      "SOLO versione DESKTOP: lancia un'applicazione INSTALLATA sul computer. Usalo per 'apri Spotify', 'apri Word', 'apri Calcolatrice'. Passa il nome dell'app in 'nome'. (Per siti web usa invece lo strumento 'apri'.)",
    input_schema: { type: "object", properties: { nome: { type: "string" } }, required: ["nome"] },
  },
  {
    name: "elimina_file_locale",
    description:
      "SOLO versione DESKTOP: sposta nel CESTINO un file del computer, trovandolo per nome. Usalo per 'elimina/cestina il file X'. CHIEDI SEMPRE CONFERMA prima. Passa il nome in 'nome'.",
    input_schema: { type: "object", properties: { nome: { type: "string" } }, required: ["nome"] },
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

  apri: (input) => {
    const q = encodeURIComponent((input.query ?? "").trim());
    let url = "";
    let etichetta = "";
    switch (input.app) {
      case "gmail":
        url = q ? `https://mail.google.com/mail/u/0/#search/${q}` : "https://mail.google.com";
        etichetta = "Gmail";
        break;
      case "youtube":
        url = q ? `https://www.youtube.com/results?search_query=${q}` : "https://www.youtube.com";
        etichetta = q ? `YouTube: ${input.query}` : "YouTube";
        break;
      case "musica":
        url = q ? `https://music.youtube.com/search?q=${q}` : "https://music.youtube.com";
        etichetta = q ? `Musica: ${input.query}` : "Musica";
        break;
      case "google":
        url = q ? `https://www.google.com/search?q=${q}` : "https://www.google.com";
        etichetta = q ? `Google: ${input.query}` : "Google";
        break;
      case "maps":
        url = q ? `https://www.google.com/maps/search/${q}` : "https://www.google.com/maps";
        etichetta = "Maps";
        break;
      case "calendario":
        url = "https://calendar.google.com";
        etichetta = "Calendario";
        break;
      case "drive":
        url = q ? `https://drive.google.com/drive/search?q=${q}` : "https://drive.google.com";
        etichetta = "Drive";
        break;
      case "sito": {
        let u = (input.url ?? input.query ?? "").trim();
        if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
        url = u;
        etichetta = u;
        break;
      }
    }
    if (!url) return { result: { ok: false, errore: "Non ho capito cosa aprire." } };
    return {
      result: { ok: true, aperto: etichetta, url },
      azione: { tipo: "apri_url", url, etichetta },
    };
  },

  apri_appunti: (input) => {
    let cliente_id: number | null = input.cliente_id ?? null;
    if (!cliente_id && input.cliente_nome) {
      const found = cercaCliente(String(input.cliente_nome));
      if (found.length === 1) cliente_id = found[0].id;
    }
    return {
      result: { ok: true, modalita: "appunti" },
      azione: { tipo: "modalita_appunti", titolo: input.titolo ?? null, cliente_id },
    };
  },

  elimina_documento: (input) => {
    let id: number | null = input.id ?? null;
    if (!id && input.titolo) {
      const found = cercaDocumenti(String(input.titolo));
      if (found.length === 0) return { result: { ok: false, errore: "Nessun documento trovato con quel nome." } };
      if (found.length > 1) {
        return {
          result: {
            ok: false,
            chiedi: "quale",
            candidati: found.map((d) => ({ id: d.id, titolo: d.titolo, cliente: d.cliente_nome })),
          },
          vista: { tipo: "documenti", dati: { documenti: found } },
        };
      }
      id = found[0].id;
    }
    if (!id) return { result: { ok: false, errore: "Quale documento devo eliminare?" } };
    const ok = eliminaDocumento(id);
    return { result: { ok, eliminato: ok }, vista: { tipo: "documenti", dati: { documenti: listDocumenti() } } };
  },

  elimina_cliente: (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    if (!cliente) return { result: { ok: false, errore: "Quale cliente devo eliminare?" } };
    const ok = eliminaCliente(cliente.id);
    return {
      result: { ok, eliminato: cliente.nome },
      vista: { tipo: "clienti", titolo: "Clienti", dati: { clienti: listClienti() } },
    };
  },

  elimina_nota: (input) => {
    const ok = eliminaNota(input.id);
    return { result: { ok }, vista: { tipo: "note", dati: { note: listNote() } } };
  },

  apri_documento: (input) => {
    let id: number | null = input.id ?? null;
    if (id && !getDocumento(id)) id = null;
    if (!id) {
      const q = String(input.titolo ?? input.cliente_nome ?? "").trim();
      if (!q) return { result: { ok: false, errore: "Quale documento devo aprire?" } };
      const found = cercaDocumenti(q);
      if (found.length === 0) return { result: { ok: false, errore: "Nessun documento trovato." } };
      if (found.length > 1) {
        return {
          result: {
            ok: false,
            chiedi: "quale",
            candidati: found.map((d) => ({ id: d.id, titolo: d.titolo, cliente: d.cliente_nome })),
          },
          vista: { tipo: "documenti", dati: { documenti: found } },
        };
      }
      id = found[0].id;
    }
    const doc = getDocumento(id)!;
    return {
      result: { ok: true, documento: { id: doc.id, titolo: doc.titolo, ha_immagine: Boolean(doc.immagine) } },
      azione: { tipo: "apri_documento", documento_id: id, cerca: input.cerca ?? undefined },
    };
  },

  zoom_documento: (input) => ({
    result: { ok: true, verso: input.verso },
    azione: { tipo: "zoom_documento", verso: input.verso },
  }),

  cerca_documento: (input) => ({
    result: { ok: true, cerca: input.testo },
    azione: { tipo: "cerca_documento", testo: String(input.testo ?? "") },
  }),

  vai_in_pausa: () => ({ result: { ok: true, standby: true }, azione: { tipo: "riposo" } }),

  guarda_foto: () => ({
    result: { ok: true, fotocamera: "aperta", nota: "Quando arriva la foto, descrivila a parole in modo naturale." },
    azione: { tipo: "apri_camera", modo: "descrizione" },
  }),

  riassumi_link: async (input) => {
    const url = String(input.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return { result: { ok: false, errore: "Dammi un link valido (http...)." } };
    const UA =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
    const unescapeHtml = (s: string) =>
      s
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&amp;/g, "&");

    try {
      const ytId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)?.[1];

      // VIDEO YouTube: tentativo best-effort sui sottotitoli (a volte bloccati).
      if (ytId) {
        try {
          const pag = await fetch(`https://www.youtube.com/watch?v=${ytId}`, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(9000),
          });
          const htmlPag = await pag.text();
          const titoloYt = unescapeHtml(htmlPag.match(/<title>([^<]*)<\/title>/)?.[1] ?? "Video");
          const tracks = JSON.parse(htmlPag.match(/"captionTracks":(\[.*?\])/)?.[1] ?? "[]") as {
            baseUrl: string;
            languageCode: string;
            kind?: string;
          }[];
          const scelta =
            tracks.find((t) => t.languageCode === "it" && t.kind !== "asr") ??
            tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ??
            tracks.find((t) => t.languageCode === "it") ??
            tracks.find((t) => t.languageCode === "en") ??
            tracks[0];
          if (scelta) {
            const sub = await fetch(`${scelta.baseUrl}&fmt=json3`, {
              headers: { "User-Agent": UA },
              signal: AbortSignal.timeout(9000),
            });
            const j = (await sub.json()) as { events?: { segs?: { utf8?: string }[] }[] };
            const testo = (j.events ?? [])
              .flatMap((e) => e.segs ?? [])
              .map((s) => s.utf8 ?? "")
              .join("")
              .replace(/\s+/g, " ")
              .trim();
            if (testo.length > 40) {
              return { result: { ok: true, tipo: "video", titolo: titoloYt, testo: testo.slice(0, 12000) } };
            }
          }
          return {
            result: {
              ok: false,
              errore: "Per questo video i sottotitoli non sono accessibili, quindi non riesco a riassumerlo.",
            },
          };
        } catch {
          return { result: { ok: false, errore: "Non riesco ad accedere al testo di questo video." } };
        }
      }

      // PAGINA/ARTICOLO: scarico e ripulisco l'HTML.
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
      if (!res.ok) return { result: { ok: false, errore: "Non riesco ad aprire questo link." } };
      let h = await res.text();
      const titolo = unescapeHtml(h.match(/<title>([^<]*)<\/title>/)?.[1] ?? url);
      h = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ");
      const art = h.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
      if (art) h = art[1];
      const testo = unescapeHtml(h.replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      if (testo.length < 120) return { result: { ok: false, errore: "Questa pagina non ha abbastanza testo da riassumere." } };
      return { result: { ok: true, tipo: "pagina", titolo, testo: testo.slice(0, 12000) } };
    } catch (e) {
      console.error("[riassumi_link]", e instanceof Error ? e.message : e);
      return { result: { ok: false, errore: "Contenuto non disponibile al momento." } };
    }
  },

  crea_schema: (input) => {
    const rami = Array.isArray(input.rami) ? input.rami : [];
    return {
      result: { ok: true, rami: rami.length },
      vista: { tipo: "schema", dati: { titolo: String(input.titolo ?? "Schema"), rami } },
    };
  },

  mostra_mappa: async (input) => {
    const luogo = String(input.luogo ?? "").trim();
    if (!luogo) return { result: { ok: false, errore: "Quale luogo?" } };
    try {
      // Geocoding a due livelli, gratis e senza chiave:
      // 1) Open-Meteo (language=it) per le CITTÀ — gestisce gli esonimi italiani
      //    (Londra→London, Parigi→Paris) e dà la popolazione per scegliere la più rilevante.
      // 2) Photon/Komoot come fallback per i MONUMENTI/luoghi (Colosseo, Duomo…).
      let lat: number | undefined;
      let lon: number | undefined;
      let nome = luogo;
      try {
        const omRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?count=5&language=it&format=json&name=${encodeURIComponent(luogo)}`,
          { signal: AbortSignal.timeout(8000) }
        );
        const om = (await omRes.json()) as {
          results?: { latitude: number; longitude: number; name: string; admin1?: string; country?: string; population?: number }[];
        };
        if (om.results?.length) {
          const best = [...om.results].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
          lat = best.latitude;
          lon = best.longitude;
          nome = [best.name, best.admin1, best.country].filter(Boolean).join(", ");
        }
      } catch {
        /* Open-Meteo non raggiungibile: passo a Photon */
      }
      if (lat === undefined || lon === undefined) {
        const gRes = await fetch(`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(luogo)}`, {
          signal: AbortSignal.timeout(8000),
        });
        const g = (await gRes.json()) as {
          features?: {
            geometry: { coordinates: [number, number] };
            properties: { name?: string; city?: string; country?: string };
          }[];
        };
        const hit = g.features?.[0];
        if (!hit) return { result: { ok: false, errore: `Non ho trovato "${luogo}".` } };
        lon = hit.geometry.coordinates[0];
        lat = hit.geometry.coordinates[1];
        const pr = hit.properties;
        nome = [pr.name, pr.city && pr.city !== pr.name ? pr.city : null, pr.country].filter(Boolean).join(", ");
      }

      let poi: { nome: string; lat: number; lon: number }[] = [];
      const cerca = input.cerca ? String(input.cerca).toLowerCase().trim() : "";
      if (cerca) {
        // Ogni categoria ha il filtro Overpass (preciso) e il tag OSM per Photon (fallback).
        const CAT: Record<string, { op: string; tag: string }> = {
          bar: { op: '["amenity"~"bar|cafe|pub"]', tag: "amenity:bar" },
          caff: { op: '["amenity"~"cafe|bar"]', tag: "amenity:cafe" },
          tabacc: { op: '["shop"="tobacco"]', tag: "shop:tobacco" },
          farmac: { op: '["amenity"="pharmacy"]', tag: "amenity:pharmacy" },
          ristor: { op: '["amenity"="restaurant"]', tag: "amenity:restaurant" },
          pizz: { op: '["amenity"="restaurant"]', tag: "amenity:restaurant" },
          supermerc: { op: '["shop"="supermarket"]', tag: "shop:supermarket" },
          benzin: { op: '["amenity"="fuel"]', tag: "amenity:fuel" },
          distributor: { op: '["amenity"="fuel"]', tag: "amenity:fuel" },
          bancomat: { op: '["amenity"="atm"]', tag: "amenity:atm" },
          atm: { op: '["amenity"="atm"]', tag: "amenity:atm" },
          ospedal: { op: '["amenity"="hospital"]', tag: "amenity:hospital" },
          hotel: { op: '["tourism"="hotel"]', tag: "tourism:hotel" },
          banc: { op: '["amenity"="bank"]', tag: "amenity:bank" },
          parchegg: { op: '["amenity"="parking"]', tag: "amenity:parking" },
        };
        const key = Object.keys(CAT).find((k) => cerca.includes(k));
        const cat = key ? CAT[key] : null;
        if (cat) {
          // Distanza in metri (haversine) per filtrare i risultati del fallback.
          const distM = (la1: number, lo1: number, la2: number, lo2: number) => {
            const R = 6371000;
            const dLa = ((la2 - la1) * Math.PI) / 180;
            const dLo = ((lo2 - lo1) * Math.PI) / 180;
            const a =
              Math.sin(dLa / 2) ** 2 +
              Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
            return 2 * R * Math.asin(Math.sqrt(a));
          };

          // 1) Overpass (preciso, raggio 1.8km) con più mirror + User-Agent.
          //    L'istanza pubblica a volte rate-limita/va in timeout: best-effort.
          const q = `[out:json][timeout:15];(node${cat.op}(around:1800,${lat},${lon});way${cat.op}(around:1800,${lat},${lon}););out center 25;`;
          const MIRRORS = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
          ];
          for (const url of MIRRORS) {
            try {
              const opRes = await fetch(url, {
                method: "POST",
                body: "data=" + encodeURIComponent(q),
                // undici (fetch di Node) NON manda lo User-Agent di default: senza,
                // Overpass risponde 406. Va messo a mano.
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Accept: "application/json",
                  "User-Agent": "ORION/1.0 (https://orion-production-5ddd.up.railway.app)",
                },
                // Se un mirror si impalla, lo molliamo e proviamo il successivo.
                signal: AbortSignal.timeout(12000),
              });
              const ct = opRes.headers.get("content-type") ?? "";
              if (!opRes.ok || !ct.includes("json")) {
                console.error("[mostra_mappa overpass]", url, opRes.status, ct);
                continue;
              }
              const od = (await opRes.json()) as {
                elements?: { tags?: { name?: string }; lat?: number; lon?: number; center?: { lat: number; lon: number } }[];
              };
              poi = (od.elements ?? [])
                .map((e) => ({
                  nome: e.tags?.name ?? String(input.cerca),
                  lat: e.lat ?? e.center?.lat,
                  lon: e.lon ?? e.center?.lon,
                }))
                .filter((p): p is { nome: string; lat: number; lon: number } =>
                  typeof p.lat === "number" && typeof p.lon === "number"
                )
                .slice(0, 25);
              if (poi.length) break;
            } catch (e) {
              console.error("[mostra_mappa overpass]", url, e instanceof Error ? e.message : e);
            }
          }

          // 2) Fallback affidabile: Photon (lo stesso geocoder) con tag OSM + bias
          //    geografico. Tiene solo i risultati entro ~3km, ordinati per vicinanza.
          if (!poi.length) {
            try {
              const pRes = await fetch(
                `https://photon.komoot.io/api/?limit=20&lat=${lat}&lon=${lon}&osm_tag=${encodeURIComponent(cat.tag)}&q=${encodeURIComponent(String(input.cerca))}`,
                { signal: AbortSignal.timeout(8000) }
              );
              const pd = (await pRes.json()) as {
                features?: { geometry: { coordinates: [number, number] }; properties: { name?: string } }[];
              };
              poi = (pd.features ?? [])
                .map((f) => ({
                  nome: f.properties?.name ?? String(input.cerca),
                  lat: f.geometry.coordinates[1],
                  lon: f.geometry.coordinates[0],
                }))
                .filter((p) => distM(lat, lon, p.lat, p.lon) <= 3000)
                .sort((a, b) => distM(lat, lon, a.lat, a.lon) - distM(lat, lon, b.lat, b.lon))
                .slice(0, 15);
            } catch (e) {
              console.error("[mostra_mappa photon-poi]", e instanceof Error ? e.message : e);
            }
          }
        }
      }
      return {
        result: { ok: true, luogo: nome, trovati: poi.length },
        vista: {
          tipo: "mappa",
          dati: { luogo: nome, lat, lon, zoom: cerca ? 14 : 12, cerca: input.cerca ?? null, poi },
        },
      };
    } catch (e) {
      console.error("[mostra_mappa]", e instanceof Error ? e.message : e);
      return { result: { ok: false, errore: "Mappa non disponibile al momento." } };
    }
  },

  mostra_notizie: async (input) => {
    const argomento = input.argomento ? String(input.argomento).trim() : "";
    // Google News RSS: gratis, senza chiave, qualsiasi argomento, fonti italiane.
    const url = argomento
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(argomento)}&hl=it&gl=IT&ceid=IT:it`
      : `https://news.google.com/rss?hl=it&gl=IT&ceid=IT:it`;
    const unescape = (s: string) =>
      s
        .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .trim();
    try {
      const res = await fetch(url, {
        // undici (fetch di Node) non manda User-Agent: alcuni feed lo richiedono.
        headers: { "User-Agent": "ORION/1.0 (+https://orion-production-5ddd.up.railway.app)" },
        signal: AbortSignal.timeout(9000),
      });
      const xml = await res.text();
      const blocchi = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
      const articoli = blocchi
        .map((b) => {
          const titoloRaw = b.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
          const fonte = unescape(b.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "");
          const titolo = unescape(titoloRaw).replace(new RegExp(`\\s*-\\s*${fonte}\\s*$`), "");
          const dataRaw = b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
          const link = unescape(b.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
          return {
            titolo,
            fonte: fonte || "Notizie",
            data: dataRaw ? new Date(dataRaw).toISOString() : null,
            url: link,
          };
        })
        .filter((a) => a.titolo)
        .slice(0, 7);

      if (!articoli.length) {
        return { result: { ok: false, errore: "Nessuna notizia trovata al momento." } };
      }
      return {
        // I titoli servono al modello per RIASSUMERE a voce i fatti principali.
        result: { ok: true, argomento: argomento || null, titoli: articoli.map((a) => `${a.titolo} (${a.fonte})`) },
        vista: { tipo: "notizie", dati: { argomento: argomento || null, articoli } },
      };
    } catch (e) {
      console.error("[mostra_notizie]", e instanceof Error ? e.message : e);
      return { result: { ok: false, errore: "Notizie non disponibili al momento." } };
    }
  },

  mostra_quotazione: async (input) => {
    const nome = String(input.nome ?? "").trim();
    const categoria = input.categoria === "azione" ? "azione" : "crypto";
    if (!nome) return { result: { ok: false, errore: "Quale titolo?" } };

    try {
      if (categoria === "crypto") {
        // undici (fetch di Node) non manda User-Agent: alcuni servizi lo richiedono.
        const headers = { "User-Agent": "Mozilla/5.0 (compatible; ORION/1.0)", Accept: "application/json" };

        // 1) Risolvi nome → id/simbolo/nome con CoinGecko search; se fallisce (su cloud
        //    spesso rate-limita), uso una mappa di riserva delle crypto più comuni.
        let id: string | null = null;
        let simbolo: string | null = null;
        let nomeCoin = nome;
        try {
          const sRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(nome)}`, {
            headers,
            signal: AbortSignal.timeout(7000),
          });
          if (sRes.ok) {
            const s = (await sRes.json()) as { coins?: { id: string; name: string; symbol: string }[] };
            const coin = s.coins?.[0];
            if (coin) {
              id = coin.id;
              simbolo = coin.symbol.toUpperCase();
              nomeCoin = coin.name;
            }
          }
        } catch {
          /* search non disponibile: uso la mappa */
        }
        if (!simbolo) {
          const MAP: Record<string, string> = {
            bitcoin: "BTC", btc: "BTC", ethereum: "ETH", eth: "ETH", ether: "ETH",
            solana: "SOL", sol: "SOL", cardano: "ADA", ada: "ADA", dogecoin: "DOGE", doge: "DOGE",
            ripple: "XRP", xrp: "XRP", litecoin: "LTC", ltc: "LTC", polkadot: "DOT", dot: "DOT",
            bnb: "BNB", binance: "BNB", tron: "TRX", trx: "TRX", avalanche: "AVAX", avax: "AVAX",
            polygon: "MATIC", matic: "MATIC", chainlink: "LINK", link: "LINK", "shiba inu": "SHIB", shib: "SHIB",
          };
          const k = nome.toLowerCase();
          simbolo = MAP[k] ?? (/^[a-z]{2,6}$/i.test(nome) ? nome.toUpperCase() : null);
          if (!simbolo) return { result: { ok: false, errore: `Non ho trovato la crypto "${nome}".` } };
        }

        let prezzo: number | undefined;
        let variazione: number | null = null;
        let serie: number[] = [];

        // 2) Prezzo + grafico: prima CoinGecko (se ho l'id), poi Coinbase come fallback.
        if (id) {
          try {
            const pRes = await fetch(
              `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=eur&include_24hr_change=true`,
              { headers, signal: AbortSignal.timeout(7000) }
            );
            if (pRes.ok) {
              const p = (await pRes.json()) as Record<string, { eur?: number; eur_24h_change?: number }>;
              if (typeof p[id]?.eur === "number") {
                prezzo = p[id]!.eur;
                variazione = p[id]?.eur_24h_change ?? null;
                try {
                  const cRes = await fetch(
                    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=eur&days=30&interval=daily`,
                    { headers, signal: AbortSignal.timeout(8000) }
                  );
                  if (cRes.ok) {
                    const c = (await cRes.json()) as { prices?: [number, number][] };
                    serie = (c.prices ?? []).map((x) => x[1]).filter((n) => typeof n === "number");
                  }
                } catch {
                  /* grafico best-effort */
                }
              }
            }
          } catch {
            /* CoinGecko ko: passo a Coinbase */
          }
        }

        if (prezzo === undefined) {
          // Coinbase: gratis, senza chiave, in EUR, affidabile dai server cloud.
          try {
            const spot = await fetch(`https://api.coinbase.com/v2/prices/${simbolo}-EUR/spot`, {
              headers,
              signal: AbortSignal.timeout(7000),
            });
            const sj = (await spot.json()) as { data?: { amount?: string } };
            const amt = parseFloat(sj.data?.amount ?? "");
            if (!Number.isNaN(amt)) {
              prezzo = amt;
              try {
                const cRes = await fetch(
                  `https://api.exchange.coinbase.com/products/${simbolo}-EUR/candles?granularity=86400`,
                  { headers, signal: AbortSignal.timeout(8000) }
                );
                if (cRes.ok) {
                  // [time, low, high, open, close, volume], dal più recente al più vecchio.
                  const candele = (await cRes.json()) as number[][];
                  if (Array.isArray(candele) && candele.length) {
                    serie = candele.map((x) => x[4]).reverse().slice(-30);
                    if (candele.length > 1 && candele[1][4]) {
                      variazione = ((candele[0][4] - candele[1][4]) / candele[1][4]) * 100;
                    }
                  }
                }
              } catch {
                /* grafico best-effort */
              }
            }
          } catch {
            /* anche Coinbase ko */
          }
        }

        if (prezzo === undefined) {
          return { result: { ok: false, errore: "Quotazione crypto non disponibile al momento." } };
        }

        return {
          result: { ok: true, nome: nomeCoin, simbolo, prezzo, valuta: "EUR", variazione24h: variazione },
          vista: {
            tipo: "finanza",
            dati: {
              nome: nomeCoin,
              simbolo,
              categoria: "crypto",
              valuta: "EUR",
              prezzo,
              variazione,
              periodo: "30 giorni",
              serie,
            },
          },
        };
      }

      // Azioni/ETF: Twelve Data (chiave gratuita). Spento finché non c'è la chiave.
      const key = process.env.TWELVEDATA_KEY;
      if (!key) {
        return {
          result: {
            ok: false,
            gated: true,
            errore:
              "Le azioni e gli ETF richiedono una chiave gratuita (Twelve Data) non ancora configurata. Le crypto invece te le mostro subito.",
          },
        };
      }
      const sym = (input.simbolo ? String(input.simbolo) : nome).trim();
      const tsRes = await fetch(
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=1day&outputsize=60&apikey=${key}`,
        { signal: AbortSignal.timeout(9000) }
      );
      const ts = (await tsRes.json()) as {
        status?: string;
        meta?: { symbol?: string; currency?: string };
        values?: { datetime: string; close: string }[];
        message?: string;
      };
      if (ts.status === "error" || !ts.values?.length) {
        return { result: { ok: false, errore: `Non ho trovato il titolo "${sym}".` } };
      }
      // Twelve Data restituisce dal più recente al più vecchio: invertiamo.
      const serie = ts.values
        .map((v) => parseFloat(v.close))
        .filter((n) => !Number.isNaN(n))
        .reverse();
      const prezzo = serie[serie.length - 1];
      const primo = serie[0];
      const variazione = primo ? ((prezzo - primo) / primo) * 100 : null;

      return {
        result: {
          ok: true,
          nome,
          simbolo: ts.meta?.symbol ?? sym.toUpperCase(),
          prezzo,
          valuta: ts.meta?.currency ?? "USD",
          variazionePeriodo: variazione,
        },
        vista: {
          tipo: "finanza",
          dati: {
            nome,
            simbolo: ts.meta?.symbol ?? sym.toUpperCase(),
            categoria: "azione",
            valuta: ts.meta?.currency ?? "USD",
            prezzo,
            variazione,
            periodo: "60 giorni",
            serie,
          },
        },
      };
    } catch (e) {
      console.error("[mostra_quotazione]", e instanceof Error ? e.message : e);
      return { result: { ok: false, errore: "Quotazione non disponibile al momento." } };
    }
  },

  mostra_sport: async (input) => {
    const KEY = process.env.SPORTSDB_KEY || "3"; // chiave di test gratuita
    const base = `https://www.thesportsdb.com/api/v1/json/${KEY}`;
    const tipo = input.tipo === "squadra" ? "squadra" : "classifica";
    // Stagione corrente: da luglio in poi è anno-anno+1.
    const oggi = new Date();
    const annoA = oggi.getMonth() >= 6 ? oggi.getFullYear() : oggi.getFullYear() - 1;
    const stagione = `${annoA}-${annoA + 1}`;

    const LEGHE: { re: RegExp; id: string; nome: string }[] = [
      { re: /serie\s*a/i, id: "4332", nome: "Serie A" },
      { re: /serie\s*b/i, id: "4396", nome: "Serie B" },
      { re: /premier/i, id: "4328", nome: "Premier League" },
      { re: /liga|spagn/i, id: "4335", nome: "La Liga" },
      { re: /bundes|tedesc/i, id: "4331", nome: "Bundesliga" },
      { re: /ligue|franc/i, id: "4334", nome: "Ligue 1" },
      { re: /champions|coppa dei campioni/i, id: "4480", nome: "Champions League" },
    ];

    try {
      if (tipo === "classifica") {
        const q = String(input.lega ?? "Serie A");
        const lega = LEGHE.find((l) => l.re.test(q)) ?? LEGHE[0];
        const res = await fetch(`${base}/lookuptable.php?l=${lega.id}&s=${stagione}`, {
          signal: AbortSignal.timeout(9000),
        });
        const d = (await res.json()) as {
          table?: { intRank: string; strTeam: string; intPoints: string; strBadge?: string }[];
        };
        const classifica = (d.table ?? []).map((r) => ({
          pos: parseInt(r.intRank, 10),
          squadra: r.strTeam,
          punti: parseInt(r.intPoints, 10),
          logo: r.strBadge ? `${r.strBadge}/tiny` : null,
        }));
        if (!classifica.length) {
          return { result: { ok: false, errore: `Classifica di ${lega.nome} non disponibile ora.` } };
        }
        return {
          result: {
            ok: true,
            lega: lega.nome,
            stagione,
            top: classifica.slice(0, 5).map((r) => `${r.pos}. ${r.squadra} (${r.punti} pt)`),
          },
          vista: {
            tipo: "sport",
            dati: { titolo: lega.nome, sottotitolo: `Stagione ${stagione}`, classifica, partite: [] },
          },
        };
      }

      // tipo === "squadra"
      const nomeQ = String(input.squadra ?? "").trim();
      if (!nomeQ) return { result: { ok: false, errore: "Quale squadra?" } };
      const sRes = await fetch(`${base}/searchteams.php?t=${encodeURIComponent(nomeQ)}`, {
        signal: AbortSignal.timeout(9000),
      });
      const s = (await sRes.json()) as {
        teams?: { idTeam: string; strTeam: string; strLeague: string; strSport: string; strBadge?: string }[];
      };
      const calcio = (s.teams ?? []).filter((t) => t.strSport === "Soccer");
      // Preferiamo una squadra di un campionato europeo noto (evita omonimie esotiche).
      const team = calcio.find((t) => LEGHE.some((l) => l.re.test(t.strLeague))) ?? calcio[0];
      if (!team) return { result: { ok: false, errore: `Non ho trovato la squadra "${nomeQ}".` } };

      const [lastRes, nextRes] = await Promise.all([
        fetch(`${base}/eventslast.php?id=${team.idTeam}`, { signal: AbortSignal.timeout(9000) }),
        fetch(`${base}/eventsnext.php?id=${team.idTeam}`, { signal: AbortSignal.timeout(9000) }),
      ]);
      const last = (await lastRes.json()) as {
        results?: { dateEvent: string; strEvent: string; intHomeScore: string; intAwayScore: string }[];
      };
      const next = (await nextRes.json()) as { events?: { dateEvent: string; strEvent: string }[] };

      const partite = [
        ...(last.results ?? []).slice(0, 3).map((e) => ({
          data: e.dateEvent ?? null,
          titolo: e.strEvent,
          punteggio:
            e.intHomeScore != null && e.intAwayScore != null ? `${e.intHomeScore} - ${e.intAwayScore}` : null,
          stato: "Conclusa",
        })),
        ...(next.events ?? []).slice(0, 2).map((e) => ({
          data: e.dateEvent ?? null,
          titolo: e.strEvent,
          punteggio: null,
          stato: "In programma",
        })),
      ];
      if (!partite.length) {
        return { result: { ok: false, errore: `Nessuna partita trovata per ${team.strTeam}.` } };
      }
      return {
        result: {
          ok: true,
          squadra: team.strTeam,
          campionato: team.strLeague,
          partite: partite.map((p) => `${p.titolo}${p.punteggio ? ` ${p.punteggio}` : ""} (${p.stato})`),
        },
        vista: {
          tipo: "sport",
          dati: { titolo: team.strTeam, sottotitolo: team.strLeague, classifica: [], partite },
        },
      };
    } catch (e) {
      console.error("[mostra_sport]", e instanceof Error ? e.message : e);
      return { result: { ok: false, errore: "Dati sportivi non disponibili al momento." } };
    }
  },

  risolvi_matematica: (input) => {
    const passi = Array.isArray(input.passi) ? input.passi : [];
    return {
      result: { ok: true, risultato: input.risultato ?? null },
      vista: {
        tipo: "lavagna",
        dati: { titolo: String(input.titolo ?? "Problema"), passi, risultato: input.risultato },
      },
    };
  },

  apri_file_locale: (input) => ({
    result: { ok: true, richiesto: input.nome },
    azione: { tipo: "apri_file", query: String(input.nome ?? "") },
  }),

  apri_app: (input) => ({
    result: { ok: true, app: input.nome },
    azione: { tipo: "apri_app", nome: String(input.nome ?? "") },
  }),

  elimina_file_locale: (input) => ({
    result: { ok: true, richiesto: input.nome },
    azione: { tipo: "cestina_file", query: String(input.nome ?? "") },
  }),
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
