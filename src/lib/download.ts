import { S3Client } from "@aws-sdk/client-s3";

// Gli installer della vetrina vivono nel bucket R2 privato (prefisso
// download/): i link per gli utenti sono FIRMATI e temporanei.

export const FILE_DOWNLOAD: Record<string, string> = {
  mac: "download/ORION-1.0.0-arm64.dmg",
  win: "download/ORION-1.0.0-win.zip",
  // ORION DEMO: l'assaggio scaricabile — LIBERO anche a lancio chiuso.
  demo_mac: "download/ORION-Demo-1.0.0-arm64.dmg",
  demo_win: "download/ORION-Demo-1.0.0-win.zip",
};

// Le varianti demo non passano dal lucchetto del lancio.
export const DOWNLOAD_LIBERI = new Set(["demo_mac", "demo_win"]);

export function clientR2(): S3Client | null {
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) return null;
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
}

export const bucketR2 = () => process.env.R2_BUCKET || "database-orion";
