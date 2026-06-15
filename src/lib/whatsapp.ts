// ──────────────────────────────────────────────────────────────────────────
// Adapter WhatsApp. Se le variabili d'ambiente sono presenti usa la
// WhatsApp Business Cloud API (Meta); altrimenti resta in modalità SIMULATA.
//
//   WHATSAPP_TOKEN            token permanente dell'app Meta
//   WHATSAPP_PHONE_NUMBER_ID  id del numero mittente
//   WHATSAPP_VERIFY_TOKEN     stringa scelta da te per verificare il webhook
//
// Punto d'aggancio storico dell'invio: `logCommunication` in data.ts.
// ──────────────────────────────────────────────────────────────────────────

const API = "https://graph.facebook.com/v21.0";

export function whatsappConfigurato(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export type EsitoInvio = { ok: boolean; simulato?: boolean; id?: string; errore?: string };

export async function inviaMessaggioWhatsApp(to: string, testo: string): Promise<EsitoInvio> {
  if (!whatsappConfigurato()) return { ok: true, simulato: true };

  const numero = to.replace(/\D/g, "");
  if (!numero) return { ok: false, errore: "Numero di telefono mancante o non valido." };

  try {
    const res = await fetch(`${API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: numero,
        type: "text",
        text: { body: testo },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, errore: `WhatsApp API ${res.status}: ${t.slice(0, 180)}` };
    }
    const data = await res.json();
    return { ok: true, id: data?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) };
  }
}

// Scarica un allegato in arrivo (per id media) e lo restituisce come data URL.
export async function scaricaMediaWhatsApp(
  mediaId: string
): Promise<{ dataUrl: string; mime: string } | null> {
  if (!whatsappConfigurato()) return null;
  try {
    const meta = await fetch(`${API}/${mediaId}`, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    });
    if (!meta.ok) return null;
    const info = (await meta.json()) as { url?: string; mime_type?: string };
    if (!info.url) return null;
    const bin = await fetch(info.url, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    });
    if (!bin.ok) return null;
    const buf = Buffer.from(await bin.arrayBuffer());
    const mime = info.mime_type ?? "application/octet-stream";
    return { dataUrl: `data:${mime};base64,${buf.toString("base64")}`, mime };
  } catch {
    return null;
  }
}
