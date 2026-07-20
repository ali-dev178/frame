// Generates the app icon set from a canvas drawing (brand: brass "F." on warm
// near-black, matching the app's UI). Re-run after design changes:
//   node scripts/make-icons.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const HTML = `<!DOCTYPE html><canvas id="c" width="1024" height="1024"></canvas><script>
function draw(scale, fullBleed) {
  const c = document.getElementById("c"), x = c.getContext("2d");
  x.clearRect(0, 0, 1024, 1024);
  x.save();
  const g = x.createLinearGradient(0, 0, 1024, 1024);
  g.addColorStop(0, "#221f15");
  g.addColorStop(1, "#0e0d09");
  x.fillStyle = g;
  if (fullBleed) {
    // maskable: launchers apply THEIR OWN mask — the whole square must be painted
    x.fillRect(0, 0, 1024, 1024);
  } else {
    x.beginPath(); x.roundRect(0, 0, 1024, 1024, 224); x.fill();
  }
  // content, scaled about the center for the maskable variant
  x.translate(512, 512); x.scale(scale, scale); x.translate(-512, -512);
  // brass frame — the product, literally
  x.beginPath(); x.roundRect(96, 96, 832, 832, 120);
  x.lineWidth = 30; x.strokeStyle = "#c9a24b"; x.stroke();
  // inner hairline
  x.beginPath(); x.roundRect(150, 150, 724, 724, 88);
  x.lineWidth = 6; x.strokeStyle = "rgba(201,162,75,0.35)"; x.stroke();
  // the mark
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = "600 460px Georgia, 'Times New Roman', serif";
  x.fillStyle = "#ece7d9";
  x.fillText("F", 475, 512);
  x.fillStyle = "#c9a24b";
  x.font = "600 480px Georgia, 'Times New Roman', serif";
  x.fillText(".", 675, 480);
  x.restore();
}
function grab(size, scale, fullBleed) {
  draw(scale, fullBleed);
  const c = document.getElementById("c");
  if (size === 1024) return c.toDataURL("image/png");
  const s = document.createElement("canvas");
  s.width = size; s.height = size;
  const sx = s.getContext("2d");
  sx.imageSmoothingQuality = "high";
  sx.drawImage(c, 0, 0, size, size);
  return s.toDataURL("image/png");
}
</script>`;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage();
await page.setContent(HTML);

const outputs = [
  { file: "build/icon.png", size: 1024, scale: 1, fullBleed: false },          // electron-builder source (→ ico + icns)
  { file: "public/icons/icon-512.png", size: 512, scale: 1, fullBleed: false },
  { file: "public/icons/icon-192.png", size: 192, scale: 1, fullBleed: false },
  { file: "public/icons/maskable-512.png", size: 512, scale: 0.78, fullBleed: true }, // content in safe zone, square painted edge-to-edge
];

for (const o of outputs) {
  const dataUrl = await page.evaluate(([size, scale, fullBleed]) => grab(size, scale, fullBleed), [o.size, o.scale, o.fullBleed]);
  fs.mkdirSync(path.dirname(o.file), { recursive: true });
  fs.writeFileSync(o.file, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("wrote", o.file);
}

await browser.close();
