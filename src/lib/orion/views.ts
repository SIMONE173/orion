// Tipi delle "viste" (pannelli) che ORION fa comparire in base agli strumenti usati.
// SOLO TIPI: questo file non importa nulla a runtime, quindi è sicuro nel bundle client.
import type {
  Appuntamento,
  Comunicazione,
  Nota,
  Pagamento,
  Cliente,
  Promemoria,
  Documento,
  VoceAttesa,
  Segnalazione,
  Profilo,
  Azienda,
  Memoria,
  MembroOrganico,
  Compito,
  Connessione,
  EntitaEsterna,
  StatoAbbonamento,
} from "../data";

export type Vista =
  | {
      tipo: "briefing";
      dati: {
        data: string;
        appuntamenti: Appuntamento[];
        totaleAppuntamenti: number;
        daConfermare: number;
        messaggiRicevutiOggi: number;
        pagamentiInSospeso: number;
        importoInSospeso: number;
        clientiInattivi: number;
        promemoriaAttivi: number;
        inAttesa: number;
        // Fonte di verità dei dati: se ORION è lo specchio di un gestionale,
        // mostra "aggiornato alle … da <sistema>".
        fonte?: { modo: string; sistema: string | null; aggiornato_at: string | null };
      };
    }
  | {
      tipo: "agenda";
      titolo: string;
      dati: { periodo: { da: string; a: string }; appuntamenti: Appuntamento[] };
    }
  | { tipo: "clienti"; titolo: string; dati: { clienti: Cliente[] } }
  | {
      tipo: "cliente";
      dati: {
        cliente: Cliente;
        appuntamenti: Appuntamento[];
        pagamenti: Pagamento[];
        comunicazioni: Comunicazione[];
        note: Nota[];
        totaleIncassato: number;
        entitaEsterne?: EntitaEsterna[];
      };
    }
  | { tipo: "note"; dati: { note: Nota[] } }
  | {
      tipo: "pagamenti";
      titolo: string;
      dati: {
        periodo: { da: string; a: string };
        totaleIncassato: number;
        totaleDaIncassare: number;
        numeroPagamenti: number;
        perMetodo: Record<string, number>;
        topClienti: { nome: string; totale: number }[];
        giornoPiuRedditizio: { data: string; totale: number } | null;
        daIncassare: { cliente: string | null; importo: number; descrizione: string | null; data: string }[];
      };
    }
  | {
      tipo: "whatsapp";
      dati: {
        cliente: string | null;
        messaggi: Comunicazione[];
        bozza?: { contenuto: string; cliente: string | null };
      };
    }
  | {
      tipo: "fattura";
      dati: {
        numero: string;
        emessa: boolean;
        cliente: { nome: string; piva: string | null; codice_fiscale: string | null; indirizzo: string | null };
        emittente: {
          nome: string | null;
          piva: string | null;
          indirizzo: string | null;
          regime_fiscale: string | null;
          pec: string | null;
          sdi: string | null;
        };
        importo: number;
        descrizione: string | null;
        data: string;
        campiMancanti: string[];
        // Fatturazione elettronica: dove va la fattura e a che punto è.
        // destino: 'sdi' | 'sanitaria_no_sdi'; stato_sdi: 'da_trasmettere' |
        // 'trasmessa' | 'consegnata' | 'scartata' | 'non_applicabile'.
        destino?: string;
        stato_sdi?: string | null;
        bollo?: number | null;
        iva?: number;
        totale?: number;
      };
    }
  | { tipo: "promemoria"; dati: { promemoria: Promemoria[] } }
  | { tipo: "documenti"; dati: { documenti: Documento[] } }
  | { tipo: "documento"; dati: { documento: Documento } }
  | { tipo: "attesa"; dati: { voci: VoceAttesa[] } }
  | { tipo: "proattiva"; dati: { segnalazioni: Segnalazione[] } }
  | { tipo: "chiamata"; dati: { nome: string; numero: string | null } }
  | { tipo: "whatsapp_connect"; dati: Record<string, never> }
  | { tipo: "abbonamento"; dati: { stato: StatoAbbonamento } }
  | {
      tipo: "lavagna";
      dati: {
        titolo: string;
        passi: { latex?: string; spiegazione?: string }[];
        risultato?: string;
      };
    }
  | {
      tipo: "schema";
      dati: {
        titolo: string;
        rami: { titolo: string; punti?: string[] }[];
      };
    }
  | {
      tipo: "mappa";
      dati: {
        luogo: string;
        lat: number;
        lon: number;
        zoom: number;
        cerca?: string | null;
        poi: { nome: string; lat: number; lon: number }[];
      };
    }
  | {
      tipo: "notizie";
      dati: {
        argomento: string | null;
        articoli: { titolo: string; fonte: string; data: string | null; url: string }[];
      };
    }
  | {
      tipo: "finanza";
      dati: {
        nome: string;
        simbolo: string;
        categoria: "crypto" | "azione";
        valuta: string;
        prezzo: number;
        variazione: number | null;
        periodo: string;
        serie: number[];
      };
    }
  | {
      tipo: "sport";
      dati: {
        titolo: string;
        sottotitolo: string | null;
        classifica: { pos: number; squadra: string; punti: number; logo: string | null }[];
        partite: { data: string | null; titolo: string; punteggio: string | null; stato: string }[];
      };
    }
  | { tipo: "profilo"; dati: { profilo: Profilo; azienda?: Azienda | null; ruolo?: string | null } }
  | { tipo: "memoria"; dati: { intuizioni: Memoria[] } }
  | { tipo: "integrazioni"; dati: { connessioni: Connessione[] } }
  | { tipo: "importa"; dati: { sistema?: string | null; esito?: import("../importa").EsitoImport } }
  | {
      tipo: "affianca";
      dati: {
        riassunto: string;
        evidenze: { etichetta: string; forma: string; x: number; y: number; w?: number; h?: number }[];
        stato: "guardo" | "pronto";
        errore?: string;
      };
    }
  | { tipo: "organico"; dati: { organico: MembroOrganico[] } }
  | { tipo: "compiti"; titolo?: string; dati: { compiti: Compito[] } }
  | {
      tipo: "email";
      dati: {
        account: string | null;
        messaggi: { uid: number; da: string; oggetto: string; data: string | null; letto: boolean; anteprima: string }[];
        bozza?: { a: string; oggetto: string; corpo: string };
      };
    }
  | { tipo: "email_connect"; dati: Record<string, never> }
  | {
      tipo: "verbale";
      dati: {
        titolo: string;
        decisioni: { contenuto: string; motivo: string | null }[];
        compiti: { titolo: string; assegnatario: string | null; scadenza: string | null }[];
        scadenze: { cosa: string; quando: string | null }[];
        note: string | null;
      };
    };

// Azioni che ORION fa eseguire allo SCHERMO del client (alla Jarvis): aprire
// siti, entrare in modalità appunti, aprire/zoomare un documento, ecc.
export type Azione =
  | { tipo: "apri_url"; url: string; etichetta?: string }
  | { tipo: "modalita_appunti"; titolo?: string; cliente_id?: number | null }
  | { tipo: "apri_documento"; documento_id: number; cerca?: string }
  | { tipo: "zoom_documento"; verso: "avvicina" | "allontana" | "reset" }
  | { tipo: "cerca_documento"; testo: string }
  | { tipo: "apri_camera"; modo: "documento" | "descrizione" }
  | { tipo: "apri_visione" }
  | { tipo: "apri_affiancamento"; domanda?: string }
  | { tipo: "apri_gesti" }
  | { tipo: "chiudi_vista"; vista: string }
  | { tipo: "riposo" }
  // Solo ORION Desktop (controllo del computer):
  | { tipo: "apri_file"; query: string }
  | { tipo: "cestina_file"; query: string }
  | { tipo: "apri_app"; nome: string }
  | { tipo: "chiudi_app"; nome: string }
  | { tipo: "chiudi_finestra"; app?: string; scheda?: boolean }
  | { tipo: "crea_file"; nome: string; tipoElemento: "file" | "cartella"; posizione?: string }
  | { tipo: "rinomina_file"; da: string; a: string }
  // Stampa (solo Desktop): contenuto di ORION reso PDF al volo, o un file del computer.
  | {
      tipo: "stampa_contenuto";
      titolo: string;
      testo?: string;
      documento?: Extract<Vista, { tipo: "documento" }>["dati"]["documento"];
    }
  | { tipo: "stampa_file"; query: string }
  // Creative Workspace (solo Desktop): lavorare DENTRO i software.
  | { tipo: "esegui_comando"; comando: string; cwd?: string; etichetta?: string; riporta?: boolean }
  | { tipo: "scrivi_file"; percorso: string; contenuto: string; etichetta?: string };

// Pillola tappabile mostrata dopo una risposta: una frase breve che l'utente
// direbbe ("Fagli la fattura"), che al tap viene inviata come suo messaggio.
export type Suggerimento = string;

export type RisultatoConversazione = {
  testo: string;
  viste: Vista[];
  azioni?: Azione[];
  // Fino a 3 azioni successive suggerite, contestuali al turno appena concluso.
  suggerimenti?: Suggerimento[];
  errore?: "no_key" | "auth" | "credito" | "rate_limit" | "api_error";
};
