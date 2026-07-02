// Cattura still ai tempi indicati (ms) per validare le scene senza rifare tutto.
import puppeteer from "puppeteer-core";
import path from "node:path";
import { pathToFileURL } from "node:url";
const DIR = import.meta.dirname;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const HTML = pathToFileURL(path.join(DIR, "orion-trailer.html")).href + "?still=1";
const times = process.argv.slice(2).map(Number);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ["--hide-scrollbars","--force-color-profile=srgb","--enable-gpu","--use-angle=metal","--force-device-scale-factor=1"],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 } });
const page = await browser.newPage();
await page.goto(HTML, { waitUntil: "networkidle0" });
await page.waitForFunction("window.__total > 0");
await new Promise(r=>setTimeout(r,500));
for (const T of times){
  await page.evaluate(t=>window.__setT(t), T);
  const f = path.join("/tmp", "still_"+T+".jpg");
  await page.screenshot({ path: f, type:"jpeg", quality:92 });
  console.log("ok", f);
}
await browser.close();
