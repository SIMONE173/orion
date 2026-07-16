import type Anthropic from "@anthropic-ai/sdk";
import type { Vista, Azione } from "./views";
import type { Cliente } from "../data";
import { eseguiImport } from "../importa";
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
  aggiornaMemoriaProfilo,
  getAzienda,
  configuraAzienda,
  trovaAziendaPerCodice,
  impara,
  aggiornaApprendimento,
  recallMemoria,
  listMemoria,
  logEvento,
  scriviDiario,
  cercaNeiMessaggi,
  listOrganico,
  aggiornaOrganico,
  trovaMembro,
  creaCompito,
  aggiornaCompito,
  listCompiti,
  passaConsegne,
  briefingAzienda,
  registraConnessione,
  listConnessioni,
  getConnessione,
  upsertEntitaEsterna,
  listEntitaEsterne,
  aggiornaFatturaSdi,
  logAudit,
  listChiamate,
  getCalendarAccount,
  clientiDormienti,
  statisticheValore,
  permessoArea,
  permessiAzienda,
  salvaPermessiArea,
  AREE_PERMESSI,
  lasciaMessaggioTeam,
  messaggiTeamPerUtente,
  segnaMessaggiTeamConsegnati,
  utenteIdPerNome,
  attivaCanaleUscita,
  chiediApprovazione,
  approvazioniPerMe,
  esitiApprovazioniDaComunicare,
  segnaEsitiComunicati,
  decidiApprovazione,
  listApprovazioni,
  giornaleDiBordo,
  type AreaPermessi,
  type ClasseRuolo,
  type VoceMemoria,
  type Compito,
  type EntitaEsterna,
} from "../data";
import { getRisponditore, setRisponditore, attivaPonteManuale, consegneManualiPendenti } from "../data";
import { emailConfigurato, leggiInbox, inviaEmail, getEmailAccount } from "../email";
import { generaFatturaPA, destinoFattura, type ParteFattura } from "../fatturapa";
import { trasmettiFattura, sdiConfigurato } from "../sdi";
import { avviaOffertaSlot } from "../slots";
import {
  setOnboardingUtente,
  setPreferenzeUtente,
  setNomeUtente,
  collegaUtenteAdAzienda,
  getUtente,
} from "../auth";
import { inviaMessaggioWhatsApp } from "../whatsapp";

// Contesto del turno: dati extra disponibili agli strumenti (es. immagine
// allegata) e identità dell'UTENTE che parla (per onboarding/preferenze/azienda
// che sono per-utente, non per-tenant).
export type TurnoContext = { allegato?: { dataUrl: string }; utenteId?: number };

// Normalizza un array di voci di memoria provenienti dal modello.
function leggiVoci(input: unknown): VoceMemoria[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((v): v is VoceMemoria => !!v && typeof v.tema === "string" && typeof v.dettaglio === "string")
    .map((v) => ({ tema: v.tema.trim(), dettaglio: v.dettaglio }));
}

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

// I dati fiscali dell'EMITTENTE della fattura: l'azienda se il tenant è un
// ambiente aziendale, altrimenti il profilo del professionista.
function emittenteFattura(): { emittente: ParteFattura; profilo: ReturnType<typeof getProfilo> } {
  const profilo = getProfilo();
  const azienda = getAzienda();
  const emittente: ParteFattura = azienda
    ? {
        denominazione: azienda.nome,
        piva: azienda.piva,
        codice_fiscale: azienda.codice_fiscale,
        indirizzo: azienda.indirizzo,
        cap: azienda.cap,
        comune: azienda.comune,
        provincia: azienda.provincia,
        pec: azienda.pec,
        regime_fiscale: azienda.regime_fiscale,
      }
    : {
        denominazione: profilo.nome,
        piva: profilo.piva,
        codice_fiscale: profilo.codice_fiscale,
        indirizzo: profilo.indirizzo,
        cap: profilo.cap,
        comune: profilo.comune,
        provincia: profilo.provincia,
        pec: profilo.pec,
        regime_fiscale: profilo.regime_fiscale,
      };
  return { emittente, profilo };
}

// ── Definizioni degli strumenti (schema) ────────────────────────────────────

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "aggiorna_profilo",
    description:
      "Memoria operativa del SINGOLO (autonomo o uso personale). Usalo durante il colloquio iniziale e oltre per salvare ciò che apprendi. Campi fissi: nome (come chiamarlo), professione/settore, tipo_uso (personale|lavoro), tipo_lavoro (autonomo|azienda), e dati fiscali (piva, codice_fiscale, indirizzo, regime_fiscale, pec, sdi) — questi solo se pertinenti. Per TUTTO il resto che modella il modo di lavorare (orari, giorni con regole particolari, gestione urgenze, LIMITI DI AUTONOMIA cioè cosa puoi fare da solo e cosa va confermato, come essere aggiornato, priorità, struttura/elenchi specializzati del settore, ecc.) usa il campo libero 'memoria' come elenco di voci {tema, dettaglio}. NON inventare: salva solo ciò che l'utente ti dice. Imposta onboarding_completo a 1 SOLO quando hai raccolto abbastanza per iniziare a lavorare davvero. NON usare questo per le AZIENDE (usa configura_azienda) né per i dipendenti agganciati a un'azienda (usa salva_preferenze).",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Come l'utente vuole essere chiamato" },
        professione: { type: "string", description: "Professione o settore identificato" },
        tipo_uso: { type: "string", enum: ["personale", "lavoro"] },
        tipo_lavoro: { type: "string", enum: ["autonomo", "azienda"] },
        memoria: {
          type: "array",
          description:
            "Voci di memoria operativa flessibile: orari, regole, gestione urgenze, limiti di autonomia, come essere aggiornato, struttura del settore, ecc.",
          items: {
            type: "object",
            properties: {
              tema: { type: "string", description: "Etichetta breve, es. 'Orari', 'Urgenze', 'Autonomia'" },
              dettaglio: { type: "string", description: "Il contenuto, in linguaggio naturale" },
            },
            required: ["tema", "dettaglio"],
          },
        },
        durata_visita_min: { type: "integer", description: "Durata media di un appuntamento in minuti (se pertinente)" },
        piva: { type: "string" },
        codice_fiscale: { type: "string" },
        indirizzo: { type: "string", description: "Via e numero civico (per la fattura elettronica)" },
        cap: { type: "string", description: "CAP a 5 cifre (serve per la fattura elettronica)" },
        comune: { type: "string" },
        provincia: { type: "string", description: "Sigla, es. MI" },
        regime_fiscale: { type: "string", description: "es. 'forfettario' oppure 'ordinario'" },
        pec: { type: "string" },
        sdi: { type: "string" },
        caparra_importo: {
          type: "number",
          description:
            "Caparra richiesta ai NUOVI appuntamenti in euro (0 = disattivata). Con caparra e link_pagamento impostati, le conferme automatiche (centralino, riempi-buchi) includono la richiesta col link.",
        },
        link_pagamento: {
          type: "string",
          description: "Link di pagamento dello studio (Stripe Payment Link, PayPal.me, Satispay…): dove il cliente versa la caparra",
        },
        onboarding_completo: { type: "integer", enum: [0, 1] },
      },
    },
  },
  {
    name: "configura_azienda",
    description:
      "Crea o aggiorna l'ambiente AZIENDA/TEAM (onboarding Caso B). Alla prima chiamata genera un CODICE AZIENDALE univoco (che poi i dipendenti useranno per agganciarsi): comunicalo all'utente a voce e mostralo nel pannello. Campi identità: nome, settore, dimensioni, sedi, e dati fiscali aziendali (piva, codice_fiscale, indirizzo, regime_fiscale, pec, sdi). Per organigramma, ruoli/gerarchie/responsabili e autorizzazioni, processi (come nasce una richiesta cliente, gestione progetti, flussi, attività ricorrenti), gestione informazioni (dati/documenti chiave, chi vede cosa), comunicazioni e REGOLE OPERATIVE (cosa ORION fa in autonomia e cosa richiede conferma, con eventuali soglie) usa il campo 'memoria' come elenco di voci {tema, dettaglio}. Imposta onboarding_completo a 1 quando l'azienda è abbastanza definita da iniziare.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome dell'azienda" },
        settore: { type: "string" },
        dimensioni: { type: "string", description: "Es. numero di dipendenti / fascia" },
        sedi: { type: "string" },
        memoria: {
          type: "array",
          description: "Organigramma, processi, gestione informazioni, comunicazioni, regole operative.",
          items: {
            type: "object",
            properties: {
              tema: { type: "string" },
              dettaglio: { type: "string" },
            },
            required: ["tema", "dettaglio"],
          },
        },
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
    name: "collega_azienda",
    description:
      "Aggancia l'utente corrente a un'azienda già presente su ORION, tramite il CODICE AZIENDALE che gli ha dato il suo titolare/responsabile. Da quel momento vedrà clienti, agenda e memoria condivisi dell'azienda. Ti restituisce l'azienda riconosciuta: dopo l'aggancio chiedi SOLO le informazioni personali (come chiamarlo, eventuale ruolo/reparto se non già noto, come vuole essere aggiornato) e salvale con salva_preferenze. Usalo quando l'utente dice di far parte di un'azienda/team che già usa ORION.",
    input_schema: {
      type: "object",
      properties: {
        codice: { type: "string", description: "Il codice aziendale, es. ORION-AB12CD" },
        ruolo: { type: "string", description: "Ruolo del dipendente, se lo dichiara" },
        reparto: { type: "string", description: "Reparto, se lo dichiara" },
      },
      required: ["codice"],
    },
  },
  {
    name: "salva_preferenze",
    description:
      "Salva le informazioni e preferenze PERSONALI dell'utente corrente (vale soprattutto per un DIPENDENTE agganciato a un'azienda, le cui preferenze sono individuali e NON vanno nella memoria aziendale condivisa): come vuole essere chiamato, come vuole essere aggiornato durante la giornata, suoi limiti/abitudini individuali. Imposta onboarding_completo a 1 quando il suo onboarding personale è finito.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Come l'utente vuole essere chiamato" },
        ruolo: { type: "string" },
        reparto: { type: "string" },
        preferenze: {
          type: "array",
          description: "Preferenze personali come voci {tema, dettaglio}.",
          items: {
            type: "object",
            properties: {
              tema: { type: "string" },
              dettaglio: { type: "string" },
            },
            required: ["tema", "dettaglio"],
          },
        },
        onboarding_completo: { type: "integer", enum: [0, 1] },
      },
    },
  },
  {
    name: "impara",
    description:
      "Memorizza un'INTUIZIONE durevole sul modo di lavorare dell'utente/azienda (il cuore della memoria viva). Usalo OGNI VOLTA che cogli qualcosa che varrà anche in futuro: una preferenza, un'abitudine, una decisione tipica, un'eccezione a una regola, una priorità, un flusso di lavoro, una procedura sempre seguita, un errore che l'utente tende a evitare, o un fatto importante su un cliente. Salva il COSA in 'contenuto' e, se lo deduci, il PERCHÉ in 'motivo'. Non inventare: salva solo ciò che hai davvero osservato. Se l'intuizione riguarda un cliente/entità, mettine il nome in 'soggetto'.",
    input_schema: {
      type: "object",
      properties: {
        categoria: {
          type: "string",
          enum: ["preferenza", "abitudine", "decisione", "eccezione", "priorita", "flusso", "procedura", "errore_da_evitare", "contesto"],
        },
        soggetto: { type: "string", description: "Nome del cliente/entità a cui si riferisce, oppure ometti se è generale" },
        contenuto: { type: "string", description: "COSA: l'intuizione, in linguaggio naturale" },
        motivo: { type: "string", description: "PERCHÉ, se deducibile" },
        confidenza: { type: "string", enum: ["basso", "medio", "alto"], description: "Quanto sei sicuro (default medio)" },
      },
      required: ["contenuto"],
    },
  },
  {
    name: "aggiorna_apprendimento",
    description:
      "Corregge o fa EVOLVERE un'intuizione già in memoria quando qualcosa cambia nel tempo. Passa l'id (lo trovi con ricorda/mostra_memoria) e: i campi da correggere, oppure superato=true se quell'intuizione non vale più. Usalo per tenere il modello dell'utente sempre aggiornato (es. un'abitudine cambia, una regola si modifica).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        contenuto: { type: "string" },
        motivo: { type: "string" },
        confidenza: { type: "string", enum: ["basso", "medio", "alto"] },
        superato: { type: "boolean", description: "true = l'intuizione non vale più" },
      },
      required: ["id"],
    },
  },
  {
    name: "ricorda",
    description:
      "Richiama dalla memoria ciò che sai su un argomento, un cliente o 'dove eravamo rimasti'. Cerca sia nelle intuizioni (memoria viva) sia nelle conversazioni passate. Usalo per 'cosa sai di Rossi', 'dove eravamo rimasti sul caso X', 'cosa avevamo detto su…'. Ti torna il materiale rilevante, che usi per rispondere con cognizione.",
    input_schema: {
      type: "object",
      properties: {
        argomento: { type: "string", description: "Cliente, tema o parola chiave da richiamare" },
      },
      required: ["argomento"],
    },
  },
  {
    name: "chiudi_giornata",
    description:
      "Lascia una breve nota di 'dove siamo rimasti' nel diario operativo (1-2 frasi): cosa è stato fatto oggi e cosa conta per la prossima volta. Usalo quando l'utente chiude/va in pausa e c'è stato qualcosa di rilevante, così alla prossima apertura riprendi il filo.",
    input_schema: {
      type: "object",
      properties: {
        riassunto: { type: "string", description: "1-2 frasi: dove siamo rimasti e cosa conta per la prossima volta" },
      },
      required: ["riassunto"],
    },
  },
  {
    name: "mostra_memoria",
    description:
      "Mostra a schermo il MODELLO VIVO che hai dell'utente/azienda: ciò che hai imparato sul suo modo di lavorare (preferenze, abitudini, priorità, procedure, eccezioni, errori da evitare). Usalo per 'cosa sai di me', 'cosa hai imparato', 'mostrami la tua memoria del mio lavoro'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "aggiorna_organico",
    description:
      "AZIENDA. Registra o aggiorna una persona dell'organigramma (anche se NON usa ORION). Usalo quando scopri chi lavora in azienda e cosa fa. Salva il ruolo ma soprattutto le RESPONSABILITÀ concrete (es. 'supervisiona 12 operatori, controlla le scadenze delle lavorazioni, va avvisato subito per problemi sulle linee'), il reparto e chi riporta a chi. Se la persona esiste già (stesso nome) la arricchisci.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        ruolo: { type: "string" },
        reparto: { type: "string" },
        responsabilita: { type: "string", description: "Cosa fa e di cosa risponde, in concreto" },
        riporta_a: { type: "string", description: "Nome o ruolo del suo responsabile" },
        contatti: { type: "string" },
        note: { type: "string" },
      },
      required: ["nome"],
    },
  },
  {
    name: "mostra_organico",
    description: "AZIENDA. Mostra a schermo l'organigramma: persone, ruoli, reparti, responsabilità, gerarchie. Usalo per 'chi lavora qui', 'mostrami l'organigramma', 'chi c'è nel reparto X'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "assegna_compito",
    description:
      "AZIENDA. Assegna un'attività a una persona e ne avvia il monitoraggio. Usalo per 'assegna questo progetto a Paolo', 'dai a Marco il compito di…'. Se l'utente chiede aggiornamenti periodici ('aggiornami ogni due giorni') imposta frequenza_giorni. Imposta la scadenza in ISO se indicata.",
    input_schema: {
      type: "object",
      properties: {
        titolo: { type: "string" },
        descrizione: { type: "string" },
        assegnatario: { type: "string", description: "Nome della persona a cui è assegnato" },
        reparto: { type: "string" },
        scadenza: { type: "string", description: "Data/ora ISO YYYY-MM-DD o YYYY-MM-DDTHH:MM" },
        frequenza_giorni: { type: "integer", description: "Ogni quanti giorni vuole un aggiornamento" },
        riferimento: { type: "string", description: "Es. ordine/progetto a cui collegarlo" },
        cliente_nome: { type: "string" },
      },
      required: ["titolo"],
    },
  },
  {
    name: "aggiorna_compito",
    description:
      "AZIENDA. Aggiorna un compito assegnato: cambia stato (in_corso|completato|annullato), registra un avanzamento, sposta la scadenza o cambia assegnatario. Passa l'id (lo trovi con mostra_compiti).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        stato: { type: "string", enum: ["aperto", "in_corso", "completato", "annullato"] },
        avanzamento: { type: "string", description: "Nota di avanzamento da aggiungere" },
        scadenza: { type: "string" },
        assegnatario: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "mostra_compiti",
    description:
      "AZIENDA. Mostra i compiti assegnati, eventualmente filtrati. Usalo per 'cosa deve fare Paolo', 'compiti del reparto produzione', 'cosa è in ritardo' (filtro=da_seguire), 'cosa c'è da fare'.",
    input_schema: {
      type: "object",
      properties: {
        assegnatario: { type: "string" },
        reparto: { type: "string" },
        stato: { type: "string", enum: ["aperto", "in_corso", "completato", "annullato"] },
        filtro: { type: "string", enum: ["attivi", "da_seguire", "tutti"], description: "da_seguire = in ritardo o senza aggiornamenti dovuti" },
      },
    },
  },
  {
    name: "passa_consegne",
    description:
      "AZIENDA. Registra il passaggio di consegne di fine turno: cosa è stato completato, cosa è rimasto in sospeso, i problemi riscontrati e i suggerimenti per chi subentra. Usalo quando l'utente dice 'sto chiudendo il turno', 'passo le consegne'. Al turno successivo ORION riprende da qui.",
    input_schema: {
      type: "object",
      properties: {
        reparto: { type: "string" },
        completato: { type: "string" },
        in_sospeso: { type: "string" },
        problemi: { type: "string" },
        suggerimenti: { type: "string" },
      },
    },
  },
  {
    name: "lascia_messaggio",
    description:
      "AZIENDA — STAFFETTA DEL TEAM. Lascia un messaggio interno a un COLLEGA o a un REPARTO: ORION lo consegna a voce appena quella persona apre ORION, e le manda subito una notifica sul suo dispositivo. Usalo per 'di' a Marco che…', 'lascia detto alla segreteria che…', 'avvisa il magazzino che domani…', 'quando arriva Laura dille che…'. Passa 'destinatario' (nome della persona) OPPURE 'reparto', e il testo del messaggio (fedele a ciò che l'utente vuole dire, senza riscriverlo). urgente=true se va segnalato come urgente. NON è WhatsApp né email (quelli vanno FUORI, ai clienti): questo resta DENTRO il team su ORION. Conferma a voce in una frase ('Riferisco a Marco appena apre ORION').",
    input_schema: {
      type: "object",
      properties: {
        destinatario: { type: "string", description: "Nome del collega (es. 'Marco', 'la dottoressa Bianchi')" },
        reparto: { type: "string", description: "In alternativa: il reparto destinatario (es. 'magazzino', 'segreteria')" },
        testo: { type: "string", description: "Il messaggio da riferire, fedele" },
        urgente: { type: "boolean" },
      },
      required: ["testo"],
    },
  },
  {
    name: "chiedi_approvazione",
    description:
      "AZIENDA — FLUSSO DI APPROVAZIONE. Inoltra una RICHIESTA che per le regole aziendali serve l'ok di qualcuno ('un preventivo oltre 500€ va approvato', 'chiedi al titolare se posso rimandare la consegna'). ORION la porta all'approvatore (briefing + notifica sul suo dispositivo) e riporterà l'esito a chi ha chiesto, in automatico. Passa 'richiesta' (testo chiaro e completo: cosa, per chi, perché, cifre se servono), 'a' (nome dell'approvatore; se non indicato va al TITOLARE), 'riferimento' (es. 'ordine 245') e urgente. USALO ANCHE DI TUA INIZIATIVA: se l'utente ti chiede di fare qualcosa che le regole operative dicono di far approvare, proponi tu di inoltrare la richiesta invece di rifiutare o procedere. A voce conferma in una frase ('Richiesta inoltrata al titolare: ti dico appena risponde').",
    input_schema: {
      type: "object",
      properties: {
        richiesta: { type: "string", description: "La richiesta, completa e chiara" },
        a: { type: "string", description: "Nome dell'approvatore (default: il titolare)" },
        riferimento: { type: "string", description: "Catena/riferimento, es. 'ordine 245'" },
        urgente: { type: "boolean" },
      },
      required: ["richiesta"],
    },
  },
  {
    name: "rispondi_approvazione",
    description:
      "AZIENDA — FLUSSO DI APPROVAZIONE. Registra la DECISIONE su una richiesta in attesa: quando l'approvatore (il destinatario o un titolare) dice 'approvala', 'va bene', 'digli di no', 'negata perché…'. Passa id (lo trovi nel briefing o con mostra_approvazioni), esito ('approvata'|'negata') e una eventuale nota con la motivazione (utile a chi ha chiesto). ORION riporta l'esito al richiedente (briefing + notifica). Se chi parla non è autorizzato a decidere, lo strumento rifiuta: spiegalo con garbo.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number" },
        esito: { type: "string", enum: ["approvata", "negata"] },
        nota: { type: "string", description: "Motivazione/condizioni della decisione" },
      },
      required: ["id", "esito"],
    },
  },
  {
    name: "mostra_approvazioni",
    description:
      "AZIENDA — FLUSSO DI APPROVAZIONE. Elenca le richieste di approvazione: quelle IN ATTESA della decisione dell'utente corrente e le ultime decise. Usalo per 'ho richieste da approvare?', 'a che punto è la mia richiesta?', 'mostrami le approvazioni'. Riassumile a voce (chi chiede, cosa, da quanto), con l'id per decidere.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "giornale_di_bordo",
    description:
      "AZIENDA — GIORNALE DI BORDO. La cronaca di UNA giornata in azienda: cosa è successo (eventi in ordine), compiti creati e completati, consegne di turno con i problemi, approvazioni chieste/decise, quanti appuntamenti. Usalo per 'cosa è successo oggi?', 'com'è andata la giornata?', 'il resoconto di ieri', 'riepilogo della settimana scorsa' (chiamalo per il giorno richiesto, formato YYYY-MM-DD; default oggi). Racconta a voce i 3-4 fatti salienti (problemi prima di tutto) e lascia i dettagli allo schema a schermo. Niente importi: per quelli c'è l'analisi economica (area riservata).",
    input_schema: {
      type: "object",
      properties: { giorno: { type: "string", description: "YYYY-MM-DD (default oggi)" } },
    },
  },
  {
    name: "messaggi_dal_team",
    description:
      "AZIENDA — STAFFETTA DEL TEAM. Mostra i messaggi interni che i colleghi hanno lasciato all'UTENTE CORRENTE e li segna come consegnati. Usalo per 'ho messaggi?', 'qualcuno mi ha lasciato detto qualcosa?', 'novità dai colleghi?'. I messaggi in attesa ti arrivano comunque nel briefing di apertura: questo serve per controllare a metà giornata. Consegnali a voce con naturalezza ('Marco ti ha lasciato detto che…'). NB: NON sono i messaggi WhatsApp dei clienti (per quelli usa mostra_messaggi).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "imposta_permessi",
    description:
      "AZIENDA — SOLO IL TITOLARE. Decide CHI può accedere alle AREE RISERVATE di ORION (la protezione è reale: gli strumenti rifiutano chi non è autorizzato). Aree: 'finanza' (incassi, analisi economica, report di valore), 'pagamenti' (registrare/vedere pagamenti), 'fatture' (preparare/emettere), 'esporta' (esportazione completa dei dati), 'azienda_config' (configurazione azienda e questi stessi permessi). Ruoli: titolare (sempre incluso, non escludibile), responsabile, amministrativo, operatore. Esempi: 'anche i responsabili possono vedere gli incassi' → area=finanza, ruoli=[amministrativo,responsabile]; 'le fatture le gestisco solo io' → area=fatture, ruoli=[]. Usalo anche nel colloquio iniziale quando il titolare spiega chi può vedere cosa. Conferma a voce con chiarezza chi ora accede all'area.",
    input_schema: {
      type: "object",
      properties: {
        area: { type: "string", enum: ["finanza", "pagamenti", "fatture", "esporta", "azienda_config"] },
        ruoli: {
          type: "array",
          items: { type: "string", enum: ["titolare", "responsabile", "amministrativo", "operatore"] },
          description: "Le classi di ruolo ammesse (oltre al titolare, sempre incluso)",
        },
      },
      required: ["area", "ruoli"],
    },
  },
  {
    name: "verbale_riunione",
    description:
      "AZIENDA. Formalizza una riunione: dalle decisioni prese, dalle attività e dalle scadenze emerse, ORION crea i compiti, registra le decisioni come know-how (con il loro perché) e fissa i promemoria, e mostra un riepilogo. Usalo a fine riunione dopo aver preso appunti.",
    input_schema: {
      type: "object",
      properties: {
        titolo: { type: "string" },
        decisioni: {
          type: "array",
          items: { type: "object", properties: { contenuto: { type: "string" }, motivo: { type: "string" } }, required: ["contenuto"] },
        },
        compiti: {
          type: "array",
          items: {
            type: "object",
            properties: { titolo: { type: "string" }, assegnatario: { type: "string" }, scadenza: { type: "string" } },
            required: ["titolo"],
          },
        },
        scadenze: {
          type: "array",
          items: { type: "object", properties: { cosa: { type: "string" }, quando: { type: "string" } }, required: ["cosa"] },
        },
        note: { type: "string" },
      },
    },
  },
  {
    name: "collega_email",
    description:
      "Apre il pannello per collegare la casella email del tenant (IMAP/SMTP con app-password). Usalo quando l'utente vuole gestire le email da ORION ma non l'ha ancora collegata. Spiega che si aprirà un pannello dove inserire indirizzo e password (la password va scritta, non dettata, per sicurezza).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "mostra_email",
    description:
      "Mostra le ultime email della posta in arrivo e ne fa il triage (cosa è ordinario, cosa richiede risposta, cosa è urgente). Usalo per 'controlla le email', 'leggi la posta', 'cosa è arrivato'. Se l'email non è collegata, dillo e proponi collega_email.",
    input_schema: { type: "object", properties: { quante: { type: "integer", description: "Quante email recenti (default 15)" } } },
  },
  {
    name: "prepara_email",
    description:
      "Prepara la BOZZA di un'email (non la invia): mostra l'anteprima e legge il contenuto. L'utente detta il contenuto, tu lo formalizzi in un'email professionale. Dopo la conferma esplicita usa invia_email.",
    input_schema: {
      type: "object",
      properties: {
        a: { type: "string", description: "Destinatario (indirizzo email)" },
        oggetto: { type: "string" },
        corpo: { type: "string" },
      },
      required: ["a", "oggetto", "corpo"],
    },
  },
  {
    name: "invia_email",
    description: "Invia DAVVERO un'email. Usalo SOLO dopo aver preparato la bozza con prepara_email e ottenuto un sì esplicito dall'utente.",
    input_schema: {
      type: "object",
      properties: {
        a: { type: "string" },
        oggetto: { type: "string" },
        corpo: { type: "string" },
      },
      required: ["a", "oggetto", "corpo"],
    },
  },
  {
    name: "collega_sistema",
    description:
      "ECOSISTEMA. Registra un software/strumento esterno che il professionista o l'azienda già usa (gestionale, CRM, ERP, software medico/legale/fiscale/HR, magazzino, ticketing, archivio…), così ORION ne comprende l'ambiente. Salva tipo, nome, COSA contiene e com'è strutturato (descrizione) e le eventuali regole (cosa puoi fare da solo, cosa va confermato). Se l'utente vuole che i dati di quel sistema confluiscano automaticamente in ORION, imposta modalita='ingest': verrà generato un token/URL da configurare nel suo sistema (es. via Zapier). Non sostituisce il software dell'utente: lo affianca.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        tipo: {
          type: "string",
          enum: ["gestionale", "crm", "erp", "medico", "legale", "fiscale", "hr", "produzione", "magazzino", "ticketing", "cloud", "database", "archivio", "altro"],
        },
        descrizione: { type: "string", description: "Cosa contiene e com'è strutturato" },
        regole: { type: "string", description: "Autorizzazioni: cosa ORION può fare da solo, cosa va confermato" },
        modalita: { type: "string", enum: ["descritto", "ingest"], description: "ingest = genera un webhook per ricevere i dati" },
        apertura: { type: "string", description: "COME si apre: il nome dell'app installata (es. 'GesCom') se è un programma, oppure l'indirizzo/URL se è un sito. Serve ad ORION per aprirlo da solo al mattino (routine del mattino su Desktop)." },
      },
      required: ["nome"],
    },
  },
  {
    name: "attiva_scrittura_gestionale",
    description:
      "ECOSISTEMA — CANALE D'USCITA. Fa sì che ORION SCRIVA nel sistema che il professionista già usa. DUE MODI: (1) CON 'url' = webhook https del suo gestionale o di un ponte Zapier/Make → ogni appuntamento creato/spostato/confermato/disdetto e ogni cliente creato/aggiornato parte FIRMATO in automatico (il risultato include il SEGRETO DI FIRMA, mostrato solo una volta: invita a salvarlo). (2) SENZA 'url' = PONTE UNIVERSALE, per QUALSIASI software anche vecchio e senza API: le modifiche si accodano nel pannello Consegne — copia-incolla perfetto con un click, e su Desktop le può scrivere ORION direttamente nel gestionale. Usalo quando l'utente dice 'voglio che gli appuntamenti finiscano anche nel mio gestionale', 'scrivi anche su <sistema>': se non ha webhook/Zapier NON insistere sull'url — proponi il Ponte. Serve 'sistema' (nome GIÀ collegato con collega_sistema). Con disattiva=true spegne tutto. NB per Google Calendar non serve: sincronia nativa a due vie (collega_calendario).",
    input_schema: {
      type: "object",
      properties: {
        sistema: { type: "string", description: "Nome del sistema già collegato (es. 'Cliens')" },
        url: { type: "string", description: "URL https del webhook che riceve gli eventi" },
        disattiva: { type: "boolean", description: "true = spegne la scrittura verso questo sistema" },
      },
      required: ["sistema"],
    },
  },
  {
    name: "mostra_consegne",
    description:
      "PONTE UNIVERSALE — apre il pannello CONSEGNE AL GESTIONALE: la coda delle modifiche (appuntamenti, clienti) da portare nel software del professionista quando il canale d'uscita è in modalità Ponte (senza API). Ogni voce ha il copia-incolla perfetto e la spunta 'fatto'. Usalo quando l'utente chiede 'cosa devo riportare nel gestionale?', 'le consegne', 'la coda', o dopo aver attivato il Ponte, o quando nel briefing noti consegne accumulate.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "configura_risponditore",
    description:
      "SEGRETERIA CLIENTI H24 — il risponditore automatico su WhatsApp (vive sul server: lavora anche a PC spento e di notte). Livelli: 'spenta' = solo i copioni storici (conferme ai promemoria, offerte di slot); 'assistita' = ORION risponde ai clienti (informazioni, prende messaggi con push al professionista) ma NON tocca mai l'agenda; 'autopilota' = in più disdice, sposta e prenota DAVVERO negli orari liberi, e ogni buco liberato viene offerto da solo alla lista d'attesa. Usalo quando l'utente dice 'rispondi tu ai clienti', 'attiva la segreteria notturna', 'metti l'autopilota', 'smetti di rispondere ai clienti'. Senza 'livello' restituisce l'impostazione attuale. PRIMA di attivare l'autopilota ricorda in una frase che ORION potrà modificare l'agenda da solo e chiedi conferma esplicita. Serve WhatsApp collegato perché i messaggi arrivino.",
    input_schema: {
      type: "object",
      properties: {
        livello: { type: "string", enum: ["spenta", "assistita", "autopilota"], description: "Ometti per leggere l'impostazione attuale" },
      },
    },
  },
  {
    name: "imposta_fonte_dati",
    description:
      "ECOSISTEMA / FONTE DI VERITÀ. Stabilisce CHI possiede i dati che ORION mostra in agenda, clienti e briefing. fonte='orion' = ORION È il gestionale del professionista (non ne ha uno, o vuole lavorare qui): i dati nascono e vivono in ORION. fonte='gestionale' = ORION è lo SPECCHIO VIVO del software indicato in 'sistema': la verità sta nel gestionale, ORION la rispecchia (sincronia in tempo reale via webhook e/o import). Usalo nel colloquio quando capisci se ha o meno un gestionale, o quando l'utente lo cambia. Con 'gestionale' prepara la connessione (con webhook) e apre il pannello per attivare la sincronia; poi proponi l'import iniziale per popolare subito ORION.",
    input_schema: {
      type: "object",
      properties: {
        fonte: { type: "string", enum: ["orion", "gestionale"] },
        sistema: { type: "string", description: "Nome del gestionale (obbligatorio se fonte=gestionale)" },
      },
      required: ["fonte"],
    },
  },
  {
    name: "mostra_sistemi",
    description: "ECOSISTEMA. Mostra a schermo i sistemi esterni collegati e cosa ORION ne sa. Usalo per 'quali software hai collegato', 'mostrami le integrazioni', 'cosa sai dei nostri sistemi'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "registra_dato_esterno",
    description:
      "ECOSISTEMA. Inserisce nel modello unificato di ORION un dato proveniente da un sistema esterno, quando l'utente lo racconta o lo incolla (es. 'nel gestionale l'ordine 245 di Rossi è in produzione'). ORION lo collega al cliente e alla catena (riferimento). Indica il sistema (nome) a cui appartiene.",
    input_schema: {
      type: "object",
      properties: {
        sistema: { type: "string", description: "Nome del sistema esterno (deve essere già collegato con collega_sistema)" },
        tipo: { type: "string", enum: ["cliente", "ordine", "pratica", "progetto", "documento", "ticket", "persona", "attivita", "altro"] },
        titolo: { type: "string" },
        chiave_esterna: { type: "string", description: "Id/codice del record nel sistema (per evitare duplicati)" },
        cliente_nome: { type: "string", description: "Cliente a cui collegarlo" },
        riferimento: { type: "string", description: "Chiave di catena, es. 'ordine 245'" },
        dati: { type: "string", description: "Dettagli liberi" },
      },
      required: ["sistema", "titolo"],
    },
  },
  {
    name: "cerca_dato_esterno",
    description: "ECOSISTEMA. Interroga il modello unificato: ciò che ORION ha raccolto dai sistemi esterni. Usalo per 'cosa risulta nel gestionale per Rossi', 'gli ordini aperti', 'le pratiche di X'. Puoi filtrare per cliente o testo.",
    input_schema: {
      type: "object",
      properties: {
        cliente_nome: { type: "string" },
        testo: { type: "string", description: "Parola chiave da cercare (titolo/riferimento)" },
      },
    },
  },
  {
    name: "importa_dati",
    description:
      "ECOSISTEMA. Porta DENTRO ORION i dati che già esistono nel software dell'utente (gestionale, CRM, Excel, archivio): apre il pannello dove carica un'esportazione CSV o Excel (.xlsx). Usalo per 'importa i miei clienti', 'ti passo i dati del gestionale', 'leggi questo excel'. Spiega che ogni gestionale sa esportare in CSV/Excel. Quando il file è caricato ti arriva un messaggio [Sistema] con colonne ed esempi: ragiona sulla mappatura più sensata, proponila in UNA frase e, dopo conferma, usa esegui_import.",
    input_schema: {
      type: "object",
      properties: {
        sistema: { type: "string", description: "Nome del software di provenienza, se già noto (es. il gestionale collegato)" },
      },
    },
  },
  {
    name: "esegui_import",
    description:
      "ECOSISTEMA. Esegue l'import di un file già analizzato (usa lo stage_id ricevuto nel messaggio [Sistema]). destinazione: 'clienti' (anagrafica), 'appuntamenti' (storico e futuri: servono data E ora), 'entita_esterne' (tutto il resto: ordini, pratiche, schede, interventi — le colonne non mappate finiscono nei dettagli, non si perde nulla). mappa = campo→nome esatto della colonna del file. Puoi richiamarlo più volte sullo stesso stage_id per destinazioni diverse (es. prima clienti, poi appuntamenti). Non sovrascrive mai dati già presenti (dedup + integra solo i campi vuoti). Dopo l'import commenta le statistiche ricevute e salva con impara ciò che caratterizza il suo lavoro (durate reali, giorni/orari tipici, prestazioni frequenti).",
    input_schema: {
      type: "object",
      properties: {
        stage_id: { type: "string" },
        destinazione: { type: "string", enum: ["clienti", "appuntamenti", "entita_esterne"] },
        sistema: { type: "string", description: "Software di provenienza: viene registrato/riusato come connessione (obbligatorio per entita_esterne)" },
        mappa: {
          type: "object",
          description:
            "campo→colonna del file. Per clienti: nome (obbligatorio), telefono, email, codice_fiscale, piva, indirizzo, cap, comune, provincia, note. Per appuntamenti: inizio (data+ora insieme) OPPURE data e ora separate, poi cliente_nome, durata_min, titolo, note. Per entita_esterne: titolo, chiave_esterna, cliente_nome, riferimento.",
          additionalProperties: { type: "string" },
        },
        tipo_entita: { type: "string", description: "Per entita_esterne: cliente|ordine|pratica|progetto|documento|ticket|persona|attivita|altro" },
        durata_min_default: { type: "integer", description: "Durata in minuti quando il file non la indica (per appuntamenti; default 60)" },
      },
      required: ["stage_id", "destinazione", "mappa"],
    },
  },
  {
    name: "esporta_dati",
    description:
      "PORTABILITÀ (mai ostaggio dei dati — il contrario dei gestionali storici). Scarica i dati in un CSV pulito, apribile in Excel e importabile in qualsiasi altro software. Usalo per 'esporta i clienti', 'scarica le fatture', 'passa i pagamenti al commercialista', 'voglio i miei dati'. Il download parte subito nel browser. cosa: clienti | appuntamenti | pagamenti | fatture | note. Per appuntamenti e pagamenti puoi restringere il periodo (default: ultimo anno, e per l'agenda anche l'anno futuro).",
    input_schema: {
      type: "object",
      properties: {
        cosa: { type: "string", enum: ["clienti", "appuntamenti", "pagamenti", "fatture", "note"] },
        data_da: { type: "string", description: "Inizio periodo YYYY-MM-DD (solo appuntamenti/pagamenti)" },
        data_a: { type: "string", description: "Fine periodo YYYY-MM-DD (solo appuntamenti/pagamenti)" },
      },
      required: ["cosa"],
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
    description:
      "Crea un nuovo cliente. Per poter fatturare elettronicamente servono anche codice fiscale (o P.IVA) e indirizzo completo (via, CAP, comune, provincia): se l'utente li ha, salvali subito.",
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
        cap: { type: "string" },
        comune: { type: "string" },
        provincia: { type: "string" },
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
      "Prepara l'ANTEPRIMA di una fattura ELETTRONICA usando i dati fiscali del profilo e del cliente. NON emette. Ti dice: campi mancanti (chiedili), destino ('sdi' = fattura elettronica via Sistema di Interscambio; 'sanitaria_no_sdi' = prestazione sanitaria a persona fisica, per legge fuori SDI), IVA, bollo. importo = imponibile/compenso. aliquota_iva solo per regime ordinario se diversa dal 22%.",
    input_schema: {
      type: "object",
      properties: {
        cliente_nome: { type: "string" },
        cliente_id: { type: "integer" },
        importo: { type: "number" },
        descrizione: { type: "string" },
        aliquota_iva: { type: "number" },
      },
      required: ["importo"],
    },
  },
  {
    name: "emetti_fattura",
    description:
      "Emette la fattura. Usalo SOLO dopo conferma finale dell'utente. Se il destino è 'sdi' genera l'XML FatturaPA e, se il provider SDI è collegato, la trasmette; se mancano dati obbligatori si ferma e te li elenca (chiedili e riprova). Se 'sanitaria_no_sdi', emette il documento fuori SDI (flusso Sistema TS).",
    input_schema: {
      type: "object",
      properties: {
        cliente_nome: { type: "string" },
        cliente_id: { type: "integer" },
        importo: { type: "number" },
        descrizione: { type: "string" },
        aliquota_iva: { type: "number" },
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
    name: "mostra_chiamate",
    description:
      "Le telefonate gestite dal CENTRALINO AI dello studio (chi ha chiamato, esito, appuntamenti prenotati, messaggi lasciati). Usalo per 'chi ha chiamato', 'telefonate di oggi', 'com'è andata la chiamata di X'. Riassumi a voce le più rilevanti.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "collega_calendario",
    description:
      "Collega Google Calendar (sync bidirezionale: ciò che prenoto qui appare su Google e viceversa). Usalo quando l'utente dice 'collega il mio calendario/Google Calendar', 'sincronizza il calendario'. Apre la pagina di consenso Google. Se è GIÀ collegato te lo dice il risultato (riferisci lo stato).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "prepara_richiami",
    description:
      "MOTORE RICAVI — richiami dei clienti dormienti. Trova i clienti che non si vedono da almeno N mesi (default 6), senza appuntamenti futuri. Tu poi SCRIVI un messaggio WhatsApp personalizzato e cordiale per ciascuno (nome, quanto tempo è passato, invito gentile a fissare un controllo — MAI pressante), li leggi/riassumi all'utente e SOLO dopo conferma esplicita li invii con invia_richiami. Usalo quando l'utente dice 'richiamiamo i clienti che non si vedono da un po'', 'facciamo una campagna richiami', o quando l'analisi proattiva segnala clienti inattivi.",
    input_schema: {
      type: "object",
      properties: { mesi_min: { type: "integer", description: "Mesi minimi di assenza (default 6)" } },
    },
  },
  {
    name: "invia_richiami",
    description:
      "Invia i messaggi di richiamo preparati (SOLO dopo conferma esplicita dell'utente). Passa l'elenco {cliente_id, testo} con i messaggi che hai scritto tu.",
    input_schema: {
      type: "object",
      properties: {
        richiami: {
          type: "array",
          items: {
            type: "object",
            properties: {
              cliente_id: { type: "integer" },
              testo: { type: "string" },
            },
            required: ["cliente_id", "testo"],
          },
        },
      },
      required: ["richiami"],
    },
  },
  {
    name: "report_valore",
    description:
      "Il report 'quanto ti ho fatto guadagnare': chiamate gestite dal centralino, appuntamenti prenotati da solo, buchi riempiti dalla lista d'attesa, no-show evitati (stima prudente), promemoria e richiami inviati, con una STIMA IN EURO basata sul prezzo medio reale dei pagamenti. Usalo per 'quanto mi hai aiutato questo mese', 'report del mese', 'quanto mi hai fatto guadagnare'. A voce: dai il numero in euro e le 2-3 voci principali, precisando che è una stima prudente.",
    input_schema: {
      type: "object",
      properties: { periodo: { type: "string", enum: ["mese", "mese_scorso"] } },
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
    name: "stampa",
    description:
      "SOLO Desktop: STAMPA davvero alla stampante di sistema. cosa='documento' → un documento/foto archiviato in ORION (identifica con nome/cliente_nome o id); cosa='agenda' → l'agenda di un giorno o di un intervallo (data/data_a, senza = oggi); cosa='file' → un FILE del computer trovato per nome (nome); cosa='testo' → un testo che componi TU (titolo + testo: es. 'stampami questa lettera', dettata o preparata da te). Usalo per 'stampami…', 'stampa il referto di Rossi', 'stampami l'agenda di domani', 'stampa il PDF sulla scrivania'. Conferma a voce in una frase breve ('In stampa.'). Sul WEB spiega che la stampa diretta c'è su ORION Desktop (il PDF viene scaricato).",
    input_schema: {
      type: "object",
      properties: {
        cosa: { type: "string", enum: ["documento", "agenda", "file", "testo"] },
        nome: { type: "string", description: "Titolo del documento ORION o nome del file del computer" },
        cliente_nome: { type: "string", description: "Per i documenti: il cliente a cui appartiene" },
        id: { type: "integer", description: "Id del documento, se noto" },
        data: { type: "string", description: "Per l'agenda: giorno YYYY-MM-DD (senza = oggi)" },
        data_a: { type: "string", description: "Per l'agenda: fine intervallo YYYY-MM-DD" },
        titolo: { type: "string", description: "Per cosa='testo': l'intestazione del foglio" },
        testo: { type: "string", description: "Per cosa='testo': il contenuto da stampare" },
      },
      required: ["cosa"],
    },
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
    name: "chiudi_vista",
    description:
      "Chiude un pannello/finestra che hai aperto. Usalo per 'chiudi l'agenda', 'chiudi la mappa', 'togli le notizie', 'via questo', 'chiudi tutto'. Passa in 'vista' il tipo di pannello da chiudere: agenda, mappa, notizie, finanza, sport, clienti, cliente, documento, documenti, lavagna, schema, abbonamento, pagamenti, whatsapp, promemoria, attesa, briefing, profilo, memoria, organico, compiti, email, verbale, integrazioni, visione, gesti — oppure 'tutto' per chiudere tutti i pannelli.",
    input_schema: {
      type: "object",
      properties: { vista: { type: "string" } },
      required: ["vista"],
    },
  },
  {
    name: "guarda_foto",
    description:
      "Apre la fotocamera (o caricamento immagine) per far DESCRIVERE a ORION una foto. Usalo quando l'utente dice 'descrivimi una foto', 'guarda questa immagine e dimmi cosa c'è', 'cosa vedi in questa foto'. Dopo che l'utente scatta/carica, riceverai l'immagine e dovrai descrivere a parole, in modo naturale, cosa si vede. A voce di' una frase tipo 'Inquadra pure la foto'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "scansiona_documento",
    description:
      "Apre la FOTOCAMERA (o caricamento immagine) per digitalizzare un documento fisico. Usalo SEMPRE quando l'utente dice 'scansiona/digitalizza un documento', 'porta questo foglio in digitale', 'archivia questo documento'. NON inventare un documento e NON chiamare archivia_documento finché non hai ricevuto l'immagine: prima apri la fotocamera con questo strumento, poi — quando ti arriva la foto — leggi il contenuto e chiamerai archivia_documento. A voce di' una frase tipo 'Inquadra pure il documento'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "attiva_visione",
    description:
      "Attiva la MODALITÀ VISIONE: la videocamera dal vivo con cui ORION ti guarda mentre fai un'attività pratica (montaggio PC, riparazione, elettronica, falegnameria, stampa 3D, cucina, manutenzione…) e ti assiste passo passo, riconoscendo gli oggetti, notando errori e suggerendo il prossimo passo, anche con evidenziazioni sull'inquadratura. Usalo quando l'utente dice 'attiva la videocamera/la visione', 'guarda cosa sto facendo', 'aiutami a montare/riparare/cucinare…'. È diverso da guarda_foto (uno scatto singolo) e da scansiona_documento. A voce di' una frase breve tipo 'Eccomi, ti guardo: avvia pure la telecamera'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "guarda_schermo",
    description:
      "SOLO Desktop. ORION GUARDA LO SCHERMO ADESSO (l'affiancamento è SEMPRE attivo e pronto, non va acceso): cattura ciò che c'è a schermo — il gestionale/sito/app che il professionista già usa: agenda, gestionale pazienti/clienti, portale, email… — EVIDENZIA direttamente sopra lo schermo ciò che conta (appuntamento imminente, dato da confermare, scadenza) e apre la SCHEDA col riassunto. Usalo ISTANTANEAMENTE quando l'utente lo chiede ('guarda la mia agenda', 'affiancami sul gestionale', 'controlla lo schermo', 'aiutami con questa schermata') MA ANCHE PROATTIVAMENTE, senza che te lo chieda: appena dal discorso capisci che sta guardando/parlando di qualcosa che è sullo schermo (un cliente, un appuntamento, una schermata del suo software), guarda e mostragli ciò che serve. Non copia i dati: li lascia dove sono. Passa 'domanda' con cosa cercare, se specificato. A voce una frase brevissima ('Guardo…' / niente se stai già parlando). NB: è diverso da attiva_visione (telecamera sulle mani).",
    input_schema: { type: "object", properties: { domanda: { type: "string", description: "Cosa cercare o evidenziare sullo schermo, se rilevante" } } },
  },
  {
    name: "attiva_gesti",
    description:
      "Attiva la MODALITÀ GESTI: con la mano davanti alla telecamera si SPOSTANO e RIDIMENSIONANO le finestre di TUTTO il computer (qualsiasi app, sito, Finder, non solo i pannelli di ORION). Come funziona: un pallino celeste segue la mano; il PINCH (pollice+indice uniti) aggancia la finestra sotto il pallino e la TRASCINA; DUE mani in pinch la RIDIMENSIONANO. Solo spostare e ridimensionare finestre (niente click del mouse). Usalo quando l'utente dice 'modalità gesti', 'voglio usare le mani', 'controllo a gesti', 'comandare col dito'. È SOLO Desktop e serve il permesso Accessibilità (lo chiede la prima volta). Diverso dalla modalità visione (che assiste le attività manuali). A voce una frase breve tipo 'Gesti attivi: pinch per prendere le finestre, due mani per ridimensionare'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "personalizza_aspetto",
    description:
      "ORION SU MISURA: ricolora TUTTA l'estetica — interfaccia, testi in evidenza, bordi, bagliori, il NUCLEO (la sfera) e le sfumature dello sfondo — secondo i gusti dell'utente. TU sei il designer: da QUALSIASI desiderio ('mettimi rosso Ferrari', 'tema tramonto', 'verde Matrix', 'oro elegante', 'stile Iron Man', 'sbizzarrisciti tu') scegli TU i colori esatti in esadecimale. Parametri: 'accento' = colore principale dell'interfaccia (scegli un tono medio-vivo e LEGGIBILE su fondo scuro, mai troppo scuro o pallido); 'nucleo' = colore della sfera se vuoi differenziarla dall'accento (scenografico: es. accento oro + nucleo ambra); 'sfondo' = tinta delle sfumature dello sfondo (facoltativa); 'nome' = battezza SEMPRE il tema con un nome evocativo ('Rosso Marte', 'Alba Dorata') e usalo a voce. Con reset=true torna all'ORION originale ciano ('rimetti com'era', 'torna normale'). Il cambio avviene in diretta con un'onda di colore dal nucleo e resta salvato per l'utente su ogni suo dispositivo. Lo sfondo resta scuro (leggibilità): giochi con i colori, non col nero di base. A voce UNA frase evocativa, da sarto: 'Ecco il tuo ORION Rosso Marte'.",
    input_schema: {
      type: "object",
      properties: {
        accento: { type: "string", description: "Colore principale in hex, es. #ff2d55" },
        nucleo: { type: "string", description: "Colore della sfera in hex (default: accento)" },
        sfondo: { type: "string", description: "Tinta delle sfumature di sfondo in hex (default: accento)" },
        nome: { type: "string", description: "Nome evocativo del tema, es. 'Rosso Marte'" },
        reset: { type: "boolean", description: "true = torna al tema originale di ORION" },
      },
    },
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
  {
    name: "chiudi_app",
    description:
      "SOLO versione DESKTOP: chiude (ESCE DA) un'applicazione INTERA sul computer. Usalo per 'chiudi Spotify', 'esci da Word'. Passa il nome dell'app in 'nome'. È il contrario di apri_app. Per chiudere UNA finestra o una scheda senza uscire dall'app usa chiudi_finestra.",
    input_schema: { type: "object", properties: { nome: { type: "string" } }, required: ["nome"] },
  },
  {
    name: "chiudi_finestra",
    description:
      "SOLO versione DESKTOP: chiude UNA finestra del computer (il pulsante rosso) o UNA scheda del browser (Cmd+W), senza uscire dall'app. Usalo per 'chiudi questa finestra', 'chiudi la finestra di Safari', 'chiudi la scheda', 'chiudi questa pagina'. 'app' (opzionale) = di quale app; senza app agisce su quella in primo piano. 'scheda'=true per la scheda/pagina del browser. Per i pannelli di ORION usa invece chiudi_vista; per uscire da un'app intera usa chiudi_app.",
    input_schema: {
      type: "object",
      properties: {
        app: { type: "string", description: "Nome dell'app (opzionale: senza, quella in primo piano)" },
        scheda: { type: "boolean", description: "true = chiudi la scheda del browser, non la finestra" },
      },
    },
  },
  {
    name: "crea_file_locale",
    description:
      "SOLO versione DESKTOP: crea un FILE o una CARTELLA sul computer, con il nome dato, nella posizione indicata. Usalo per 'crea una cartella chiamata X sulla scrivania', 'creami un file note.txt in Documenti'. 'nome' = come chiamarlo; 'tipoElemento' = 'cartella' o 'file'; 'posizione' (opzionale) = scrivania, documenti, download, immagini, home, oppure il nome di una cartella esistente (se manca, uso la Scrivania).",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        tipoElemento: { type: "string", enum: ["file", "cartella"] },
        posizione: { type: "string", description: "Dove crearlo (opzionale)" },
      },
      required: ["nome", "tipoElemento"],
    },
  },
  {
    name: "rinomina_file_locale",
    description:
      "SOLO versione DESKTOP: rinomina un file o una cartella del computer (trovandolo per nome). Usalo per 'rinomina il file X in Y', 'chiama la cartella X invece Y'. 'da' = nome attuale (anche parziale), 'a' = nuovo nome.",
    input_schema: {
      type: "object",
      properties: { da: { type: "string" }, a: { type: "string" } },
      required: ["da", "a"],
    },
  },
  {
    name: "scrivi_file",
    description:
      "CREATIVE WORKSPACE (solo DESKTOP). Scrive un file con un contenuto che generi tu: codice, script, configurazioni, e in particolare gli script Python (bpy) per Blender. Il percorso relativo finisce nella cartella di lavoro 'ORION Workspace'; puoi usare sottocartelle (es. 'rest-api/src/index.js'). Usalo come parte del lavorare dentro i software (scaffolding di progetti, scrittura del codice, script da eseguire).",
    input_schema: {
      type: "object",
      properties: {
        percorso: { type: "string", description: "Percorso del file (relativo alla workspace o assoluto)" },
        contenuto: { type: "string", description: "Il contenuto completo del file" },
        etichetta: { type: "string", description: "Breve descrizione di cosa stai scrivendo (per l'utente)" },
      },
      required: ["percorso", "contenuto"],
    },
  },
  {
    name: "esegui_comando",
    description:
      "CREATIVE WORKSPACE (solo DESKTOP). Esegue un comando nel terminale del computer, nella cartella di lavoro (o in 'cwd'). È così che LAVORI DENTRO i software: scaffolding (es. npm init, create-next-app), installazioni, build/test/run, aprire un progetto in VS Code ('code <cartella>'), usare Claude Code ('claude -p \"<task>\"'), eseguire uno script Blender ('blender --python <script.py>'). L'esito (output) ti torna così puoi proseguire/correggere. REGOLA DI SICUREZZA: prima di eseguire, DI' A VOCE in breve cosa stai per lanciare; per azioni RISCHIOSE (cancellazioni, installazioni globali, comandi distruttivi, sovrascritture importanti) CHIEDI prima conferma esplicita e procedi solo dopo un sì.",
    input_schema: {
      type: "object",
      properties: {
        comando: { type: "string", description: "Il comando di shell da eseguire" },
        cwd: { type: "string", description: "Cartella di lavoro (relativa alla workspace o assoluta); default = la workspace" },
        etichetta: { type: "string", description: "Breve descrizione di cosa fa il comando (per l'utente)" },
      },
      required: ["comando"],
    },
  },
];

// ── Handler ──────────────────────────────────────────────────────────────────

const handlers: Record<string, Handler> = {
  aggiorna_profilo: (input, ctx) => {
    let profilo = aggiornaProfilo(input);
    const voci = leggiVoci(input.memoria);
    if (voci.length) profilo = aggiornaMemoriaProfilo(voci);
    // L'onboarding è PER-UTENTE: il flag va sull'utente che sta parlando.
    if (input.onboarding_completo !== undefined && ctx.utenteId) {
      setOnboardingUtente(ctx.utenteId, Number(input.onboarding_completo) === 1);
    }
    return { result: { ok: true, profilo } };
  },

  configura_azienda: (input, ctx) => {
    const voci = leggiVoci(input.memoria);
    const azienda = configuraAzienda(input, voci);
    // Il fondatore diventa il titolare e l'ambiente è di tipo "azienda".
    aggiornaProfilo({ tipo_uso: "lavoro", tipo_lavoro: "azienda" });
    if (ctx.utenteId) {
      collegaUtenteAdAzienda(ctx.utenteId, {
        tenantId: azienda.tenant_id,
        aziendaId: azienda.tenant_id,
        ruolo: "titolare",
        reparto: null,
      });
      if (input.onboarding_completo !== undefined) {
        setOnboardingUtente(ctx.utenteId, Number(input.onboarding_completo) === 1);
      }
    }
    const profilo = getProfilo();
    return {
      result: { ok: true, codice_aziendale: azienda.codice_aziendale, azienda },
      vista: { tipo: "profilo", dati: { profilo, azienda, ruolo: "titolare" } },
    };
  },

  collega_azienda: (input, ctx) => {
    const azienda = trovaAziendaPerCodice(String(input.codice ?? ""));
    if (!azienda) {
      return {
        result: {
          ok: false,
          errore: "codice_non_valido",
          messaggio: "Non trovo nessuna azienda con questo codice. Verifica con il titolare.",
        },
      };
    }
    if (ctx.utenteId) {
      collegaUtenteAdAzienda(ctx.utenteId, {
        tenantId: azienda.tenant_id,
        aziendaId: azienda.tenant_id,
        ruolo: input.ruolo ? String(input.ruolo) : null,
        reparto: input.reparto ? String(input.reparto) : null,
      });
    }
    // NB: l'aggancio vale dal prossimo turno (il tenant del turno corrente è già
    // fissato). ORION conferma a voce e procede con le sole preferenze personali.
    return {
      result: {
        ok: true,
        azienda: {
          nome: azienda.nome,
          settore: azienda.settore,
          ruolo: input.ruolo ?? null,
          reparto: input.reparto ?? null,
        },
      },
    };
  },

  salva_preferenze: (input, ctx) => {
    if (!ctx.utenteId) return { result: { ok: false, errore: "nessun_utente" } };
    if (input.nome) setNomeUtente(ctx.utenteId, String(input.nome));
    const voci = leggiVoci(input.preferenze);
    // Fonde nelle preferenze ESISTENTI (non sovrascrivere: lì vive anche il
    // tema estetico salvato da personalizza_aspetto).
    let prefs: Record<string, unknown> = {};
    try {
      prefs = JSON.parse(getUtente(ctx.utenteId)?.preferenze || "{}") || {};
    } catch {
      /* preferenze corrotte: riparto pulito */
    }
    for (const v of voci) prefs[v.tema] = v.dettaglio;
    if (input.ruolo) prefs["ruolo"] = String(input.ruolo);
    if (input.reparto) prefs["reparto"] = String(input.reparto);
    if (Object.keys(prefs).length) setPreferenzeUtente(ctx.utenteId, JSON.stringify(prefs));
    if (input.ruolo || input.reparto) {
      const u = getUtente(ctx.utenteId);
      if (u?.azienda_id) {
        collegaUtenteAdAzienda(ctx.utenteId, {
          tenantId: u.tenant_id,
          aziendaId: u.azienda_id,
          ruolo: input.ruolo ? String(input.ruolo) : u.ruolo,
          reparto: input.reparto ? String(input.reparto) : u.reparto,
        });
      }
    }
    if (input.onboarding_completo !== undefined) {
      setOnboardingUtente(ctx.utenteId, Number(input.onboarding_completo) === 1);
    }
    return { result: { ok: true } };
  },

  // ── Memoria di contesto vivente ─────────────────────────────────────────────
  impara: (input) => {
    let cliente_id: number | null = null;
    if (input.soggetto) {
      const found = cercaCliente(String(input.soggetto));
      if (found.length === 1) cliente_id = found[0].id;
    }
    const m = impara({
      categoria: input.categoria,
      soggetto: input.soggetto ?? null,
      cliente_id,
      contenuto: String(input.contenuto ?? ""),
      motivo: input.motivo ?? null,
      confidenza: input.confidenza,
    });
    return { result: { ok: true, id: m.id, confidenza: m.confidenza, evidenze: m.evidenze } };
  },

  aggiorna_apprendimento: (input) => {
    const m = aggiornaApprendimento(Number(input.id), {
      contenuto: input.contenuto,
      motivo: input.motivo,
      confidenza: input.confidenza,
      superato: input.superato === true,
    });
    if (!m) return { result: { ok: false, errore: "intuizione_non_trovata" } };
    return { result: { ok: true, id: m.id, stato: m.stato } };
  },

  ricorda: (input) => {
    const arg = String(input.argomento ?? "").trim();
    let cliente_id: number | undefined;
    const found = arg ? cercaCliente(arg) : [];
    if (found.length === 1) cliente_id = found[0].id;
    const intuizioni = recallMemoria({ soggetto: arg || undefined, cliente_id, limite: 15 }).map((m) => ({
      id: m.id,
      categoria: m.categoria,
      soggetto: m.soggetto,
      contenuto: m.contenuto,
      motivo: m.motivo,
      confidenza: m.confidenza,
    }));
    const conversazioni = arg
      ? cercaNeiMessaggi(arg, 6).map((m) => ({ quando: m.created_at.slice(0, 16).replace("T", " "), ruolo: m.ruolo, testo: m.contenuto }))
      : [];
    return { result: { ok: true, intuizioni, conversazioni } };
  },

  chiudi_giornata: (input) => {
    const r = scriviDiario(String(input.riassunto ?? "").trim() || "Sessione conclusa.");
    return { result: { ok: true, data: r.data } };
  },

  mostra_memoria: () => {
    const intuizioni = listMemoria();
    return {
      result: { ok: true, totale: intuizioni.length },
      vista: { tipo: "memoria", dati: { intuizioni } },
    };
  },

  // ── Modalità azienda ────────────────────────────────────────────────────────
  aggiorna_organico: (input) => {
    const m = aggiornaOrganico(input);
    logEvento({ tipo: "organico", descrizione: `Aggiornato organigramma: ${m.nome}${m.ruolo ? ` (${m.ruolo})` : ""}`, soggetto: m.nome });
    return { result: { ok: true, membro: m }, vista: { tipo: "organico", dati: { organico: listOrganico() } } };
  },

  mostra_organico: () => {
    const organico = listOrganico();
    return { result: { ok: true, totale: organico.length }, vista: { tipo: "organico", dati: { organico } } };
  },

  assegna_compito: async (input, ctx) => {
    let cliente_id: number | null = null;
    if (input.cliente_nome) {
      const found = cercaCliente(String(input.cliente_nome));
      if (found.length === 1) cliente_id = found[0].id;
    }
    const assegnatoDa = ctx.utenteId ? getUtente(ctx.utenteId)?.nome ?? null : null;
    const compito = creaCompito({
      titolo: input.titolo,
      descrizione: input.descrizione ?? null,
      assegnatario: input.assegnatario ?? null,
      assegnato_da: assegnatoDa,
      reparto: input.reparto ?? null,
      cliente_id,
      riferimento: input.riferimento ?? null,
      scadenza: input.scadenza ?? null,
      frequenza_giorni: input.frequenza_giorni ?? null,
    });
    logEvento({
      tipo: "compito_assegnato",
      descrizione: `Assegnato "${compito.titolo}"${compito.assegnatario ? ` a ${compito.assegnatario}` : ""}${compito.scadenza ? ` (scad. ${compito.scadenza.slice(0, 10)})` : ""}`,
      soggetto: compito.assegnatario ?? null,
      riferimento: compito.riferimento ?? null,
      cliente_id,
    });
    // Push MIRATA all'assegnatario (non a tutto il team), se ha un account.
    if (compito.assegnatario) {
      const uid = utenteIdPerNome(compito.assegnatario);
      if (uid && uid !== ctx.utenteId) {
        try {
          const { inviaPushAUtente } = await import("../push");
          await inviaPushAUtente(uid, {
            titolo: "Nuovo compito per te",
            corpo: `${assegnatoDa ? `${assegnatoDa}: ` : ""}${compito.titolo}${compito.scadenza ? ` (entro ${compito.scadenza.slice(0, 10)})` : ""}`,
            url: "/",
          });
        } catch {
          /* push non configurate: pazienza */
        }
      }
    }
    return { result: { ok: true, compito }, vista: { tipo: "compiti", titolo: "Compito assegnato", dati: { compiti: listCompiti({ soloAttivi: true }) } } };
  },

  aggiorna_compito: (input) => {
    const compito = aggiornaCompito(Number(input.id), {
      stato: input.stato,
      avanzamento: input.avanzamento,
      scadenza: input.scadenza,
      assegnatario: input.assegnatario,
    });
    if (!compito) return { result: { ok: false, errore: "compito_non_trovato" } };
    logEvento({
      tipo: "compito_aggiornato",
      descrizione: `Compito "${compito.titolo}" → ${compito.stato}${input.avanzamento ? `: ${input.avanzamento}` : ""}`,
      soggetto: compito.assegnatario ?? null,
      riferimento: compito.riferimento ?? null,
    });
    return { result: { ok: true, compito }, vista: { tipo: "compiti", titolo: "Compiti", dati: { compiti: listCompiti({ soloAttivi: true }) } } };
  },

  mostra_compiti: (input) => {
    let compiti;
    let titolo = "Compiti";
    if (input.filtro === "da_seguire") {
      compiti = listCompiti({ soloAttivi: true }).filter((c) => c.in_ritardo);
      titolo = "Compiti da seguire";
    } else {
      compiti = listCompiti({
        assegnatario: input.assegnatario,
        reparto: input.reparto,
        stato: input.stato,
        soloAttivi: input.filtro !== "tutti" && !input.stato,
      });
      if (input.assegnatario) titolo = `Compiti di ${input.assegnatario}`;
      else if (input.reparto) titolo = `Compiti — ${input.reparto}`;
    }
    return { result: { ok: true, compiti }, vista: { tipo: "compiti", titolo, dati: { compiti } } };
  },

  passa_consegne: (input, ctx) => {
    const daNome = ctx.utenteId ? getUtente(ctx.utenteId)?.nome ?? null : null;
    const reparto = input.reparto ?? (ctx.utenteId ? getUtente(ctx.utenteId)?.reparto ?? null : null);
    const consegna = passaConsegne({
      reparto,
      da_nome: daNome,
      completato: input.completato ?? null,
      in_sospeso: input.in_sospeso ?? null,
      problemi: input.problemi ?? null,
      suggerimenti: input.suggerimenti ?? null,
    });
    logEvento({ tipo: "consegne", descrizione: `Passaggio di consegne${reparto ? ` (${reparto})` : ""}${daNome ? ` da ${daNome}` : ""}`, soggetto: daNome });
    return { result: { ok: true, consegna } };
  },

  // ── Staffetta del team ──────────────────────────────────────────────────────
  lascia_messaggio: async (input, ctx) => {
    if (!getAzienda()) return { result: { ok: false, errore: "La staffetta del team vale solo negli ambienti aziendali." } };
    const testo = String(input.testo ?? "").trim();
    if (!testo) return { result: { ok: false, errore: "Serve il testo del messaggio." } };
    const destinatario = input.destinatario ? String(input.destinatario).trim() : null;
    const reparto = input.reparto ? String(input.reparto).trim() : null;
    if (!destinatario && !reparto) return { result: { ok: false, errore: "Serve il destinatario (persona) o il reparto." } };
    const daNome = ctx.utenteId ? getUtente(ctx.utenteId)?.nome ?? null : null;
    const msg = lasciaMessaggioTeam({
      daUtenteId: ctx.utenteId ?? null,
      daNome,
      perNome: destinatario,
      perReparto: reparto,
      testo,
      urgente: Boolean(input.urgente),
    });
    logEvento({
      tipo: "messaggio_team",
      descrizione: `Messaggio${daNome ? ` da ${daNome}` : ""} per ${destinatario ?? `reparto ${reparto}`}`,
      soggetto: destinatario ?? reparto,
    });
    // Notifica SUBITO la persona sul suo dispositivo (se ha un account e push attive).
    let notificato = false;
    if (msg.per_utente_id) {
      try {
        const { inviaPushAUtente } = await import("../push");
        const r = await inviaPushAUtente(msg.per_utente_id, {
          titolo: msg.urgente ? "Messaggio urgente dal team" : "Messaggio dal team",
          corpo: `${daNome ?? "Un collega"}: ${testo.slice(0, 120)}${testo.length > 120 ? "…" : ""}`,
          url: "/",
        });
        notificato = r.inviati > 0;
      } catch {
        /* push non configurate: il messaggio resta comunque in attesa */
      }
    }
    return {
      result: {
        ok: true,
        destinatario: destinatario ?? `reparto ${reparto}`,
        account_riconosciuto: Boolean(msg.per_utente_id),
        notifica_inviata: notificato,
        nota: "Il messaggio verrà consegnato a voce quando il destinatario apre ORION. Conferma in una frase.",
      },
    };
  },

  messaggi_dal_team: (_input, ctx) => {
    if (!getAzienda() || !ctx.utenteId) return { result: { ok: true, messaggi: [] } };
    const messaggi = messaggiTeamPerUtente(ctx.utenteId);
    segnaMessaggiTeamConsegnati(messaggi.map((m) => m.id));
    return {
      result: {
        ok: true,
        messaggi: messaggi.map((m) => ({ da: m.da_nome, testo: m.testo, urgente: m.urgente === 1, quando: m.created_at })),
        nota: messaggi.length ? "Consegnali a voce con naturalezza, prima gli urgenti." : "Nessun messaggio in attesa.",
      },
    };
  },

  // ── Flusso di approvazione ──────────────────────────────────────────────────
  chiedi_approvazione: async (input, ctx) => {
    if (!getAzienda()) return { result: { ok: false, errore: "Le approvazioni valgono solo negli ambienti aziendali." } };
    const richiesta = String(input.richiesta ?? "").trim();
    if (!richiesta) return { result: { ok: false, errore: "Serve il testo della richiesta." } };
    const daNome = ctx.utenteId ? getUtente(ctx.utenteId)?.nome ?? null : null;
    const a = chiediApprovazione({
      daUtenteId: ctx.utenteId ?? null,
      daNome,
      aNome: input.a ? String(input.a) : null,
      richiesta,
      riferimento: input.riferimento ? String(input.riferimento) : null,
      urgente: Boolean(input.urgente),
    });
    logEvento({
      tipo: "approvazione_richiesta",
      descrizione: `${daNome ?? "Qualcuno"} chiede a ${a.a_nome ?? "il titolare"}: ${richiesta.slice(0, 120)}`,
      soggetto: a.a_nome,
      riferimento: a.riferimento,
    });
    // L'approvatore lo scopre subito sul suo dispositivo (e comunque al briefing).
    if (a.a_utente_id && a.a_utente_id !== ctx.utenteId) {
      try {
        const { inviaPushAUtente } = await import("../push");
        await inviaPushAUtente(a.a_utente_id, {
          titolo: a.urgente ? "Approvazione URGENTE richiesta" : "Richiesta di approvazione",
          corpo: `${daNome ?? "Un collega"}: ${richiesta.slice(0, 120)}${richiesta.length > 120 ? "…" : ""}`,
          url: "/",
        });
      } catch {
        /* push non configurate */
      }
    }
    return {
      result: {
        ok: true,
        id: a.id,
        approvatore: a.a_nome,
        account_riconosciuto: Boolean(a.a_utente_id),
        nota: "Richiesta inoltrata: l'esito tornerà a chi ha chiesto in automatico. Conferma in una frase.",
      },
    };
  },

  rispondi_approvazione: async (input, ctx) => {
    if (!ctx.utenteId) return { result: { ok: false, errore: "serve_utente" } };
    const esito = String(input.esito ?? "") as "approvata" | "negata";
    if (esito !== "approvata" && esito !== "negata") return { result: { ok: false, errore: "Esito valido: approvata | negata." } };
    const a = decidiApprovazione(Number(input.id), {
      esito,
      nota: input.nota ? String(input.nota) : null,
      decisoDaId: ctx.utenteId,
    });
    if (!a)
      return {
        result: {
          ok: false,
          errore: "non_autorizzato_o_gia_decisa",
          nota: "O la richiesta non esiste/è già stata decisa, o l'utente corrente non è il destinatario né un titolare. Spiegalo con garbo.",
        },
      };
    logEvento({
      tipo: "approvazione_decisa",
      descrizione: `${a.deciso_da ?? "Qualcuno"} ha ${esito === "approvata" ? "APPROVATO" : "NEGATO"}: ${a.richiesta.slice(0, 120)}${a.nota_esito ? ` (${a.nota_esito})` : ""}`,
      soggetto: a.da_nome,
      riferimento: a.riferimento,
    });
    // Chi ha chiesto lo scopre subito (e comunque al suo prossimo briefing).
    if (a.da_utente_id) {
      try {
        const { inviaPushAUtente } = await import("../push");
        await inviaPushAUtente(a.da_utente_id, {
          titolo: esito === "approvata" ? "Richiesta APPROVATA ✓" : "Richiesta non approvata",
          corpo: `${a.deciso_da ?? "Il responsabile"}: ${a.richiesta.slice(0, 100)}${a.nota_esito ? ` — ${a.nota_esito}` : ""}`,
          url: "/",
        });
      } catch {
        /* push non configurate */
      }
    }
    return { result: { ok: true, id: a.id, esito, richiedente: a.da_nome, nota: "Esito registrato e riportato al richiedente. Conferma in una frase." } };
  },

  mostra_approvazioni: (_input, ctx) => {
    if (!getAzienda()) return { result: { ok: true, per_me: [], recenti: [] } };
    const perMe = ctx.utenteId ? approvazioniPerMe(ctx.utenteId) : [];
    const recenti = listApprovazioni().slice(0, 10);
    return {
      result: {
        ok: true,
        per_me: perMe.map((a) => ({ id: a.id, da: a.da_nome, richiesta: a.richiesta, urgente: a.urgente === 1, quando: a.created_at })),
        recenti: recenti.map((a) => ({ id: a.id, da: a.da_nome, a: a.a_nome, richiesta: a.richiesta, stato: a.stato, esito_nota: a.nota_esito })),
      },
    };
  },

  // ── Giornale di bordo ───────────────────────────────────────────────────────
  giornale_di_bordo: (input) => {
    if (!getAzienda()) return { result: { ok: false, errore: "Il giornale di bordo vale negli ambienti aziendali (per i singoli c'è il briefing)." } };
    const g = giornaleDiBordo(input.giorno ? String(input.giorno) : undefined);
    // Lo schema a schermo riusa il pannello esistente: rami = capitoli della giornata.
    const rami: { titolo: string; punti: string[] }[] = [];
    if (g.consegne.length)
      rami.push({
        titolo: "Consegne di turno",
        punti: g.consegne.map((c) => `${c.da_nome ?? "?"}${c.reparto ? ` (${c.reparto})` : ""}: ${c.problemi ? `⚠ ${c.problemi}` : c.completato ?? "ok"}`),
      });
    if (g.approvazioni.length)
      rami.push({
        titolo: "Approvazioni",
        punti: g.approvazioni.map((a) => `${a.da_nome ?? "?"}: ${a.richiesta.slice(0, 60)} → ${a.stato}${a.deciso_da ? ` (${a.deciso_da})` : ""}`),
      });
    if (g.compitiChiusi.length)
      rami.push({ titolo: `Compiti completati (${g.compitiChiusi.length})`, punti: g.compitiChiusi.map((c) => `${c.titolo}${c.assegnatario ? ` — ${c.assegnatario}` : ""}`) });
    if (g.compitiNuovi.length)
      rami.push({ titolo: `Compiti nuovi (${g.compitiNuovi.length})`, punti: g.compitiNuovi.map((c) => `${c.titolo}${c.assegnatario ? ` — ${c.assegnatario}` : ""}`) });
    if (g.eventi.length)
      rami.push({
        titolo: "Filo degli eventi",
        punti: g.eventi.slice(0, 14).map((e) => `${e.created_at.slice(11, 16)} ${e.descrizione.slice(0, 70)}`),
      });
    const dati = { titolo: `Giornale di bordo — ${g.giorno}`, rami };
    return {
      result: { ok: true, ...g },
      ...(rami.length ? { vista: { tipo: "schema", dati } as Vista } : {}),
    };
  },

  // ── Aree riservate (permessi per ruolo) ─────────────────────────────────────
  imposta_permessi: (input) => {
    const area = String(input.area ?? "") as AreaPermessi;
    if (!(AREE_PERMESSI as readonly string[]).includes(area))
      return { result: { ok: false, errore: `Area sconosciuta. Aree valide: ${AREE_PERMESSI.join(", ")}.` } };
    if (!getAzienda()) return { result: { ok: false, errore: "I permessi per ruolo valgono solo negli ambienti aziendali." } };
    const ruoli = (Array.isArray(input.ruoli) ? input.ruoli : []).filter((r: unknown): r is ClasseRuolo =>
      ["titolare", "responsabile", "amministrativo", "operatore"].includes(String(r))
    );
    const regole = salvaPermessiArea(area, ruoli);
    return {
      result: {
        ok: true,
        area,
        ammessi: regole[area],
        permessi_correnti: regole,
        nota: "Confermato e applicato: gli strumenti ora rifiutano chi non è in lista. Il titolare è sempre incluso.",
      },
    };
  },

  verbale_riunione: (input) => {
    const decisioni = Array.isArray(input.decisioni) ? input.decisioni : [];
    const compitiIn = Array.isArray(input.compiti) ? input.compiti : [];
    const scadenze = Array.isArray(input.scadenze) ? input.scadenze : [];
    for (const d of decisioni) {
      if (d?.contenuto) impara({ categoria: "decisione", contenuto: String(d.contenuto), motivo: d.motivo ?? null, confidenza: "alto" });
    }
    const compitiCreati = compitiIn
      .filter((c: { titolo?: string }) => c?.titolo)
      .map((c: { titolo: string; assegnatario?: string; scadenza?: string }) =>
        creaCompito({ titolo: c.titolo, assegnatario: c.assegnatario ?? null, scadenza: c.scadenza ?? null })
      );
    for (const s of scadenze) {
      if (s?.cosa) creaPromemoria({ testo: String(s.cosa), categoria: "scadenza", scadenza: s.quando ?? null, cliente_id: null });
    }
    logEvento({
      tipo: "riunione",
      descrizione: `Verbale "${input.titolo ?? "riunione"}": ${decisioni.length} decisioni, ${compitiCreati.length} compiti, ${scadenze.length} scadenze`,
    });
    return {
      result: { ok: true, decisioni: decisioni.length, compiti: compitiCreati.length, scadenze: scadenze.length },
      vista: {
        tipo: "verbale",
        dati: {
          titolo: input.titolo ?? "Riunione",
          decisioni: decisioni.map((d: { contenuto: string; motivo?: string }) => ({ contenuto: d.contenuto, motivo: d.motivo ?? null })),
          compiti: compitiCreati.map((c: Compito) => ({ titolo: c.titolo, assegnatario: c.assegnatario, scadenza: c.scadenza })),
          scadenze: scadenze.map((s: { cosa: string; quando?: string }) => ({ cosa: s.cosa, quando: s.quando ?? null })),
          note: input.note ?? null,
        },
      },
    };
  },

  // ── Email (IMAP/SMTP, gated) ────────────────────────────────────────────────
  collega_email: () => ({
    result: { ok: true, configurato: emailConfigurato() },
    vista: { tipo: "email_connect", dati: {} },
  }),

  mostra_email: async (input): Promise<Esito> => {
    if (!emailConfigurato()) {
      return {
        result: { ok: false, errore: "non_configurato", messaggio: "La casella email non è ancora collegata." },
        vista: { tipo: "email_connect", dati: {} },
      };
    }
    const esito = await leggiInbox(Number(input.quante) || 15);
    if (!esito.ok) {
      return { result: { ok: false, errore: esito.errore }, vista: { tipo: "email_connect", dati: {} } };
    }
    const nonLette = esito.messaggi.filter((m) => !m.letto).length;
    return {
      result: { ok: true, totale: esito.messaggi.length, non_lette: nonLette, messaggi: esito.messaggi },
      vista: { tipo: "email", dati: { account: getEmailAccount()?.email ?? null, messaggi: esito.messaggi } },
    };
  },

  prepara_email: (input): Esito => {
    if (!emailConfigurato()) {
      return { result: { ok: false, errore: "non_configurato" }, vista: { tipo: "email_connect", dati: {} } };
    }
    return {
      result: { ok: true, anteprima: { a: input.a, oggetto: input.oggetto, corpo: input.corpo } },
      vista: { tipo: "email", dati: { account: getEmailAccount()?.email ?? null, messaggi: [], bozza: { a: input.a, oggetto: input.oggetto, corpo: input.corpo } } },
    };
  },

  invia_email: async (input) => {
    const esito = await inviaEmail(String(input.a), String(input.oggetto), String(input.corpo));
    if (!esito.ok) {
      return { result: { ok: false, errore: esito.errore === "non_configurato" ? "Email non collegata" : esito.errore } };
    }
    logEvento({ tipo: "email_inviata", descrizione: `Inviata email a ${input.a}: ${input.oggetto}` });
    logAudit({ canale: "email", azione: "invia_email", dettaglio: `${input.a} — ${String(input.oggetto).slice(0, 120)}` });
    return { result: { ok: true, inviata: true } };
  },

  // ── Ecosistema: sistemi esterni ─────────────────────────────────────────────
  collega_sistema: (input) => {
    const conn = registraConnessione(input);
    logEvento({ tipo: "sistema_collegato", descrizione: `Collegato sistema "${conn.nome}" (${conn.tipo})`, soggetto: conn.nome });
    return {
      result: {
        ok: true,
        sistema: { id: conn.id, nome: conn.nome, tipo: conn.tipo, modalita: conn.modalita },
        // Se è in modalità ingest, l'utente configura questo endpoint nel suo sistema.
        ingest: conn.token ? { endpoint: "/api/integrazioni/ingest", token: conn.token } : null,
      },
      vista: { tipo: "integrazioni", dati: { connessioni: listConnessioni() } },
    };
  },

  // CANALE D'USCITA: ORION scrive nel gestionale del cliente.
  mostra_consegne: () => {
    const consegne = consegneManualiPendenti();
    return {
      result: { ok: true, in_coda: consegne.length },
      vista: { tipo: "consegne", dati: { consegne } },
    };
  },

  configura_risponditore: (input) => {
    const i = input as { livello?: string };
    const attuale = getRisponditore();
    if (!i?.livello) {
      return { result: { ok: true, livello: attuale, nota: "spenta = solo copioni; assistita = risponde ma non tocca l'agenda; autopilota = disdice/sposta/prenota davvero" } };
    }
    if (i.livello !== "spenta" && i.livello !== "assistita" && i.livello !== "autopilota") {
      return { result: { ok: false, errore: "livello non valido: spenta | assistita | autopilota" } };
    }
    setRisponditore(i.livello);
    return { result: { ok: true, livello: i.livello, prima: attuale } };
  },

  attiva_scrittura_gestionale: (input) => {
    const nome = String(input.sistema ?? "").trim().toLowerCase();
    const url = input.url ? String(input.url).trim() : null;
    const spegni = input.disattiva === true;
    if (!nome) return { result: { ok: false, errore: "Serve il nome del sistema collegato." } };
    const conn = listConnessioni().find((c) => c.nome.toLowerCase().includes(nome));
    if (!conn)
      return {
        result: { ok: false, errore: "Sistema non trovato: va prima registrato con collega_sistema.", sistemi: listConnessioni().map((c) => c.nome) },
      };
    if (spegni) {
      attivaCanaleUscita(conn.id, null);
      logEvento({ tipo: "uscita_disattivata", descrizione: `Scrittura verso "${conn.nome}" disattivata`, soggetto: conn.nome });
      return { result: { ok: true, sistema: conn.nome, scrittura: "disattivata" } };
    }
    if (!url) {
      // IL PONTE UNIVERSALE: niente webhook, niente API — le modifiche si
      // accodano nel pannello Consegne (copia-incolla perfetto; su Desktop
      // le può scrivere ORION nel gestionale). Funziona con QUALSIASI software.
      attivaPonteManuale(conn.id);
      logEvento({ tipo: "uscita_ponte", descrizione: `Ponte universale attivo verso "${conn.nome}" (consegna assistita, senza API)`, soggetto: conn.nome });
      return {
        result: {
          ok: true,
          sistema: conn.nome,
          scrittura: "ponte_universale",
          eventi: ["appuntamento_creato", "appuntamento_spostato", "appuntamento_stato", "appuntamento_cancellato", "cliente_creato", "cliente_aggiornato"],
          nota: "PONTE UNIVERSALE attivo: da ora ogni modifica (appuntamenti, clienti) si mette in coda nel pannello Consegne — l'utente la copia e la incolla nel suo software con un click, e su Desktop puoi scrivergliela TU. Spiegalo in una frase semplice e apri subito il pannello con mostra_consegne quando ci sono consegne. Se un domani il suo sistema avrà un webhook, si passa alla consegna automatica rifacendo questo comando con l'url.",
        },
      };
    }
    if (!/^https?:\/\//i.test(url))
      return {
        result: {
          ok: false,
          errore: "url_non_valido",
          nota: "L'indirizzo del webhook deve iniziare con https:// (quello del suo gestionale o un Catch Hook di Zapier/Make). In alternativa, SENZA url, si attiva il Ponte universale (consegna assistita, funziona con qualsiasi software).",
        },
      };
    const { segreto } = attivaCanaleUscita(conn.id, url);
    logEvento({ tipo: "uscita_attivata", descrizione: `ORION ora scrive verso "${conn.nome}"`, soggetto: conn.nome });
    return {
      result: {
        ok: true,
        sistema: conn.nome,
        scrittura: "attiva",
        eventi: ["appuntamento_creato", "appuntamento_spostato", "appuntamento_stato", "appuntamento_cancellato", "cliente_creato", "cliente_aggiornato"],
        segreto_firma: segreto,
        nota: "Ogni evento arriva firmato (header X-Orion-Firma, HMAC-SHA256 del corpo con questo segreto): il suo sistema può verificarne l'autenticità. Il segreto compare SOLO ora: digli di salvarlo. A voce conferma in una frase e spiega che da adesso ciò che ORION cambia in agenda arriva anche al suo sistema.",
      },
    };
  },

  mostra_sistemi: () => {
    const connessioni = listConnessioni();
    return { result: { ok: true, totale: connessioni.length }, vista: { tipo: "integrazioni", dati: { connessioni } } };
  },

  imposta_fonte_dati: (input) => {
    const fonte = input.fonte === "gestionale" ? "gestionale" : "orion";
    if (fonte === "orion") {
      aggiornaProfilo({ fonte_dati: "orion" });
      return {
        result: { ok: true, fonte: "orion", messaggio: "ORION è la fonte: i dati vivono qui." },
      };
    }
    const nome = String(input.sistema ?? "").trim();
    if (!nome) {
      return { result: { ok: false, errore: "serve_sistema", messaggio: "Indica quale gestionale è la fonte." } };
    }
    const esistente = listConnessioni().find((c) => c.nome.toLowerCase() === nome.toLowerCase());
    // Assicura che la connessione esista in modalità ingest (→ token/webhook).
    const conn = registraConnessione({
      ...(esistente ? { id: esistente.id } : {}),
      nome,
      tipo: "gestionale",
      modalita: "ingest",
      descrizione: esistente?.descrizione ?? "Fonte di verità: ORION è lo specchio vivo di questo gestionale.",
    });
    aggiornaProfilo({ fonte_dati: "gestionale", fonte_connessione_id: conn.id });
    return {
      result: {
        ok: true,
        fonte: "gestionale",
        sistema: conn.nome,
        // Il token è un segreto: NON leggerlo ad alta voce. L'endpoint lo mostra il pannello.
        ingest: conn.token ? { endpoint: "/api/integrazioni/ingest" } : null,
        messaggio: `ORION è ora lo specchio vivo di ${conn.nome}. Dal pannello attivi la sincronia; intanto posso importare i dati esistenti per popolarlo subito.`,
      },
      vista: { tipo: "integrazioni", dati: { connessioni: listConnessioni() } },
    };
  },

  registra_dato_esterno: (input) => {
    const conn = listConnessioni().find((c) => c.nome.toLowerCase() === String(input.sistema ?? "").toLowerCase())
      ?? listConnessioni().find((c) => c.nome.toLowerCase().includes(String(input.sistema ?? "").toLowerCase()));
    if (!conn) {
      return { result: { ok: false, errore: "sistema_non_collegato", messaggio: `Il sistema "${input.sistema}" non è ancora collegato: usa prima collega_sistema.` } };
    }
    const ent = upsertEntitaEsterna({
      connessione_id: conn.id,
      tipo: input.tipo,
      chiave_esterna: input.chiave_esterna ?? null,
      titolo: input.titolo,
      dati: input.dati ?? null,
      cliente_nome: input.cliente_nome ?? null,
      riferimento: input.riferimento ?? null,
    });
    logEvento({
      tipo: "dato_esterno",
      descrizione: `Da "${conn.nome}": ${input.tipo ?? "dato"} ${input.titolo}`,
      soggetto: input.cliente_nome ?? conn.nome,
      cliente_id: ent.cliente_id,
      riferimento: ent.riferimento,
    });
    return { result: { ok: true, entita: { id: ent.id, collegato_a_cliente: !!ent.cliente_id } } };
  },

  cerca_dato_esterno: (input) => {
    let entita: EntitaEsterna[];
    if (input.cliente_nome) {
      const ris = risolvi({ cliente_nome: input.cliente_nome });
      if ("chiedi" in ris) return ris.chiedi;
      entita = ris.cliente ? listEntitaEsterne(200).filter((e) => e.cliente_id === ris.cliente!.id) : [];
    } else {
      entita = listEntitaEsterne(200);
    }
    if (input.testo) {
      const q = String(input.testo).toLowerCase();
      entita = entita.filter(
        (e) => (e.titolo ?? "").toLowerCase().includes(q) || (e.riferimento ?? "").toLowerCase().includes(q) || (e.tipo ?? "").toLowerCase().includes(q)
      );
    }
    return {
      result: {
        ok: true,
        totale: entita.length,
        risultati: entita.slice(0, 30).map((e) => ({ sistema: e.sistema_nome, tipo: e.tipo, titolo: e.titolo, riferimento: e.riferimento, dati: e.dati })),
      },
    };
  },

  importa_dati: (input) => ({
    result: {
      ok: true,
      istruzioni:
        "Pannello di import aperto. L'utente esporta dal suo software un CSV o Excel e lo carica lì: all'arrivo riceverai un messaggio [Sistema] con stage_id, colonne ed esempi. Proponi la mappatura e chiedi conferma prima di esegui_import.",
    },
    vista: { tipo: "importa", dati: { sistema: input.sistema ? String(input.sistema) : null } },
  }),

  esegui_import: (input) => {
    const esito = eseguiImport({
      stage_id: String(input.stage_id ?? ""),
      destinazione: input.destinazione,
      sistema: input.sistema ? String(input.sistema) : null,
      mappa: (input.mappa ?? {}) as Record<string, string>,
      tipo_entita: input.tipo_entita ? String(input.tipo_entita) : null,
      durata_min_default: input.durata_min_default ? Number(input.durata_min_default) : null,
    });
    return { result: esito, vista: { tipo: "importa", dati: { esito } } };
  },

  esporta_dati: (input) => {
    const cosa = String(input.cosa ?? "").toLowerCase();
    const valide = ["clienti", "appuntamenti", "pagamenti", "fatture", "note"];
    if (!valide.includes(cosa)) {
      return { result: { ok: false, errore: `'cosa' deve essere una tra: ${valide.join(", ")}` } };
    }
    const qs = new URLSearchParams({ cosa });
    if (input.data_da) qs.set("da", String(input.data_da));
    if (input.data_a) qs.set("a", String(input.data_a));
    const url = `/api/esporta?${qs.toString()}`;
    // L'azione apre l'URL nel browser: il CSV parte come download immediato.
    return {
      result: {
        ok: true,
        url,
        nota: "Download CSV avviato. Di' all'utente che il file è suo, in formato aperto: può darlo al commercialista o importarlo in qualsiasi software.",
      },
      azione: { tipo: "apri_url", url, etichetta: `Export ${cosa} (CSV)` },
    };
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
    logEvento({
      tipo: "appuntamento_creato",
      descrizione: `Creato appuntamento "${app.titolo}"${cliente ? ` con ${cliente.nome}` : ""} il ${inizio.slice(0, 16).replace("T", " ")}`,
      soggetto: cliente?.nome ?? null,
      cliente_id: cliente?.id ?? null,
    });
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

  elimina_appuntamento: async (input) => {
    const esistente = getAppuntamento(Number(input.id));
    const ok = eliminaAppuntamento(Number(input.id));
    // RIEMPI-BUCHI: lo slot liberato viene offerto subito alla lista d'attesa.
    let offerta = false;
    if (ok && esistente) {
      try {
        offerta = await avviaOffertaSlot(esistente.inizio, esistente.fine);
      } catch {
        /* il riempi-buchi non deve mai bloccare la cancellazione */
      }
    }
    const giorno = esistente?.inizio.slice(0, 10) || oggi();
    const appuntamenti = listAppuntamenti(giorno, giorno);
    return {
      result: {
        ok,
        riempi_buchi: offerta
          ? "Slot offerto automaticamente al primo della lista d'attesa via WhatsApp (45 minuti per accettare; se rifiuta o scade passo al successivo). Dillo all'utente."
          : undefined,
      },
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
    logEvento({
      tipo: "pagamento_registrato",
      descrizione: `Registrato pagamento di ${Number(input.importo).toFixed(2)} € (${input.metodo})${cliente ? ` da ${cliente.nome}` : ""}`,
      soggetto: cliente?.nome ?? null,
      cliente_id: cliente?.id ?? null,
    });
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
    logEvento({
      tipo: "whatsapp_inviato",
      descrizione: `Inviato WhatsApp${cliente ? ` a ${cliente.nome}` : ""}`,
      soggetto: cliente?.nome ?? null,
      cliente_id: cliente?.id ?? null,
    });
    logAudit({
      canale: "whatsapp",
      azione: "invia_whatsapp",
      dettaglio: `${cliente?.nome ?? numero} — ${String(input.contenuto).slice(0, 120)}${esito.simulato ? " (simulato)" : ""}`,
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
    const datiCliente = cliente ? getCliente(cliente.id) : null;
    const { emittente, profilo } = emittenteFattura();

    const parteCliente: ParteFattura = {
      denominazione: datiCliente?.nome ?? input.cliente_nome ?? null,
      piva: datiCliente?.piva ?? null,
      codice_fiscale: datiCliente?.codice_fiscale ?? null,
      indirizzo: datiCliente?.indirizzo ?? null,
      cap: datiCliente?.cap ?? null,
      comune: datiCliente?.comune ?? null,
      provincia: datiCliente?.provincia ?? null,
    };
    const destino = destinoFattura(profilo.professione, parteCliente);

    // Prova "a secco": stessa validazione dell'emissione, così i campi mancanti
    // emergono ADESSO (e ORION li chiede), non al momento della conferma.
    const esito = generaFatturaPA({
      numero: prossimoNumeroFattura(),
      data: oggi(),
      importo: Number(input.importo),
      descrizione: input.descrizione ?? "Prestazione professionale",
      emittente,
      cliente: parteCliente,
      aliquotaIva: input.aliquota_iva != null ? Number(input.aliquota_iva) : undefined,
    });
    const campiMancanti: string[] = [];
    if (!cliente) campiMancanti.push("cliente");
    // Per le prestazioni sanitarie a persone fisiche (niente SDI) bastano i dati base.
    if (destino === "sdi") campiMancanti.push(...esito.campiMancanti);
    else {
      if (!emittente.piva) campiMancanti.push("P.IVA emittente");
      if (datiCliente && !datiCliente.codice_fiscale && !datiCliente.piva)
        campiMancanti.push("codice fiscale/P.IVA del cliente");
    }

    return {
      result: {
        ok: true,
        numero: prossimoNumeroFattura(),
        destino,
        nota_destino:
          destino === "sanitaria_no_sdi"
            ? "Prestazione sanitaria a persona fisica: per legge NON si trasmette allo SDI (va nel flusso Sistema TS). Verrà emesso il documento con PDF."
            : sdiConfigurato()
            ? "Alla conferma verrà trasmessa allo SDI."
            : "Provider SDI non ancora collegato: alla conferma l'XML FatturaPA viene generato e conservato, pronto da trasmettere.",
        bollo: esito.bollo,
        iva: esito.iva,
        totale: esito.totale,
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
            nome: emittente.denominazione,
            piva: emittente.piva,
            indirizzo: emittente.indirizzo,
            regime_fiscale: emittente.regime_fiscale ?? null,
            pec: profilo.pec,
            sdi: profilo.sdi,
          },
          importo: Number(input.importo),
          descrizione: input.descrizione ?? null,
          data: oggi(),
          campiMancanti,
          destino,
          bollo: esito.bollo,
          iva: esito.iva,
          totale: esito.totale,
        },
      },
    };
  },

  emetti_fattura: async (input) => {
    const ris = risolvi(input);
    if ("chiedi" in ris) return ris.chiedi;
    const cliente = ris.cliente;
    if (!cliente) return { result: { ok: false, errore: "Serve un cliente per emettere la fattura" } };
    const datiCliente = getCliente(cliente.id)!;
    const { emittente, profilo } = emittenteFattura();

    const parteCliente: ParteFattura = {
      denominazione: datiCliente.nome,
      piva: datiCliente.piva,
      codice_fiscale: datiCliente.codice_fiscale,
      indirizzo: datiCliente.indirizzo,
      cap: datiCliente.cap,
      comune: datiCliente.comune,
      provincia: datiCliente.provincia,
    };
    const destino = destinoFattura(profilo.professione, parteCliente);

    let xml: string | null = null;
    let statoSdi: string;
    let bollo: number | null = null;
    let iva = 0;
    let totale = Number(input.importo);

    if (destino === "sdi") {
      const esito = generaFatturaPA({
        numero: prossimoNumeroFattura(),
        data: oggi(),
        importo: Number(input.importo),
        descrizione: input.descrizione ?? "Prestazione professionale",
        emittente,
        cliente: parteCliente,
        aliquotaIva: input.aliquota_iva != null ? Number(input.aliquota_iva) : undefined,
      });
      if (!esito.ok) {
        // Meglio fermarsi e chiedere che emettere una fattura non trasmissibile.
        return {
          result: {
            ok: false,
            errore: "Mancano dati obbligatori per la fattura elettronica",
            campiMancanti: esito.campiMancanti,
            suggerimento: "Chiedi all'utente i dati mancanti (o aggiorna la scheda cliente / il profilo), poi riprova.",
          },
        };
      }
      xml = esito.xml;
      bollo = esito.bollo;
      iva = esito.iva;
      totale = esito.totale;
      statoSdi = "da_trasmettere";
    } else {
      statoSdi = "non_applicabile"; // sanitaria verso persona fisica: niente SDI (Sistema TS)
    }

    const fattura = creaFattura({
      cliente_id: cliente.id,
      importo: Number(input.importo),
      descrizione: input.descrizione ?? null,
      stato: "emessa",
      xml,
      stato_sdi: statoSdi,
      bollo,
    });

    // Trasmissione (se c'è un provider collegato e la fattura va allo SDI).
    let trasmissione: { ok: boolean; simulato?: boolean; stato: string; errore?: string } | null = null;
    if (destino === "sdi" && xml) {
      trasmissione = await trasmettiFattura(xml);
      aggiornaFatturaSdi(fattura.id, {
        stato_sdi: trasmissione.stato,
        sdi_id: "sdi_id" in trasmissione ? ((trasmissione as { sdi_id?: string | null }).sdi_id ?? null) : null,
      });
      statoSdi = trasmissione.stato;
    }

    logEvento({
      tipo: "fattura_emessa",
      descrizione: `Emessa fattura ${fattura.numero} a ${datiCliente.nome} di ${Number(input.importo).toFixed(2)} € (${
        destino === "sanitaria_no_sdi" ? "sanitaria, fuori SDI" : `SDI: ${statoSdi}`
      })`,
      soggetto: datiCliente.nome,
      cliente_id: cliente.id,
    });
    logAudit({
      canale: "voce",
      azione: "emetti_fattura",
      dettaglio: `n. ${fattura.numero} — ${datiCliente.nome} — ${Number(input.importo).toFixed(2)} € — destino ${destino} — stato ${statoSdi}`,
      esito: trasmissione && !trasmissione.ok ? "errore" : "ok",
    });

    return {
      result: {
        ok: true,
        fattura: { numero: fattura.numero, data: fattura.data, stato_sdi: statoSdi, bollo, iva, totale },
        destino,
        trasmissione: trasmissione
          ? trasmissione.simulato
            ? "Provider SDI non collegato: XML generato e conservato, da trasmettere."
            : trasmissione.ok
            ? "Trasmessa allo SDI."
            : `Trasmissione fallita: ${trasmissione.errore ?? "errore"} — la fattura resta da trasmettere.`
          : destino === "sanitaria_no_sdi"
          ? "Prestazione sanitaria a persona fisica: emessa fuori SDI (flusso Sistema TS)."
          : null,
      },
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
            nome: emittente.denominazione,
            piva: emittente.piva,
            indirizzo: emittente.indirizzo,
            regime_fiscale: emittente.regime_fiscale ?? null,
            pec: profilo.pec,
            sdi: profilo.sdi,
          },
          importo: Number(input.importo),
          descrizione: input.descrizione ?? null,
          data: fattura.data,
          campiMancanti: [],
          destino,
          stato_sdi: statoSdi,
          bollo,
          iva,
          totale,
        },
      },
    };
  },

  briefing: (_input, ctx) => {
    let dati = briefingOggi();
    // In azienda il briefing PARLATO è role-aware (operatore/responsabile/titolare/
    // amministrativo): aggiungo i dati scoped al result, il pannello resta generico.
    const azienda = getAzienda();
    if (azienda && ctx.utenteId) {
      // AREA RISERVATA: chi non è autorizzato alla finanza non deve vedere gli
      // importi nemmeno dal briefing (né a voce né nel pannello).
      if (!permessoArea("finanza", ctx.utenteId).ok) {
        dati = { ...dati, importoInSospeso: 0, pagamentiInSospeso: 0 };
      }
      const u = getUtente(ctx.utenteId);
      const az = briefingAzienda(u?.ruolo ?? null, u?.reparto ?? null);
      // STAFFETTA: i messaggi lasciati dai colleghi arrivano col buongiorno.
      const messaggi = messaggiTeamPerUtente(ctx.utenteId);
      segnaMessaggiTeamConsegnati(messaggi.map((m) => m.id));
      // APPROVAZIONI: le richieste che aspettano la MIA decisione + gli esiti
      // delle MIE richieste (comunicati una volta sola).
      const daApprovare = approvazioniPerMe(ctx.utenteId);
      const esiti = esitiApprovazioniDaComunicare(ctx.utenteId);
      segnaEsitiComunicati(esiti.map((e) => e.id));
      return {
        result: {
          ...dati,
          azienda: az,
          messaggi_team: messaggi.map((m) => ({ da: m.da_nome, testo: m.testo, urgente: m.urgente === 1, quando: m.created_at })),
          approvazioni_da_decidere: daApprovare.map((a) => ({ id: a.id, da: a.da_nome, richiesta: a.richiesta, urgente: a.urgente === 1 })),
          esiti_mie_richieste: esiti.map((a) => ({ richiesta: a.richiesta, esito: a.stato, da: a.deciso_da, nota: a.nota_esito })),
          ...(messaggi.length || daApprovare.length || esiti.length
            ? {
                nota_team:
                  "All'inizio del briefing consegna a voce, in quest'ordine: gli esiti_mie_richieste ('Il titolare ha approvato…'), i messaggi_team ('Marco ti ha lasciato detto che…', prima gli urgenti), e le approvazioni_da_decidere ('C'è una richiesta di Laura che aspetta il tuo ok…').",
              }
            : {}),
        },
        vista: { tipo: "briefing", dati },
      };
    }
    return { result: dati, vista: { tipo: "briefing", dati } };
  },

  analisi_proattiva: (_input, ctx) => {
    let dati = analisiProattiva();
    // AREA RISERVATA: la segnalazione sui pagamenti contiene gli importi →
    // fuori dalla vista di chi non è autorizzato alla finanza (in azienda).
    if (getAzienda() && ctx.utenteId && !permessoArea("finanza", ctx.utenteId).ok) {
      dati = { segnalazioni: dati.segnalazioni.filter((s) => s.categoria !== "pagamenti") };
    }
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
    logEvento({
      tipo: "documento_archiviato",
      descrizione: `Archiviato documento "${input.titolo}"${cliente ? ` per ${cliente.nome}` : ""}`,
      soggetto: cliente?.nome ?? null,
      cliente_id: cliente?.id ?? null,
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

  mostra_profilo: (_input, ctx) => {
    const profilo = getProfilo();
    const azienda = getAzienda() ?? null;
    const ruolo = ctx.utenteId ? getUtente(ctx.utenteId)?.ruolo ?? null : null;
    return { result: { profilo, azienda }, vista: { tipo: "profilo", dati: { profilo, azienda, ruolo } } };
  },

  collega_whatsapp: () => ({
    result: {
      ok: true,
      azione: "Mostro il pannello di collegamento WhatsApp. L'utente farà login e darà il consenso su Meta; tu guidalo a voce.",
    },
    vista: { tipo: "whatsapp_connect", dati: {} },
  }),

  mostra_chiamate: () => {
    const chiamate = listChiamate().map((ch) => ({
      quando: ch.created_at,
      da: ch.cliente_nome ?? ch.da_numero ?? "sconosciuto",
      stato: ch.stato,
      esito: ch.esito,
      ha_prenotato: !!ch.appuntamento_id,
    }));
    return {
      result: {
        chiamate,
        nota: chiamate.length
          ? "Riassumi a voce le chiamate più rilevanti (prenotazioni e messaggi urgenti prima)."
          : "Nessuna chiamata registrata dal centralino. Se il numero Twilio non è ancora collegato, la guida è in TELEFONO.md.",
      },
    };
  },

  prepara_richiami: (input) => {
    const mesi = input?.mesi_min ? Number(input.mesi_min) : 6;
    const dormienti = clientiDormienti(mesi).map((c) => ({
      cliente_id: c.id,
      nome: c.nome,
      telefono: c.telefono,
      ultima_visita: c.ultima_visita,
      mesi_di_assenza: c.mesi,
      note: c.note,
    }));
    return {
      result: {
        dormienti,
        istruzioni: dormienti.length
          ? "Scrivi un messaggio personalizzato e cordiale per ciascuno (usa nome e mesi di assenza; tono gentile, mai commerciale/pressante). Leggili in sintesi all'utente, chiedi conferma, e SOLO dopo il sì usa invia_richiami."
          : `Nessun cliente dormiente da almeno ${mesi} mesi (con telefono e senza appuntamenti futuri).`,
      },
    };
  },

  invia_richiami: async (input) => {
    const richiami = Array.isArray(input?.richiami) ? input.richiami.slice(0, 20) : [];
    let inviati = 0;
    const errori: string[] = [];
    for (const r of richiami) {
      const c = getCliente(Number(r.cliente_id));
      if (!c?.telefono) {
        errori.push(`cliente ${r.cliente_id}: telefono mancante`);
        continue;
      }
      const esito = await inviaMessaggioWhatsApp(c.telefono, String(r.testo));
      if (!esito.ok) {
        errori.push(`${c.nome}: ${esito.errore ?? "invio fallito"}`);
        continue;
      }
      logCommunication({ cliente_id: c.id, direzione: "out", contenuto: String(r.testo), stato: esito.simulato ? "simulato" : "inviato" });
      logEvento({
        tipo: "richiamo_dormiente",
        soggetto: c.nome,
        cliente_id: c.id,
        descrizione: `Richiamo inviato a ${c.nome} (cliente inattivo)`,
      });
      inviati++;
    }
    logAudit({ canale: "whatsapp", azione: "campagna_richiami", dettaglio: `${inviati} richiami inviati${errori.length ? `, ${errori.length} errori` : ""}` });
    return { result: { ok: true, inviati, errori } };
  },

  report_valore: (input) => {
    const now = new Date();
    let da: Date, a: Date;
    if (input?.periodo === "mese_scorso") {
      da = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      a = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else {
      da = new Date(now.getFullYear(), now.getMonth(), 1);
      a = now;
    }
    const stats = statisticheValore(da.toISOString(), a.toISOString());
    return {
      result: {
        ...stats,
        nota: "Stima PRUDENTE: prenotazioni dal centralino e buchi riempiti valgono il prezzo medio reale; no-show evitati stimati 1 ogni 4 conferme automatiche. A voce: euro + 2-3 voci principali.",
      },
    };
  },

  collega_calendario: () => {
    const acc = getCalendarAccount();
    if (acc?.stato === "collegato") {
      return {
        result: {
          ok: true,
          gia_collegato: true,
          email: acc.email,
          ultimo_sync: acc.ultimo_sync,
          nota: "Google Calendar è già collegato: dillo all'utente (con l'email, se c'è).",
        },
      };
    }
    return {
      result: {
        ok: true,
        azione:
          "Apro la pagina di consenso Google. Spiega con calma: si sceglie l'account, si autorizza il calendario, e da lì in poi ORION e Google Calendar restano allineati nei due sensi (entro un quarto d'ora).",
      },
      azione: { tipo: "apri_url", url: "/api/calendario/connect", etichetta: "Collega Google Calendar" },
    };
  },

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

  scansiona_documento: () => ({
    result: { ok: true, fotocamera: "aperta", nota: "Aspetta l'immagine: poi leggi il testo e chiama archivia_documento." },
    azione: { tipo: "apri_camera", modo: "documento" },
  }),

  attiva_visione: () => ({
    result: { ok: true, visione: "aperta", nota: "Da qui in poi guidi tu dal vivo nel pannello visione: di' una frase breve di avvio." },
    azione: { tipo: "apri_visione" },
  }),

  guarda_schermo: (input) => ({
    result: {
      ok: true,
      affiancamento: "sto_guardando",
      nota: "Guardo lo schermo adesso: evidenzio sul suo software ciò che conta e apro la scheda col riassunto. Una frase brevissima, o nulla se stai già parlando.",
    },
    azione: { tipo: "apri_affiancamento", domanda: input.domanda ? String(input.domanda) : undefined },
  }),

  attiva_gesti: () => ({
    result: { ok: true, gesti: "attivi", nota: "L'utente può ora spostare/ridimensionare/chiudere i pannelli con le mani." },
    azione: { tipo: "apri_gesti" },
  }),

  // ORION su misura: valida gli hex scelti dal modello, salva il tema nelle
  // preferenze dell'utente (così lo ritrova su ogni dispositivo) e lo applica
  // a schermo in diretta (onda di colore dal nucleo).
  personalizza_aspetto: (input, ctx) => {
    const hex = (v: unknown): string | null => {
      if (typeof v !== "string") return null;
      const m = /^#?([0-9a-f]{6})$/i.exec(v.trim());
      return m ? `#${m[1].toLowerCase()}` : null;
    };
    const salva = (tema: unknown) => {
      if (!ctx.utenteId) return;
      let prefs: Record<string, unknown> = {};
      try {
        prefs = JSON.parse(getUtente(ctx.utenteId)?.preferenze || "{}") || {};
      } catch {
        /* preferenze corrotte: riparto pulito */
      }
      if (tema) prefs["tema"] = tema;
      else delete prefs["tema"];
      setPreferenzeUtente(ctx.utenteId, JSON.stringify(prefs));
    };
    if (input.reset) {
      salva(null);
      return {
        result: { ok: true, tema: "originale", nota: "ORION è tornato al suo ciano originale. Una frase breve." },
        azione: { tipo: "tema", tema: null },
      };
    }
    const accento = hex(input.accento);
    if (!accento)
      return {
        result: { ok: false, errore: "Serve 'accento' esadecimale (es. #ff2d55): traduci tu il desiderio dell'utente in un colore." },
      };
    const tema = {
      accento,
      nucleo: hex(input.nucleo),
      sfondo: hex(input.sfondo),
      nome: input.nome ? String(input.nome).slice(0, 40) : null,
    };
    salva(tema);
    return {
      result: { ok: true, tema, nota: "Tema applicato in diretta con l'onda di colore e salvato per l'utente. UNA frase evocativa col nome del tema." },
      azione: { tipo: "tema", tema },
    };
  },

  chiudi_vista: (input) => {
    const vista = String(input.vista ?? "tutto").toLowerCase().trim() || "tutto";
    return { result: { ok: true, chiuso: vista }, azione: { tipo: "chiudi_vista", vista } };
  },

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
                  "User-Agent": "ORION/1.0 (https://orionvision.it)",
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
        headers: { "User-Agent": "ORION/1.0 (+https://orionvision.it)" },
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

      // Azioni / ETF / materie prime. Alias per i termini italiani comuni.
      const ALIAS: Record<string, string> = {
        oro: "GC=F", gold: "GC=F", argento: "SI=F", silver: "SI=F",
        petrolio: "CL=F", greggio: "CL=F", oil: "CL=F", gas: "NG=F", rame: "HG=F",
        "s&p 500": "^GSPC", "s&p500": "^GSPC", sp500: "^GSPC",
        nasdaq: "^IXIC", "dow jones": "^DJI", dax: "^GDAXI",
        "ftse mib": "FTSEMIB.MI", mib: "FTSEMIB.MI",
      };
      const grezzo = (input.simbolo ? String(input.simbolo) : nome).trim();
      const sym = ALIAS[grezzo.toLowerCase()] ?? grezzo;
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
        Accept: "application/json",
        Referer: "https://finance.yahoo.com/",
      };

      let prezzo: number | undefined;
      let variazione: number | null = null;
      let serie: number[] = [];
      let valuta = "USD";
      let nomeTitolo = nome;
      let simboloFinale = sym.toUpperCase();

      // 1) Yahoo Finance (gratis, senza chiave): azioni, ETF, materie prime, indici.
      try {
        const yRes = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`,
          { headers, signal: AbortSignal.timeout(8000) }
        );
        if (yRes.ok && (yRes.headers.get("content-type") ?? "").includes("json")) {
          const y = (await yRes.json()) as {
            chart?: {
              result?: {
                meta?: { regularMarketPrice?: number; currency?: string; shortName?: string; symbol?: string };
                indicators?: { quote?: { close?: (number | null)[] }[] };
              }[];
            };
          };
          const r = y.chart?.result?.[0];
          if (r?.meta && typeof r.meta.regularMarketPrice === "number") {
            prezzo = r.meta.regularMarketPrice;
            valuta = r.meta.currency ?? "USD";
            nomeTitolo = r.meta.shortName ?? nome;
            simboloFinale = r.meta.symbol ?? simboloFinale;
            serie = (r.indicators?.quote?.[0]?.close ?? []).filter((n): n is number => typeof n === "number");
            const primo = serie[0];
            variazione = primo ? ((prezzo - primo) / primo) * 100 : null;
          }
        }
      } catch {
        /* Yahoo ko (a volte rate-limita i server): provo Twelve Data */
      }

      // 2) Fallback Twelve Data (se è configurata la chiave gratuita su Railway).
      const key = process.env.TWELVEDATA_KEY;
      if (prezzo === undefined && key) {
        try {
          // Twelve Data usa simboli diversi da Yahoo per materie prime/indici.
          const TD: Record<string, string> = {
            "GC=F": "XAU/USD", "SI=F": "XAG/USD", "CL=F": "WTI/USD", "NG=F": "NG/USD",
            "^GSPC": "GSPC", "^IXIC": "IXIC", "^DJI": "DJI", "FTSEMIB.MI": "FTSEMIB",
          };
          const symTD = TD[sym] ?? sym;
          const tsRes = await fetch(
            `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symTD)}&interval=1day&outputsize=60&apikey=${key}`,
            { signal: AbortSignal.timeout(9000) }
          );
          const ts = (await tsRes.json()) as {
            status?: string;
            meta?: { symbol?: string; currency?: string };
            values?: { close: string }[];
          };
          if (ts.status !== "error" && ts.values?.length) {
            const s = ts.values.map((v) => parseFloat(v.close)).filter((n) => !Number.isNaN(n)).reverse();
            prezzo = s[s.length - 1];
            serie = s;
            valuta = ts.meta?.currency ?? "USD";
            simboloFinale = ts.meta?.symbol ?? simboloFinale;
            const primo = s[0];
            variazione = primo ? ((prezzo - primo) / primo) * 100 : null;
          }
        } catch {
          /* anche Twelve Data ko */
        }
      }

      if (prezzo === undefined) {
        return {
          result: {
            ok: false,
            errore: `Non riesco a recuperare "${nome}" in questo momento. Le crypto invece te le mostro sempre; per azioni/ETF posso anche usare una fonte dedicata se servisse.`,
          },
        };
      }

      return {
        result: {
          ok: true,
          nome: nomeTitolo,
          simbolo: simboloFinale,
          prezzo,
          valuta,
          variazionePeriodo: variazione,
        },
        vista: {
          tipo: "finanza",
          dati: {
            nome: nomeTitolo,
            simbolo: simboloFinale,
            categoria: "azione",
            valuta,
            prezzo,
            variazione,
            periodo: "3 mesi",
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

  chiudi_app: (input) => ({
    result: { ok: true, app: input.nome },
    azione: { tipo: "chiudi_app", nome: String(input.nome ?? "") },
  }),

  chiudi_finestra: (input) => ({
    result: { ok: true, app: input.app ?? "in primo piano", scheda: !!input.scheda },
    azione: { tipo: "chiudi_finestra", app: input.app ? String(input.app) : undefined, scheda: !!input.scheda },
  }),

  // Stampa alla stampante di sistema (Desktop). Riusa gli altri strumenti per
  // recuperare il contenuto: documento → visore, agenda → mostra_agenda.
  stampa: async (input, ctx) => {
    const cosa = String(input.cosa ?? "").toLowerCase();

    if (cosa === "file") {
      const nome = String(input.nome ?? "").trim();
      if (!nome) return { result: { ok: false, errore: "serve il nome del file da stampare" } };
      return {
        result: { ok: true, invio: "stampante", nota: "Sto mandando il file alla stampante; se qualcosa non va lo dico a voce." },
        azione: { tipo: "stampa_file", query: nome },
      };
    }

    if (cosa === "agenda") {
      const esito = await dispatch("mostra_agenda", { data_da: input.data, data_a: input.data_a ?? input.data }, ctx);
      if (!esito.vista || esito.vista.tipo !== "agenda") return { result: esito.result };
      const dati = esito.vista.dati as Extract<Vista, { tipo: "agenda" }>["dati"];
      const righe = dati.appuntamenti.map(
        (a) =>
          `${a.inizio.slice(11, 16)}–${a.fine.slice(11, 16)}  ${a.titolo}` +
          `${a.cliente_nome && !a.titolo.includes(a.cliente_nome) ? ` · ${a.cliente_nome}` : ""}` +
          `${a.stato === "da_confermare" ? "   (da confermare)" : ""}`
      );
      const giorno = String(input.data ?? new Date().toISOString().slice(0, 10));
      const fine = String(input.data_a ?? giorno);
      const titolo = fine !== giorno ? `Agenda ${giorno} → ${fine}` : `Agenda di ${giorno}`;
      return {
        result: { ok: true, appuntamenti: righe.length, invio: "stampante" },
        azione: { tipo: "stampa_contenuto", titolo, testo: righe.length ? righe.join("\n") : "Nessun appuntamento." },
      };
    }

    if (cosa === "documento") {
      const esito = await dispatch("apri_documento", { id: input.id, titolo: input.nome, cliente_nome: input.cliente_nome }, ctx);
      // Omonimi/candidati o non trovato: passa il result a ORION che chiederà quale.
      if (!esito.vista || esito.vista.tipo !== "documento") return { result: esito.result };
      const documento = (esito.vista.dati as Extract<Vista, { tipo: "documento" }>["dati"]).documento;
      return {
        result: { ok: true, stampa: documento.titolo, invio: "stampante" },
        azione: { tipo: "stampa_contenuto", titolo: documento.titolo, documento },
      };
    }

    // Testo libero composto da ORION ("stampami questa lettera…").
    const testo = String(input.testo ?? "").trim();
    if (!testo) return { result: { ok: false, errore: "serve il testo da stampare (o indica cosa: documento/agenda/file)" } };
    return {
      result: { ok: true, invio: "stampante" },
      azione: { tipo: "stampa_contenuto", titolo: String(input.titolo ?? "Documento ORION"), testo },
    };
  },

  crea_file_locale: (input) => ({
    result: { ok: true, nome: input.nome, tipo: input.tipoElemento, posizione: input.posizione ?? "scrivania" },
    azione: {
      tipo: "crea_file",
      nome: String(input.nome ?? ""),
      tipoElemento: input.tipoElemento === "cartella" ? "cartella" : "file",
      posizione: input.posizione ? String(input.posizione) : undefined,
    },
  }),

  rinomina_file_locale: (input) => ({
    result: { ok: true, da: input.da, a: input.a },
    azione: { tipo: "rinomina_file", da: String(input.da ?? ""), a: String(input.a ?? "") },
  }),

  scrivi_file: (input) => ({
    result: { ok: true, percorso: input.percorso },
    azione: {
      tipo: "scrivi_file",
      percorso: String(input.percorso ?? ""),
      contenuto: String(input.contenuto ?? ""),
      etichetta: input.etichetta ? String(input.etichetta) : undefined,
    },
  }),

  esegui_comando: (input) => ({
    result: { ok: true, comando: input.comando, nota: "Eseguo sul computer; l'esito ti tornerà per proseguire." },
    azione: {
      tipo: "esegui_comando",
      comando: String(input.comando ?? ""),
      cwd: input.cwd ? String(input.cwd) : undefined,
      etichetta: input.etichetta ? String(input.etichetta) : undefined,
      riporta: true,
    },
  }),
};

// AREE RISERVATE: quali strumenti toccano dati protetti per ruolo (in azienda).
// Il controllo sta QUI, nel dispatch: vale qualunque strada prenda il modello.
const AREA_DI_TOOL: Record<string, AreaPermessi> = {
  analisi_economica: "finanza",
  report_valore: "finanza",
  registra_pagamento: "pagamenti",
  prepara_fattura: "fatture",
  emetti_fattura: "fatture",
  esporta_dati: "esporta",
  configura_azienda: "azienda_config",
  imposta_permessi: "azienda_config",
};

export async function dispatch(
  name: string,
  input: unknown,
  ctx: TurnoContext = {}
): Promise<Esito> {
  const h = handlers[name];
  if (!h) return { result: { ok: false, errore: `Strumento sconosciuto: ${name}` } };
  const area = AREA_DI_TOOL[name];
  if (area) {
    const p = permessoArea(area, ctx.utenteId);
    if (!p.ok)
      return {
        result: {
          ok: false,
          errore: "area_riservata",
          area,
          nota: "L'utente corrente NON è autorizzato a quest'area (permessi decisi dal titolare). Rispondi con garbo SENZA rivelare alcun dato né numero: es. 'È un'informazione riservata al titolare — se vuoi posso lasciargli un messaggio'. Non aggirare il blocco.",
        },
      };
  }
  try {
    return await h(input, ctx);
  } catch (e) {
    return { result: { ok: false, errore: e instanceof Error ? e.message : String(e) } };
  }
}
