import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import zlib from "node:zlib";
import fs from "node:fs";

// ──────────────────────────────────────────────────────────────────────────
// FORTEZZA SQLITE — backup OFF-SITE cifrati.
//
// Il backup giornaliero locale (db.ts) vive sullo stesso disco del database:
// se il volume muore, muore anche lui. Qui la copia del giorno viene compressa
// (gzip, ~4-5x), CIFRATA (AES-256-GCM: chi buca il bucket vede solo rumore) e
// caricata su uno storage S3-compatibile FUORI da Railway (Cloudflare R2).
//
// Conservazione a scala: 14 giornalieri + 8 settimanali (la copia della
// domenica). Ripristino: scripts/ripristina-backup.mjs (scarica → decifra →
// orion.db). Senza le variabili R2_* tutto degrada in silenzio: il backup
// locale continua come sempre.
//
// Env: R2_ENDPOINT (https://<account>.r2.cloudflarestorage.com),
//      R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (default
//      "orion-backups"), BACKUP_ENC_KEY (fallback: ORION_ENC_KEY).
// ──────────────────────────────────────────────────────────────────────────

const MAGIC = Buffer.from("ORIONBK1"); // versione del formato del file cifrato

function chiave(): Buffer | null {
  const raw = process.env.BACKUP_ENC_KEY || process.env.ORION_ENC_KEY;
  if (!raw) return null;
  return crypto.createHash("sha256").update(String(raw)).digest();
}

export function backupRemotoConfigurato(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && chiave()
  );
}

function client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}
const bucket = () => process.env.R2_BUCKET || "orion-backups";

// gzip → AES-256-GCM. Formato: MAGIC(8) + iv(12) + authTag(16) + cifrato.
export function cifraBackup(dati: Buffer, chiaveEsplicita?: Buffer): Buffer {
  const key = chiaveEsplicita ?? chiave();
  if (!key) throw new Error("BACKUP_ENC_KEY mancante");
  const compresso = zlib.gzipSync(dati, { level: 6 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(compresso), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), enc]);
}

export function decifraBackup(dati: Buffer, chiaveEsplicita?: Buffer): Buffer {
  const key = chiaveEsplicita ?? chiave();
  if (!key) throw new Error("BACKUP_ENC_KEY mancante");
  if (!dati.subarray(0, 8).equals(MAGIC)) throw new Error("formato sconosciuto (non è un backup ORION)");
  const iv = dati.subarray(8, 20);
  const tag = dati.subarray(20, 36);
  const enc = dati.subarray(36);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const compresso = Buffer.concat([decipher.update(enc), decipher.final()]);
  return zlib.gunzipSync(compresso);
}

// Tiene solo gli ultimi `conserva` oggetti di un prefisso (ordinati per nome,
// che contiene la data → alfabetico = cronologico).
async function ruota(s3: S3Client, prefisso: string, conserva: number) {
  const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefisso }));
  const nomi = (r.Contents ?? [])
    .map((o) => o.Key!)
    .filter(Boolean)
    .sort();
  for (const k of nomi.slice(0, Math.max(0, nomi.length - conserva))) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: k }));
    } catch {
      /* la rotazione non deve mai far fallire il backup */
    }
  }
}

// Carica il backup del giorno (già creato da backupGiornaliero) su R2.
// La domenica la copia va anche tra i settimanali. Ritorna cosa ha fatto.
export async function caricaBackupRemoto(
  percorsoFile: string
): Promise<{ ok: boolean; caricati?: string[]; errore?: string; configurato: boolean }> {
  if (!backupRemotoConfigurato()) return { ok: false, configurato: false };
  try {
    const dati = fs.readFileSync(percorsoFile);
    const cifrato = cifraBackup(dati);
    const oggi = new Date();
    const giorno = oggi.toISOString().slice(0, 10);
    const s3 = client();
    const caricati: string[] = [];

    const putConChiave = async (key: string) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket(),
          Key: key,
          Body: cifrato,
          ContentType: "application/octet-stream",
        })
      );
      caricati.push(key);
    };

    await putConChiave(`giornalieri/orion-${giorno}.db.gz.enc`);
    await ruota(s3, "giornalieri/", 14);
    if (oggi.getUTCDay() === 0) {
      await putConChiave(`settimanali/orion-${giorno}.db.gz.enc`);
      await ruota(s3, "settimanali/", 8);
    }
    return { ok: true, caricati, configurato: true };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e), configurato: true };
  }
}
