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
  | { tipo: "profilo"; dati: { profilo: Profilo } };

// Azioni che ORION fa eseguire allo SCHERMO del client (alla Jarvis): aprire
// siti, entrare in modalità appunti, aprire/zoomare un documento, ecc.
export type Azione =
  | { tipo: "apri_url"; url: string; etichetta?: string }
  | { tipo: "modalita_appunti"; titolo?: string; cliente_id?: number | null }
  | { tipo: "apri_documento"; documento_id: number; cerca?: string }
  | { tipo: "zoom_documento"; verso: "avvicina" | "allontana" | "reset" }
  | { tipo: "cerca_documento"; testo: string }
  | { tipo: "apri_camera"; modo: "documento" | "descrizione" }
  | { tipo: "riposo" }
  // Solo ORION Desktop (controllo del computer):
  | { tipo: "apri_file"; query: string }
  | { tipo: "cestina_file"; query: string }
  | { tipo: "apri_app"; nome: string };

export type RisultatoConversazione = {
  testo: string;
  viste: Vista[];
  azioni?: Azione[];
  errore?: "no_key" | "auth" | "credito" | "rate_limit" | "api_error";
};
