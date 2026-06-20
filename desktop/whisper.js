// Riconoscimento vocale OFFLINE per ORION Desktop (gratis, nessun servizio cloud).
// Usa transformers.js (Whisper) nel processo principale Electron (Node).
// Il modello si scarica una volta sola e resta in cache.

let transcriberPromise = null;

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      // whisper-base multilingue, quantizzato (più leggero/veloce). Italiano incluso.
      return pipeline("automatic-speech-recognition", "Xenova/whisper-base", { dtype: "q8" });
    })();
  }
  return transcriberPromise;
}

// Trascrive audio PCM mono Float32 a 16kHz → testo italiano.
async function trascrivi(float32) {
  const t = await getTranscriber();
  const out = await t(float32, {
    language: "italian",
    task: "transcribe",
    chunk_length_s: 30,
  });
  return (out && out.text ? String(out.text) : "").trim();
}

module.exports = { getTranscriber, trascrivi };
