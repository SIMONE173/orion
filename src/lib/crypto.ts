import crypto from "node:crypto";

// ──────────────────────────────────────────────────────────────────────────
// Cifratura a riposo dei SEGRETI riutilizzabili salvati in SQLite (password
// email, token WhatsApp). AES-256-GCM (autenticato). Trasparente e RETRO-
// COMPATIBILE: i valori cifrati hanno il prefisso `enc:1:`; i valori senza
// prefisso (legacy in chiaro o ambiente senza chiave) vengono restituiti così
// come sono → nessuna migrazione dati necessaria, nessun crash.
//
// Chiave: da env `ORION_ENC_KEY` (consigliata, stringa robusta); in mancanza si
// deriva dal segreto già presente `VAPID_PRIVATE_KEY` (così la cifratura è
// attiva in produzione senza nuova configurazione). Senza nessuno dei due →
// degrado: si scrive/legge in chiaro come oggi. NB: ogni ambiente cifra con la
// propria chiave e il proprio DB (locale e cloud sono separati).
// ──────────────────────────────────────────────────────────────────────────

const TAG = "enc:1:";

function getKey(): Buffer | null {
  const raw = process.env.ORION_ENC_KEY || process.env.VAPID_PRIVATE_KEY;
  if (!raw) return null;
  // Deriva sempre 32 byte (qualunque sia la lunghezza della sorgente).
  return crypto.createHash("sha256").update(String(raw)).digest();
}

export function cifraturaAttiva(): boolean {
  return getKey() !== null;
}

export function cifra(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return plain ?? null;
  if (plain.startsWith(TAG)) return plain; // già cifrato
  const key = getKey();
  if (!key) return plain; // nessuna chiave → degrado in chiaro
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return TAG + Buffer.concat([iv, authTag, enc]).toString("base64");
}

export function decifra(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!value.startsWith(TAG)) return value; // legacy in chiaro o nessuna chiave
  const key = getKey();
  if (!key) return value; // non posso decifrare: restituisco com'è (no crash)
  try {
    const buf = Buffer.from(value.slice(TAG.length), "base64");
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return value;
  }
}
