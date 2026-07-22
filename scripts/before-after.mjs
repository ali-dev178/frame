// Build "before -> after" comparison images: the original photo beside the
// framed result, so the README shows exactly what Frame does.
// Prereq: dev server on http://localhost:5173. Usage: node scripts/before-after.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "screenshots");
const URL = process.env.SHOT_URL || "http://localhost:5173/";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bufOf = (d) => Buffer.from(d.split(",")[1], "base64");

async function makeImages(page) {
  return page.evaluate(() => {
    function paint(w, h, stops, label) {
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const c = cv.getContext("2d");
      const g = c.createLinearGradient(0, 0, w, h);
      stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const rg = c.createRadialGradient(w * 0.68, h * 0.3, 10, w * 0.68, h * 0.3, Math.max(w, h) * 0.45);
      rg.addColorStop(0, "rgba(255,255,255,.9)"); rg.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = rg; c.fillRect(0, 0, w, h);
      c.fillStyle = "rgba(0,0,0,.2)"; c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, h * 0.7 + Math.sin(x / 70) * h * 0.06);
      c.lineTo(w, h); c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,.92)";
      c.font = "bold " + Math.round(Math.min(w, h) * 0.07) + "px sans-serif";
      c.fillText(label, w * 0.05, h * 0.14);
      return cv.toDataURL("image/png");
    }
    return {
      wide: paint(1600, 900, ["#0f2027", "#2c5364", "#e0894b"], "Coastline"),   // 16:9 -> tall Story
      tall: paint(1200, 1900, ["#3a1c71", "#d76d77", "#ffaf7b"], "Canyon"),      // ~9:14 -> Square
    };
  });
}

/** In-page: compose [original | → | framed] onto one dark canvas, return a PNG dataURL. */
async function compose(page, origUrl, framedUrl, label) {
  return page.evaluate(async ({ origUrl, framedUrl, label }) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const [o, f] = await Promise.all([load(origUrl), load(framedUrl)]);
    const PH = 760, PW = 640, GAP = 120, PAD = 56, CAP = 64;
    const W = PAD * 2 + PW * 2 + GAP, H = PAD + CAP + PH + PAD;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    c.fillStyle = "#15140f"; c.fillRect(0, 0, W, H);
    function panel(img, x, caption, accent) {
      const scale = Math.min(PW / img.width, PH / img.height);
      const w = img.width * scale, h = img.height * scale;
      const px = x + (PW - w) / 2, py = PAD + CAP + (PH - h) / 2;
      c.save();
      c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 24; c.shadowOffsetY = 8;
      c.drawImage(img, px, py, w, h);
      c.restore();
      c.strokeStyle = "rgba(255,255,255,.09)"; c.lineWidth = 1; c.strokeRect(px + .5, py + .5, w - 1, h - 1);
      c.fillStyle = accent; c.font = "600 26px sans-serif"; c.textBaseline = "alphabetic";
      c.fillText(caption, x, PAD + 40);
    }
    panel(o, PAD, "BEFORE — your photo", "#9a948a");
    panel(f, PAD + PW + GAP, label, "#e0b452");
    // arrow in the gap
    const ay = PAD + CAP + PH / 2, ax = PAD + PW + GAP / 2;
    c.strokeStyle = "#e0b452"; c.fillStyle = "#e0b452"; c.lineWidth = 4; c.lineCap = "round";
    c.beginPath(); c.moveTo(ax - 26, ay); c.lineTo(ax + 14, ay); c.stroke();
    c.beginPath(); c.moveTo(ax + 14, ay - 12); c.lineTo(ax + 30, ay); c.lineTo(ax + 14, ay + 12); c.closePath(); c.fill();
    return cv.toDataURL("image/png");
  }, { origUrl, framedUrl, label });
}

async function pair(page, fileDataUrl, formatText, label, outName) {
  // pick the Instagram target by its button label
  await page.click(`#segTarget button:has-text("${formatText}")`);
  await sleep(300);
  // load the photo
  const path = join(OUT, "_ba-tmp.png");
  writeFileSync(path, bufOf(fileDataUrl));
  await page.setInputFiles("#file", [path]);
  await page.waitForSelector(".card canvas", { timeout: 15000 });
  await sleep(700);
  const framedUrl = await page.evaluate(() => document.querySelector(".card canvas").toDataURL("image/png"));
  const out = await compose(page, fileDataUrl, framedUrl, label);
  writeFileSync(join(OUT, outName), bufOf(out));
  console.log("  ✓", outName);
  await page.click("#clear"); // reset for the next pair
  await sleep(400);
}

async function main() {
  const browser = await chromium.launch({ channel: "chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("about:blank");
  const imgs = await makeImages(page);
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(600);
  // use the Blurred-photo fill — the most visually striking margin style
  await page.click('#segMode button:has-text("Blurred photo")').catch(() => {});
  await sleep(300);
  console.log("→ composing before/after pairs");
  await pair(page, imgs.wide, "Story 9:16", "AFTER — Framed · Story 9:16", "00-before-after-story.png");
  await pair(page, imgs.tall, "Post 1:1", "AFTER — Framed · Post 1:1", "00-before-after-square.png");
  await browser.close();
  console.log("done →", OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
