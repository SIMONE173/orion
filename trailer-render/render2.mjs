// Render DETERMINISTICO del trailer: carica orion-trailer.html, avanza l'orologio
// window.__setT(T) frame per frame, fotografa ogni frame (JPEG) e codifica a 30fps
// con ffmpeg-static. Niente cattura "in tempo reale" → zero stutter, sync audio perfetto.
//   node render2.mjs              → trailer intero (silenzioso) in video-silent.mp4
//   node render2.mjs 12           → solo i primi 12s (smoke test)  → video-test.mp4
import puppeteer from "puppeteer-core";
import ffmpegPath from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DIR = import.meta.dirname;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const HTML = pathToFileURL(path.join(DIR, "orion-trailer.html")).href + "?still=1";
const FPS = 30;
const maxSec = process.argv[2] ? Number(process.argv[2]) : 0;
const isTest = maxSec > 0;
const FRAMES = path.join(DIR, isTest ? "frames_test" : "frames");
const OUT = path.join(DIR, isTest ? "video-test.mp4" : "video-silent.mp4");

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--enable-gpu",
    "--use-angle=metal",
    "--enable-features=Vulkan",
    "--disable-features=CalculateNativeWinOcclusion",
    "--force-device-scale-factor=1",
  ],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto(HTML, { waitUntil: "networkidle0" });
await page.waitForFunction("window.__total > 0", { timeout: 20000 });
const total = await page.evaluate("window.__total");
const stopMs = isTest ? Math.min(total, maxSec * 1000) : total;
const nFrames = Math.round((stopMs / 1000) * FPS);
console.log(`durata: ${(total / 1000).toFixed(1)}s · rendo ${nFrames} frame @ ${FPS}fps${isTest ? " (TEST)" : ""}`);

await new Promise((r) => setTimeout(r, 600)); // settle font/layout

const t0 = Date.now();
for (let i = 0; i < nFrames; i++) {
  const T = (i * 1000) / FPS;
  await page.evaluate((t) => window.__setT(t), T);
  await page.screenshot({
    path: path.join(FRAMES, String(i).padStart(5, "0") + ".jpg"),
    type: "jpeg",
    quality: 94,
    optimizeForSpeed: true,
  });
  if (i % 60 === 0) {
    const pct = ((i / nFrames) * 100).toFixed(0);
    const eta = i ? (((Date.now() - t0) / i) * (nFrames - i) / 1000).toFixed(0) : "—";
    process.stdout.write(`\r  frame ${i}/${nFrames} (${pct}%) · ETA ${eta}s   `);
  }
}
process.stdout.write("\n");
await browser.close();

console.log("codifico con ffmpeg…");
const args = [
  "-y",
  "-framerate", String(FPS),
  "-i", path.join(FRAMES, "%05d.jpg"),
  "-c:v", "libx264",
  "-crf", "16",
  "-preset", "slow",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  OUT,
];
const r = spawnSync(ffmpegPath, args, { stdio: "inherit" });
if (r.status === 0) console.log("\n✓ video (muto) pronto:", OUT);
process.exit(r.status || 0);
