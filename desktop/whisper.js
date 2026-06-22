// Riconoscimento vocale OFFLINE per ORION Desktop (gratis, nessun servizio cloud).
// Usa transformers.js (Whisper) nel processo principale Electron (Node).

const { app } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let transcriberPromise = null;

// Il modello è incluso nell'app (dentro l'asar, sola lettura). Lo copiamo in una
// cartella SCRIVIBILE (userData): nel pacchetto la cache di default non è scrivibile.
function preparaCache() {
  const cacheDir = path.join(app.getPath("userData"), "orion-stt-cache");
  const dest = path.join(cacheDir, "Xenova", "whisper-base");
  const fileChiave = path.join(dest, "onnx", "encoder_model_quantized.onnx");
  if (fs.existsSync(fileChiave)) return cacheDir; // già pronto

  const candidati = [
    path.join(process.resourcesPath || "", "app.asar", "node_modules", "@huggingface", "transformers", ".cache", "Xenova", "whisper-base"),
    path.join(__dirname, "node_modules", "@huggingface", "transformers", ".cache", "Xenova", "whisper-base"),
  ];
  for (const src of candidati) {
    try {
      if (fs.existsSync(path.join(src, "onnx", "encoder_model_quantized.onnx"))) {
        fs.mkdirSync(dest, { recursive: true });
        fs.cpSync(src, dest, { recursive: true });
        console.log("[whisper] modello copiato nella cache scrivibile da", src);
        return cacheDir;
      }
    } catch (e) {
      console.error("[whisper] copia modello fallita:", e && e.message ? e.message : e);
    }
  }
  // Nessuna copia riuscita: transformers lo scaricherà da HuggingFace in cacheDir.
  return cacheDir;
}

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = preparaCache();
      env.allowLocalModels = false; // usa la cache scrivibile (o scarica), mai l'asar in sola lettura
      console.log("[whisper] cacheDir =", env.cacheDir);
      const t = await pipeline("automatic-speech-recognition", "Xenova/whisper-base", { dtype: "q8" });
      console.log("[whisper] modello pronto");
      return t;
    })();
    transcriberPromise.catch((e) => {
      console.error("[whisper] errore caricamento modello:", e && e.message ? e.message : e);
      transcriberPromise = null; // permette un nuovo tentativo
    });
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
