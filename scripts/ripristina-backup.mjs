#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// RIPRISTINO di un backup ORION cifrato (creato da src/lib/backup-remoto.ts).
//
//   node scripts/ripristina-backup.mjs <file.db.gz.enc> [destinazione.db]
//
// Serve la chiave con cui è stato cifrato, in env:
//   BACKUP_ENC_KEY="..." node scripts/ripristina-backup.mjs orion-2026-07-12.db.gz.enc
//
// Il file si scarica dal bucket R2 (dashboard Cloudflare → R2 → orion-backups
// → giornalieri/ o settimanali/ → Download). Lo script decifra, decomprime,
// verifica che sia un database SQLite valido e scrive la destinazione
// (default: ./orion-ripristinato.db). Poi basta sostituire orion.db nel
// DATA_DIR (a servizio fermo) e riavviare.
// ──────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import zlib from "node:zlib";
import fs from "node:fs";

const [, , sorgente, destinazione = "orion-ripristinato.db"] = process.argv;
const MAGIC = Buffer.from("ORIONBK1");

function esci(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!sorgente) esci("Uso: node scripts/ripristina-backup.mjs <file.db.gz.enc> [destinazione.db]");
if (!fs.existsSync(sorgente)) esci(`File non trovato: ${sorgente}`);
const raw = process.env.BACKUP_ENC_KEY || process.env.ORION_ENC_KEY;
if (!raw) esci("Serve la chiave: BACKUP_ENC_KEY=\"...\" (la stessa configurata su Railway)");

const dati = fs.readFileSync(sorgente);
if (!dati.subarray(0, 8).equals(MAGIC)) esci("Questo file non è un backup ORION (magic mancante).");

const key = crypto.createHash("sha256").update(String(raw)).digest();
const iv = dati.subarray(8, 20);
const tag = dati.subarray(20, 36);
const enc = dati.subarray(36);

let db;
try {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  db = zlib.gunzipSync(Buffer.concat([decipher.update(enc), decipher.final()]));
} catch {
  esci("Decifratura fallita: chiave sbagliata o file danneggiato.");
}

// Un database SQLite inizia con questa firma: se non c'è, qualcosa non va.
if (!db.subarray(0, 16).equals(Buffer.from("SQLite format 3\0", "latin1"))) {
  esci("Il contenuto decifrato non è un database SQLite.");
}

fs.writeFileSync(destinazione, db);
console.log(`✓ Ripristinato: ${destinazione} (${(db.length / 1024 / 1024).toFixed(1)} MB)`);
console.log("  Ora: ferma il servizio → sostituisci orion.db nel DATA_DIR → riavvia.");
