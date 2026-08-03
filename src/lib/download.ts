import { S3Client } from "@aws-sdk/client-s3";

// Gli installer della vetrina vivono nel bucket R2 privato (prefisso
// download/): i link per gli utenti sono FIRMATI e temporanei.
// Windows: installer .exe vero (si apre, installa, mette il collegamento sul
// desktop e parte da solo) — non più uno zip da scompattare a mano.

export const FILE_DOWNLOAD: Record<string, string> = {
  mac: "download/ORION-1.2.0-arm64.dmg",
  win: "download/ORION-1.2.0-win.exe",
};

// Nessun download è libero prima dell'apertura: passano il proprietario, i
// tester e gli ospiti invitati (vedi eccezioneLancio).
export const DOWNLOAD_LIBERI = new Set<string>([]);

export function clientR2(): S3Client | null {
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) return null;
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
}

export const bucketR2 = () => process.env.R2_BUCKET || "database-orion";
