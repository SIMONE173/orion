import type { Vista } from "./views";

// ──────────────────────────────────────────────────────────────────────────
// Suggerimenti contestuali — FALLBACK DETERMINISTICO.
// Quando il modello non propone la sua riga [suggerimenti: ...], deriviamo 2-3
// pillole sensate dal TIPO dell'ultima vista aperta nel turno. Frasi brevi,
// scritte come le direbbe l'utente: al tap vengono inviate come suo messaggio.
// ──────────────────────────────────────────────────────────────────────────

const MAX = 3;

// Default per i tipi di pannello "stabili" (nessuno stato da ispezionare).
const DEFAULT: Partial<Record<Vista["tipo"], string[]>> = {
  agenda: ["Sposta un appuntamento", "Trova un buco domani", "Conferma i non confermati"],
  cliente: ["Fagli la fattura", "Mandagli un WhatsApp", "Prendi una nota"],
  clienti: ["Apri una scheda", "Aggiungi un cliente"],
  pagamenti: ["Mostrami gli incassi del mese", "Chi non ha ancora pagato"],
  briefing: ["Mostrami l'agenda", "Chi devo richiamare"],
  promemoria: ["Aggiungi un promemoria", "Segna come fatto"],
  attesa: ["Aggiungi alla lista d'attesa", "Offri un buco alla lista"],
  chiamata: ["Prendi una nota", "Fissa un appuntamento"],
  note: ["Prendi un'altra nota", "Apri la scheda del cliente"],
  proattiva: ["Sistema la prima cosa", "Mostrami l'agenda"],
  documenti: ["Apri un documento", "Digitalizza un foglio"],
  documento: ["Cerca una parola nel documento", "Fai la fattura al cliente"],
  email: ["Rispondi alla prima", "Scrivi una nuova email"],
  compiti: ["Assegna un compito", "Chi è in ritardo"],
  organico: ["Aggiungi una persona", "Assegna un compito"],
  memoria: ["Cosa sai del mio lavoro", "Correggi una cosa"],
  integrazioni: ["Importa i miei dati", "Collega un altro software"],
  importa: ["Importa i clienti", "Importa lo storico appuntamenti"],
};

// Estrae l'eventuale riga "[suggerimenti: a | b | c]" dal testo di ORION: va
// RIMOSSA dal parlato (non si legge mai ad alta voce) e trasformata in pillole.
const RE_SUGGERIMENTI = /\[\s*suggerimenti\s*:\s*([^\]]*)\]/i;
export function estraiSuggerimenti(testo: string): { testoPulito: string; suggerimenti: string[] } {
  const m = testo.match(RE_SUGGERIMENTI);
  if (!m) return { testoPulito: testo, suggerimenti: [] };
  const suggerimenti = m[1]
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX);
  const testoPulito = testo.replace(RE_SUGGERIMENTI, "").replace(/\n{3,}/g, "\n\n").trim();
  return { testoPulito, suggerimenti };
}

// Ultima vista del turno = il "momento vivo" su cui suggerire il passo dopo.
export function suggerimentiPerViste(viste: Vista[]): string[] {
  if (!viste.length) return [];
  const v = viste[viste.length - 1];

  // Casi che dipendono dallo STATO della vista (bozza/conferma in sospeso).
  if (v.tipo === "whatsapp") {
    return v.dati.bozza
      ? ["Invia", "Modifica il messaggio", "Annulla"]
      : ["Scrivigli un messaggio", "Apri la sua scheda"];
  }
  if (v.tipo === "fattura") {
    return v.dati.emessa
      ? ["Mandagliela su WhatsApp", "Mostrami gli incassi"]
      : ["Emettila", "Modifica l'importo", "Annulla"];
  }

  return (DEFAULT[v.tipo] ?? []).slice(0, MAX);
}
