// ── VOCE PREMIUM (ElevenLabs) ────────────────────────────────────────────────
// ORION parla con una voce vera e uguale per tutti, invece della sintesi del
// browser (robotica e diversa su ogni dispositivo). Il server genera l'audio
// con la voce scelta e lo rimanda al browser che lo riproduce. Se la chiave
// non c'è (o l'API fallisce), il client torna alla voce del browser: nessun
// blocco. Costa a carattere → testo limitato lato route.
//
//   ELEVENLABS_API_KEY   chiave dell'account (segreta)
//   ELEVENLABS_VOICE_ID  id voce (default: quella scelta da ORION)
//   ELEVENLABS_MODEL     modello (default flash: veloce e conveniente)

const KEY = (process.env.ELEVENLABS_API_KEY || "").trim();
const VOICE = (process.env.ELEVENLABS_VOICE_ID || "kAzI34nYjizE0zON6rXv").trim();
const MODEL = (process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5").trim();

export function vocePremiumConfigurata(): boolean {
  return Boolean(KEY);
}

// Genera l'audio (mp3) del testo. null se non configurata o in caso di errore.
export async function sintetizzaVoce(testo: string): Promise<Buffer | null> {
  const t = testo.trim();
  if (!KEY || !t) return null;
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: t,
        model_id: MODEL,
        // Voce naturale e stabile, adatta a un assistente professionale.
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      console.error(`[elevenlabs] ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
      return null;
    }
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.error("[elevenlabs] errore:", e instanceof Error ? e.message : e);
    return null;
  }
}
