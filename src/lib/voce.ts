import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

// ── LA VOCE UMANA DI ORION (gratuita) ────────────────────────────────────────
// Sintesi neurale Microsoft (la stessa famiglia di voci dei video di ORION):
// naturale, calda, in italiano vero — e senza costi per carattere. Se un
// giorno si vorrà la corsia di lusso (ElevenLabs), resta sopra questa; e se
// la sintesi fallisce, il client ripiega da solo sulla voce del browser.

// Isabella: la voce di ORION nei video — femminile, professionale, viva.
const VOCE = (process.env.ORION_VOCE_EDGE || "it-IT-IsabellaNeural").trim();

// Un giro di sintesi non deve mai bloccare la risposta: tetto duro sui tempi.
const TIMEOUT_MS = 9000;

export async function sintetizzaVoceGratis(testo: string): Promise<Buffer | null> {
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(VOCE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(testo);

    const pezzi: Buffer[] = [];
    const audio = await new Promise<Buffer | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), TIMEOUT_MS);
      audioStream.on("data", (c: Buffer) => pezzi.push(c));
      audioStream.on("end", () => {
        clearTimeout(timer);
        resolve(Buffer.concat(pezzi));
      });
      audioStream.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
    try {
      tts.close();
    } catch {
      /* noop */
    }
    // Un mp3 vero pesa: sotto il chilobyte è un errore travestito da audio.
    return audio && audio.length > 1024 ? audio : null;
  } catch {
    return null;
  }
}
