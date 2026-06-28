import Anthropic from "@anthropic-ai/sdk";
import {
  recallMemoria,
  listMemoria,
  ultimoDiario,
  scriviDiario,
  eventiRecenti,
  messaggiRecenti,
  impara,
  aggiornaApprendimento,
  ultimaConsolidazione,
  segnaConsolidazione,
  getAzienda,
  listOrganico,
  compitiDaSeguire,
  ultimaConsegna,
  triagePriorita,
  listConnessioni,
  listEntitaEsterne,
  type Memoria,
  type Compito,
} from "../data";

// ════════════════════════════════════════════════════════════════════════════
// Assemblaggio del CONTEXT PACK (la leva d'intelligenza) e CONSOLIDAZIONE
// giornaliera economica. Tutto è tenant-scoped: queste funzioni vanno chiamate
// dentro runWithTenant(...) (lo fanno già system.ts e la chat route).
// ════════════════════════════════════════════════════════════════════════════

// Modello economico per la distillazione (NON il cervello principale opus): la
// consolidazione è un compito semplice → costo ~10x più basso.
const MODELLO_CONSOLIDA = "claude-haiku-4-5-20251001";

function rigaMemoria(m: Memoria): string {
  const dove = m.soggetto ? ` [${m.soggetto}]` : "";
  const perche = m.motivo ? ` — perché: ${m.motivo}` : "";
  const cert = m.confidenza === "alto" ? "" : ` (confidenza ${m.confidenza})`;
  return `- ${m.categoria}${dove}: ${m.contenuto}${perche}${cert}`;
}

function rigaCompito(c: Compito): string {
  const chi = c.assegnatario ? ` → ${c.assegnatario}` : "";
  const quando = c.scadenza ? `, scad. ${c.scadenza.slice(0, 10)}` : "";
  const rit = c.in_ritardo ? " [IN RITARDO]" : "";
  return `- #${c.id} ${c.titolo}${chi} (${c.stato}${quando})${rit}`;
}

// Costruisce il pacchetto di contesto LIMITATO da iniettare nel blocco volatile
// del system prompt. Cap rigorosi sulle dimensioni per non gonfiare i token.
// In modalità AZIENDA aggiunge un blocco role-aware (compiti/consegne/organico).
export function costruisciContextPack(opts: { ruolo?: string | null; reparto?: string | null } = {}): string {
  const blocchi: string[] = [];
  const azienda = getAzienda();

  // 1) Memoria viva rilevante (generale): preferenze/priorità/procedure/abitudini/
  //    errori-da-evitare con confidenza+evidenze più alte.
  const generali = recallMemoria({ limite: 14 }).filter((m) => m.soggetto == null || m.cliente_id == null);
  const vive = generali.length ? generali : recallMemoria({ limite: 14 });
  if (vive.length) {
    blocchi.push(`MEMORIA VIVA (ciò che hai imparato sul modo di lavorare — usala con naturalezza):\n${vive.slice(0, 14).map(rigaMemoria).join("\n")}`);
  }

  // 1b) AZIENDA: contesto organizzativo role-aware.
  if (azienda) {
    const aziBlocchi: string[] = [];
    const organico = listOrganico();
    if (organico.length) {
      aziBlocchi.push(
        `Organigramma (${organico.length}): ${organico
          .slice(0, 12)
          .map((m) => `${m.nome}${m.ruolo ? ` (${m.ruolo}${m.reparto ? `, ${m.reparto}` : ""})` : ""}`)
          .join("; ")}`
      );
    }
    const daSeguire = compitiDaSeguire().slice(0, 8);
    if (daSeguire.length) {
      aziBlocchi.push(`Compiti da seguire (in ritardo o senza aggiornamento):\n${daSeguire.map(rigaCompito).join("\n")}`);
    }
    const consegna = ultimaConsegna(opts.reparto ?? null);
    if (consegna) {
      const parti = [
        consegna.completato ? `completato: ${consegna.completato}` : "",
        consegna.in_sospeso ? `in sospeso: ${consegna.in_sospeso}` : "",
        consegna.problemi ? `problemi: ${consegna.problemi}` : "",
        consegna.suggerimenti ? `note: ${consegna.suggerimenti}` : "",
      ].filter(Boolean);
      aziBlocchi.push(
        `ULTIMA CONSEGNA (${consegna.da_nome ?? "turno precedente"}${consegna.reparto ? `, ${consegna.reparto}` : ""}): ${parti.join(" · ")}`
      );
    }
    const tri = triagePriorita();
    if (tri.totale) {
      aziBlocchi.push(`PRIORITÀ oggi: ${tri.urgente} urgenti, ${tri.importante} importanti, ${tri.normale} ordinarie.`);
    }
    if (aziBlocchi.length) {
      blocchi.push(
        `AZIENDA "${azienda.nome ?? ""}"${opts.ruolo ? ` — tu sei ${opts.ruolo}${opts.reparto ? `, reparto ${opts.reparto}` : ""}` : ""}:\n${aziBlocchi.join("\n")}`
      );
    }
  }

  // 1c) ECOSISTEMA: sistemi esterni collegati + entità recenti (gated: solo se
  //     ci sono connessioni → senza, ORION è identico a oggi).
  const connessioni = listConnessioni();
  if (connessioni.length) {
    const righe = connessioni
      .slice(0, 8)
      .map((c) => `- ${c.nome} (${c.tipo})${c.descrizione ? `: ${c.descrizione}` : ""}${c.regole ? ` — regole: ${c.regole}` : ""}`);
    const entita = listEntitaEsterne(8);
    const rEnt = entita.length
      ? `\nDati recenti dai sistemi:\n${entita.map((e) => `- [${e.sistema_nome ?? "sistema"}] ${e.tipo}: ${e.titolo ?? e.chiave_esterna ?? ""}`).join("\n")}`
      : "";
    blocchi.push(
      `SISTEMI COLLEGATI (l'ambiente digitale che già usano — è UN unico modello con i tuoi dati, non software separati):\n${righe.join("\n")}${rEnt}`
    );
  }

  // 2) Dove eravamo rimasti.
  const diario = ultimoDiario();
  if (diario) {
    blocchi.push(`DOVE ERAVAMO RIMASTI (${diario.data}): ${diario.riassunto}`);
  }

  // 3) Movimenti recenti (cosa è successo di recente / mentre era via).
  const eventi = eventiRecenti(8);
  if (eventi.length) {
    blocchi.push(
      `MOVIMENTI RECENTI:\n${eventi.map((e) => `- ${e.created_at.slice(0, 16).replace("T", " ")} ${e.descrizione}${e.riferimento ? ` [${e.riferimento}]` : ""}`).join("\n")}`
    );
  }

  if (!blocchi.length) return "";
  return `\n\n${blocchi.join("\n\n")}`;
}

// ── Consolidazione giornaliera PIGRA ─────────────────────────────────────────
// Gira UNA sola volta al giorno, alla prima sessione in cui l'utente apre ORION
// (chiamata dalla chat route su `avvio`). Distilla eventi + conversazione recente
// + memoria attuale in: (a) un diario "dove eravamo rimasti", (b) nuove intuizioni,
// (c) intuizioni superate. Usa il modello economico e fa UNA chiamata.
export async function consolidaSeNecessario(): Promise<void> {
  const oggi = new Date().toISOString().slice(0, 10);
  if (ultimaConsolidazione() === oggi) return; // già fatta oggi

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return; // senza chiave si salta (riprova quando torna disponibile)

  const eventi = eventiRecenti(30);
  const messaggi = messaggiRecenti(30);
  // Niente attività da distillare → non spendere, ma segna per non riprovare oggi.
  if (!eventi.length && !messaggi.length) {
    segnaConsolidazione(oggi);
    return;
  }

  const memoriaAttuale = listMemoria().slice(0, 30);
  const azienda = getAzienda();
  const ctxEventi = eventi.map((e) => `- ${e.created_at.slice(0, 16).replace("T", " ")} [${e.tipo}] ${e.descrizione}${e.riferimento ? ` {${e.riferimento}}` : ""}`).join("\n");
  const ctxMsg = messaggi.map((m) => `${m.ruolo === "user" ? "Utente" : "ORION"}: ${m.contenuto}`).join("\n").slice(0, 6000);
  const ctxMem = memoriaAttuale.map((m) => `#${m.id} ${rigaMemoria(m)}`).join("\n");
  const notaAzienda = azienda
    ? `\n\nQuesto è un AMBIENTE AZIENDALE ("${azienda.nome ?? ""}"): cerca anche SCHEMI ORGANIZZATIVI ricorrenti (es. un reparto che ogni mese ordina nell'ultima settimana, lavorazioni sempre prioritarie, problemi che si ripetono su una macchina/linea) e procedure/decisioni aziendali da conservare come know-how condiviso.`
    : "";

  const prompt = `Sei il modulo di memoria di ORION, un assistente operativo per professionisti italiani. Distilla ciò che è successo di recente in conoscenza DUREVOLE sul modo di lavorare dell'utente${azienda ? "/dell'azienda" : ""}. Punta alla qualità, non alla quantità: poche intuizioni vere, mai inventate.${notaAzienda}

EVENTI RECENTI:
${ctxEventi || "(nessuno)"}

CONVERSAZIONE RECENTE:
${ctxMsg || "(nessuna)"}

MEMORIA GIÀ NOTA (non duplicarla; semmai conferma/aggiorna):
${ctxMem || "(vuota)"}

Rispondi SOLO con un oggetto JSON valido, senza testo attorno, in questa forma:
{
  "diario": "1-2 frasi: dove siamo rimasti e cosa conta per la prossima volta",
  "intuizioni": [ { "categoria": "preferenza|abitudine|decisione|eccezione|priorita|flusso|procedura|errore_da_evitare|contesto", "soggetto": "es. nome cliente, oppure null", "contenuto": "COSA", "motivo": "PERCHÉ (se deducibile, altrimenti null)", "confidenza": "basso|medio|alto" } ],
  "superate": [ id_intuizioni_che_non_valgono_più ]
}
Se non c'è nulla di durevole da imparare, usa "intuizioni": [] e "superate": []. Il "diario" mettilo sempre.`;

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: MODELLO_CONSOLIDA,
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    const testo = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = testo.match(/\{[\s\S]*\}/);
    if (match) {
      const dato = JSON.parse(match[0]) as {
        diario?: string;
        intuizioni?: { categoria?: string; soggetto?: string | null; contenuto?: string; motivo?: string | null; confidenza?: string }[];
        superate?: number[];
      };
      if (dato.diario && dato.diario.trim()) scriviDiario(dato.diario.trim());
      for (const i of dato.intuizioni ?? []) {
        if (i?.contenuto && i.contenuto.trim()) {
          impara({
            categoria: i.categoria,
            soggetto: i.soggetto ?? null,
            contenuto: i.contenuto.trim(),
            motivo: i.motivo ?? null,
            confidenza: i.confidenza,
          });
        }
      }
      for (const id of dato.superate ?? []) {
        if (Number.isInteger(id)) aggiornaApprendimento(Number(id), { superato: true });
      }
    }
  } catch (e) {
    console.error("[ORION] consolidazione memoria fallita:", e);
    return; // non segnare: si riproverà alla prossima apertura
  }
  segnaConsolidazione(oggi);
}
