// Build a "one photo -> every format" hero montage: the original beside the
// same photo framed into several social formats. Prereq: dev server on :5173.
// Usage: node scripts/hero.mjs
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

async function makePhoto(page) {
  return page.evaluate(() => {
    const w = 1400, h = 1050; // 4:3 — needs framing in most targets
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const c = cv.getContext("2d");
    const g = c.createLinearGradient(0, 0, w, h);
    ["#2b5876", "#4e4376", "#e0894b"].forEach((s, i, a) => g.addColorStop(i / (a.length - 1), s));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const rg = c.createRadialGradient(w * 0.66, h * 0.32, 10, w * 0.66, h * 0.32, Math.max(w, h) * 0.5);
    rg.addColorStop(0, "rgba(255,255,255,.92)"); rg.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = rg; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(0,0,0,.2)"; c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w; x += 14) c.lineTo(x, h * 0.68 + Math.sin(x / 60) * h * 0.07);
    c.lineTo(w, h); c.closePath(); c.fill();
    return cv.toDataURL("image/png");
  });
}

async function framedFor(page, formatText, photoPath) {
  await page.click(`#segTarget button:has-text("${formatText}")`);
  await sleep(250);
  await page.setInputFiles("#file", [photoPath]);
  await page.waitForSelector(".card canvas", { timeout: 15000 });
  await sleep(500);
  const url = await page.evaluate(() => document.querySelector(".card canvas").toDataURL("image/png"));
  await page.click("#clear");
  await sleep(300);
  return url;
}

async function compose(page, origUrl, panels) {
  return page.evaluate(async ({ origUrl, panels }) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const orig = await load(origUrl);
    const imgs = await Promise.all(panels.map((p) => load(p.url)));
    const PH = 460, GAP = 34, PAD = 60, TITLE = 96, CAP = 46;
    const widthOf = (img) => (img.width / img.height) * PH;
    const items = [{ img: orig, label: "YOUR PHOTO", accent: "#9a948a" },
      ...imgs.map((img, i) => ({ img, label: panels[i].label, accent: "#e0b452" }))];
    const totalW = items.reduce((s, it) => s + widthOf(it.img), 0) + GAP * (items.length - 1);
    const W = PAD * 2 + totalW, H = PAD + TITLE + PH + CAP + PAD;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    c.fillStyle = "#15140f"; c.fillRect(0, 0, W, H);
    // title
    c.textBaseline = "alphabetic";
    c.fillStyle = "#f3ead6"; c.font = "700 46px sans-serif";
    c.fillText("One photo, every format — losslessly.", PAD, PAD + 44);
    c.fillStyle = "#9a948a"; c.font = "400 24px sans-serif";
    c.fillText("The original picture is never cropped or resized; only the margins are filled.", PAD, PAD + 80);
    // panels
    let x = PAD; const top = PAD + TITLE;
    items.forEach((it, i) => {
      const w = widthOf(it.img);
      c.save(); c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 20; c.shadowOffsetY = 6;
      c.drawImage(it.img, x, top, w, PH); c.restore();
      c.strokeStyle = i === 0 ? "rgba(255,255,255,.16)" : "rgba(224,180,82,.35)";
      c.lineWidth = i === 0 ? 1 : 2; c.strokeRect(x + .5, top + .5, w - 1, PH - 1);
      c.fillStyle = it.accent; c.font = "600 20px sans-serif"; c.textAlign = "center";
      c.fillText(it.label, x + w / 2, top + PH + 30); c.textAlign = "left";
      x += w + GAP;
    });
    return cv.toDataURL("image/png");
  }, { origUrl, panels });
}

async function main() {
  const browser = await chromium.launch({ channel: "chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("about:blank");
  const photo = await makePhoto(page);
  const photoPath = join(OUT, "_hero-src.png");
  writeFileSync(photoPath, bufOf(photo));
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(600);
  await page.click('#segMode button:has-text("Blurred photo")').catch(() => {});
  await sleep(300);
  console.log("→ framing photo into each format");
  const formats = [
    { text: "Story 9:16", label: "Story · 9:16" },
    { text: "Post 4:5", label: "Post · 4:5" },
    { text: "Post 1:1", label: "Square · 1:1" },
    { text: "Post 1.91:1", label: "Landscape · 1.91:1" },
  ];
  const panels = [];
  for (const f of formats) panels.push({ url: await framedFor(page, f.text, photoPath), label: f.label });
  const hero = await compose(page, photo, panels);
  writeFileSync(join(OUT, "hero.png"), bufOf(hero));
  console.log("  ✓ hero.png");
  await browser.close();
  console.log("done →", OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
