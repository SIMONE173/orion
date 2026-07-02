// Renderizza il trailer (http://localhost:3000/trailer?auto=1) in un MP4.
// Cattura i fotogrammi in tempo reale via CDP screencast (così le animazioni CSS
// del nucleo + le scene restano sincronizzate) e li codifica con ffmpeg-static.
// Uso: node render.mjs [secondiMax]   (senza argomento = trailer intero)
import puppeteer from "puppeteer-core";
import ffmpegPath from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:3000/trailer?auto=1";
const FRAMES = path.join(import.meta.dirname, "frames");
const OUT = path.join(import.meta.dirname, "ORION-trailer.mp4");
const maxSec = process.argv[2] ? Number(process.argv[2]) : 0;

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--force-color-profile=srgb",
    "--enable-gpu",
    "--use-angle=metal",
    "--enable-features=Vulkan",
    "--disable-features=CalculateNativeWinOcclusion",
  ],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500)); // font/idratazione
await page.waitForFunction("window.__total > 0", { timeout: 20000 });
const total = await page.evaluate("window.__total");
const stopAt = maxSec ? Math.min(total, maxSec * 1000) : total;
console.log("durata trailer:", (total / 1000).toFixed(1), "s — cattura fino a", (stopAt / 1000).toFixed(1), "s");

const client = await page.target().createCDPSession();
const frames = [];
let logged = false;
client.on("Page.screencastFrame", async (f) => {
  if (!logged) {
    logged = true;
    console.log("frame", f.metadata.deviceWidth + "x" + f.metadata.deviceHeight, "(device px)");
  }
  frames.push({ data: f.data, ts: f.metadata.timestamp });
  try {
    await client.send("Page.screencastFrameAck", { sessionId: f.sessionId });
  } catch {}
});
await client.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1, maxWidth: 3840, maxHeight: 2160 });

const startWall = Date.now();
for (;;) {
  const t = await page.evaluate("window.__t");
  if (t >= stopAt - 60) break;
  if (Date.now() - startWall > stopAt + 25000) break; // sicurezza
  await new Promise((r) => setTimeout(r, 150));
}
await client.send("Page.stopScreencast").catch(() => {});
await browser.close();

if (frames.length < 5) {
  console.error("Troppo pochi fotogrammi:", frames.length);
  process.exit(1);
}
let i = 0;
for (const fr of frames) {
  fs.writeFileSync(path.join(FRAMES, String(i).padStart(5, "0") + ".jpg"), Buffer.from(fr.data, "base64"));
  i++;
}
const dur = frames[frames.length - 1].ts - frames[0].ts;
const fps = (frames.length - 1) / dur;
console.log("fotogrammi:", frames.length, "· fps medio:", fps.toFixed(1), "· durata:", dur.toFixed(1) + "s");

const args = [
  "-y",
  "-framerate",
  fps.toFixed(3),
  "-i",
  path.join(FRAMES, "%05d.jpg"),
  "-vf",
  "fps=30,format=yuv420p",
  "-c:v",
  "libx264",
  "-crf",
  "17",
  "-preset",
  "medium",
  OUT,
];
const r = spawnSync(ffmpegPath, args, { stdio: "inherit" });
if (r.status === 0) console.log("\n✓ MP4 pronto:", OUT);
process.exit(r.status || 0);
