// Capture README screenshots by driving the running dev app with Playwright.
// Prereq: `npm run dev` (or dev:desktop) serving http://localhost:5173.
// Usage: node scripts/shots.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "screenshots");
const URL = process.env.SHOT_URL || "http://localhost:5173/";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Draw a few photo-like gradient images in the browser and return PNG dataURLs. */
async function makeImages(page) {
  return page.evaluate(() => {
    function paint(w, h, stops, label) {
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const c = cv.getContext("2d");
      const g = c.createLinearGradient(0, 0, w, h);
      stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      // a soft sun / focal blob
      const rg = c.createRadialGradient(w * 0.7, h * 0.28, 10, w * 0.7, h * 0.28, Math.min(w, h) * 0.5);
      rg.addColorStop(0, "rgba(255,255,255,.85)"); rg.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = rg; c.fillRect(0, 0, w, h);
      // rolling hills
      c.fillStyle = "rgba(0,0,0,.18)";
      c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 20) c.lineTo(x, h * 0.72 + Math.sin(x / 90) * h * 0.05);
      c.lineTo(w, h); c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,.9)";
      c.font = "bold " + Math.round(h * 0.05) + "px sans-serif";
      c.fillText(label, w * 0.06, h * 0.12);
      return cv.toDataURL("image/png");
    }
    return {
      tall: paint(1200, 1600, ["#3a1c71", "#d76d77", "#ffaf7b"], "Sunrise · 3:4"),
      wide: paint(1600, 900, ["#0f2027", "#203a43", "#2c5364"], "Coastline · 16:9"),
      square: paint(1400, 1400, ["#42275a", "#734b6d"], "Dusk · 1:1"),
      portrait2: paint(1200, 1500, ["#1a2980", "#26d0ce"], "Harbor · 4:5"),
    };
  });
}

function dataUrlToBuffer(d) { return Buffer.from(d.split(",")[1], "base64"); }

/** Minimal 3s mono sine WAV so the soundtrack UI has a real, decodable track. */
function makeWav() {
  const sr = 44100, secs = 3, n = sr * secs;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.3 * 32767;
    buf.writeInt16LE(v | 0, 44 + i * 2);
  }
  return buf;
}

async function shot(page, name, target) {
  const opts = { path: join(OUT, name + ".png") };
  if (target) { await (await page.locator(target).first()).screenshot(opts); }
  else { await page.screenshot({ ...opts, fullPage: true }); }
  console.log("  ✓", name + ".png");
}

async function main() {
  const browser = await chromium.launch({ channel: "chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  console.log("→ generating sample media");
  await page.goto("about:blank");
  const imgs = await makeImages(page);
  const files = {
    tall: join(OUT, "_sample-tall.png"),
    wide: join(OUT, "_sample-wide.png"),
    square: join(OUT, "_sample-square.png"),
    portrait2: join(OUT, "_sample-portrait2.png"),
    wav: join(OUT, "_sample-audio.wav"),
  };
  writeFileSync(files.tall, dataUrlToBuffer(imgs.tall));
  writeFileSync(files.wide, dataUrlToBuffer(imgs.wide));
  writeFileSync(files.square, dataUrlToBuffer(imgs.square));
  writeFileSync(files.portrait2, dataUrlToBuffer(imgs.portrait2));
  writeFileSync(files.wav, makeWav());

  console.log("→ loading app", URL);
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(600);

  // ---- Frame tab: load photos ----
  await page.setInputFiles("#file", [files.tall, files.wide, files.square]);
  await page.waitForSelector(".card canvas", { timeout: 15000 });
  await sleep(900);
  await shot(page, "01-frame-overview");
  await shot(page, "02-topbar-formats", "#topbar");
  await shot(page, "03-frame-controls", "#framePanel");
  await shot(page, "04-photo-card", ".card");

  // bounds guide on
  await page.check("#bounds").catch(() => {});
  await sleep(500);
  await shot(page, "05-bounds-guide", ".card");
  await page.uncheck("#bounds").catch(() => {});

  // ---- Video tab ----
  await page.click("#navVideo");
  await sleep(500);
  await page.click("#selAll"); // select all -> clips
  await page.waitForSelector("#vlane .vclip, #vlane > *", { timeout: 8000 }).catch(() => {});
  await sleep(900);
  await shot(page, "06-video-overview", "#videoPanel");

  // add music
  await page.setInputFiles("#audioFile", [files.wav]).catch(() => {});
  await sleep(1200);
  await shot(page, "07-soundtrack", "#videoPanel");

  // select a clip -> contextual editor
  const clip = page.locator("#vlane .vclip, #vlane > *").first();
  await clip.click({ position: { x: 12, y: 12 } }).catch(() => {});
  await sleep(400);
  await page.fill("#ctText", "Golden hour").catch(() => {});
  await sleep(400);
  await shot(page, "08-clip-editor", "#cliptool");

  // title card
  await page.click("#addTitle").catch(() => {});
  await sleep(400);
  await page.fill("#ctTitle", "My Trip").catch(() => {});
  await sleep(500);
  await shot(page, "09-title-card", "#cliptool");

  // export hint (size / audio-fit heads-up)
  await page.evaluate(() => document.getElementById("expHint")?.scrollIntoView({ block: "center" }));
  await sleep(400);
  await shot(page, "10-export-hint", "#expHint");

  // per-photo Framed / Original — flip the middle card to Original
  const toggles = page.locator("#grid .card .frmtoggle");
  if (await toggles.count() > 1) { await toggles.nth(1).click().catch(() => {}); }
  await sleep(500);
  await shot(page, "11-per-photo-framed", "#grid");

  await browser.close();
  console.log("done →", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
