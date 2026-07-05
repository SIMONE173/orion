import {
  creaOffertaSlot,
  offertaInviataPerCliente,
  aggiornaOfferta,
  offerteScadute,
  clientiGiaOffertiPerSlot,
  prossimoCandidatoAttesa,
  trovaConflitti,
  creaAppuntamento,
  rimuoviAttesa,
  logCommunication,
  logEvento,
  logAudit,
  type Cliente,
  type OffertaSlot,
} from "./data";
import { inviaMessaggioWhatsApp } from "./whatsapp";
import { inviaPushATutti } from "./push";

// ──────────────────────────────────────────────────────────────────────────
// RIEMPI-BUCHI AUTOMATICO (motore ricavi).
//
// Uno slot si libera (disdetta a voce o via WhatsApp) → ORION lo offre alla
// lista d'attesa via WhatsApp, UNA persona alla volta, con scadenza (45').
// SÌ → prenotato + rimosso dall'attesa + push al professionista.
// NO / scadenza → passa al successivo. Slot rioccupato → offerte annullate.
// Un buco riempito = un incasso che era perso. Tutto tracciato (eventi/audit).
// ──────────────────────────────────────────────────────────────────────────

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];

function quando(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]} alle ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const DISCLOSURE = "\n\n(Messaggio automatico dell'assistente dello studio)";

// Orario di cortesia: le offerte partono solo tra le 8 e le 21.
function orarioOk(): boolean {
  const h = new Date().getHours();
  return h >= 8 && h < 21;
}

// Offri lo slot al prossimo candidato in lista d'attesa (se c'è).
export async function avviaOffertaSlot(inizio: string, fine: string): Promise<boolean> {
  if (!orarioOk()) return false;
  if (new Date(inizio) <= new Date()) return false; // slot già passato
  if (trovaConflitti(inizio, fine).length) return false; // già rioccupato

  const esclusi = clientiGiaOffertiPerSlot(inizio);
  const cand = prossimoCandidatoAttesa(esclusi);
  if (!cand) return false;

  const testo =
    `Gentile ${cand.nome.split(" ")[0]}, si è liberato un posto ${quando(inizio)}. ` +
    `È in lista d'attesa: risponda SÌ entro 45 minuti per prenotarlo, oppure NO per lasciarlo.` +
    DISCLOSURE;
  const esito = await inviaMessaggioWhatsApp(cand.telefono, testo);
  if (!esito.ok) return false;

  creaOffertaSlot({ attesa_id: cand.attesa_id, cliente_id: cand.cliente_id, telefono: cand.telefono, inizio, fine });
  logCommunication({ cliente_id: cand.cliente_id, direzione: "out", contenuto: testo, stato: esito.simulato ? "simulato" : "inviato" });
  logEvento({
    tipo: "offerta_slot",
    soggetto: cand.nome,
    cliente_id: cand.cliente_id,
    descrizione: `Offerto a ${cand.nome} lo slot di ${quando(inizio)} (lista d'attesa)`,
  });
  logAudit({ canale: "whatsapp", azione: "offerta_slot", dettaglio: `${cand.nome} — ${inizio}${esito.simulato ? " (simulato)" : ""}` });
  return true;
}

// Il cliente con offerta attiva risponde: true se il messaggio era per l'offerta.
export async function processaRispostaOfferta(cliente: Cliente, testo: string): Promise<boolean> {
  const off = offertaInviataPerCliente(cliente.id);
  if (!off) return false;

  const si = /^\s*(s[iì]\b|s[iì][!. ]|ok\b|okay\b|va bene|confermo|lo prendo|prenot)/i.test(testo);
  const no = !si && /^\s*(no\b|non posso|non mi va|lascio|passo|non riesco)/i.test(testo);
  if (!si && !no) return false; // risposta ambigua: lasciala alla conversazione normale

  if (no) {
    aggiornaOfferta(off.id, "rifiutata");
    logEvento({ tipo: "offerta_rifiutata", soggetto: cliente.nome, cliente_id: cliente.id, descrizione: `${cliente.nome} ha lasciato lo slot di ${quando(off.inizio)}` });
    await avviaOffertaSlot(off.inizio, off.fine); // subito al prossimo
    const r = `Va bene ${cliente.nome.split(" ")[0]}, resta in lista d'attesa: le scriveremo alla prossima disponibilità.` + DISCLOSURE;
    const e = await inviaMessaggioWhatsApp(cliente.telefono ?? "", r);
    if (e.ok) logCommunication({ cliente_id: cliente.id, direzione: "out", contenuto: r, stato: e.simulato ? "simulato" : "inviato" });
    return true;
  }

  // SÌ: lo slot è ancora libero?
  if (new Date(off.inizio) <= new Date() || trovaConflitti(off.inizio, off.fine).length) {
    aggiornaOfferta(off.id, "annullata");
    const r = `Mi dispiace ${cliente.nome.split(" ")[0]}, il posto è appena stato occupato. Resta in cima alla lista d'attesa per il prossimo.` + DISCLOSURE;
    const e = await inviaMessaggioWhatsApp(cliente.telefono ?? "", r);
    if (e.ok) logCommunication({ cliente_id: cliente.id, direzione: "out", contenuto: r, stato: e.simulato ? "simulato" : "inviato" });
    return true;
  }

  creaAppuntamento({
    cliente_id: cliente.id,
    titolo: "Appuntamento (da lista d'attesa)",
    inizio: off.inizio,
    fine: off.fine,
    stato: "confermato",
    note: "Slot riempito automaticamente dal riempi-buchi ORION",
  });
  aggiornaOfferta(off.id, "accettata");
  if (off.attesa_id) rimuoviAttesa(off.attesa_id);
  logEvento({
    tipo: "slot_riempito",
    soggetto: cliente.nome,
    cliente_id: cliente.id,
    descrizione: `Buco riempito: ${cliente.nome} ha preso lo slot di ${quando(off.inizio)} dalla lista d'attesa`,
  });
  logAudit({ canale: "whatsapp", azione: "slot_riempito", dettaglio: `${cliente.nome} — ${off.inizio}` });
  await inviaPushATutti({
    titolo: "Buco riempito",
    corpo: `${cliente.nome} ha preso lo slot di ${quando(off.inizio)} (lista d'attesa).`,
    url: "/",
  });
  const r = `Perfetto ${cliente.nome.split(" ")[0]}, l'appuntamento di ${quando(off.inizio)} è suo. A presto!` + DISCLOSURE;
  const e = await inviaMessaggioWhatsApp(cliente.telefono ?? "", r);
  if (e.ok) logCommunication({ cliente_id: cliente.id, direzione: "out", contenuto: r, stato: e.simulato ? "simulato" : "inviato" });
  return true;
}

// Cron: le offerte scadute passano al candidato successivo.
export async function processaScadenzeOfferte(): Promise<number> {
  let passate = 0;
  for (const off of offerteScadute()) {
    aggiornaOfferta(off.id, "scaduta");
    logEvento({
      tipo: "offerta_scaduta",
      soggetto: off.cliente_nome ?? null,
      cliente_id: off.cliente_id,
      descrizione: `Offerta slot ${quando(off.inizio)} scaduta senza risposta`,
    });
    if (await avviaOffertaSlot(off.inizio, off.fine)) passate++;
  }
  return passate;
}
