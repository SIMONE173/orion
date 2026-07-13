// ── PIANI E PREZZI ORION ─────────────────────────────────────────────────────
// Fonte unica dei prezzi (usata da UI e server). I prezzi VERI li fa Stripe
// (i Price ID); qui ci sono le cifre da mostrare e le caratteristiche.

export type Piano = "pro" | "azienda";

export const PIANI: Record<
  Piano,
  { nome: string; prezzo: number; periodo: string; sottotitolo: string; caratteristiche: string[]; maxUtenti: number }
> = {
  pro: {
    nome: "Professionista",
    prezzo: 49,
    periodo: "al mese",
    sottotitolo: "Per il professionista autonomo",
    maxUtenti: 1,
    caratteristiche: [
      "La tua segreteria operativa 24/7, a voce",
      "Agenda, clienti, pagamenti, promemoria",
      "Fatture e analisi economica",
      "Si aggancia al tuo gestionale e a Google Calendar",
      "WhatsApp, email e centralino",
      "Web + app per Mac e Windows",
    ],
  },
  azienda: {
    nome: "Azienda",
    prezzo: 199,
    periodo: "al mese",
    sottotitolo: "Per team e aziende, fino a 10 persone",
    maxUtenti: 10,
    caratteristiche: [
      "Tutto del piano Professionista",
      "Fino a 10 collaboratori con codice aziendale",
      "Permessi per ruolo e aree riservate",
      "Messaggi interni, compiti e approvazioni",
      "Giornale di bordo e memoria condivisa del team",
      "Priorità nel supporto",
    ],
  },
};

export const GIORNI_PROVA = 7;

export function pianoValido(v: unknown): v is Piano {
  return v === "pro" || v === "azienda";
}
