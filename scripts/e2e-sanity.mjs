// End-to-end sanity pass against the BUILT web app: load a photo through the
// real UI, verify losslessness, build a timeline, then reload and restore the
// session. Run with the preview server up, or let this script start one:
//   node scripts/e2e-sanity.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const PORT = 4179;
const URL = `http://localhost:${PORT}/`;

function fail(msg) { console.error("E2E FAIL:", msg); process.exit(1); }

// serve dist-web
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  shell: true, stdio: "pipe",
});
try {
  // poll the port rather than parse CLI output
  await (async () => {
    for (let i = 0; i < 60; i++) {
      try { await fetch(URL); return; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("preview server did not start");
  })();

  const browser = await chromium.launch({ channel: "chromium" });
  const ctx = await browser.newContext(); // fresh profile → clean IndexedDB
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto(URL);
  await page.waitForSelector("#tabs button"); // app booted under CSP

  // a real test photo (noise, odd dims) generated in-page, saved, loaded via the real file input
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 37; c.height = 61;
    const x = c.getContext("2d");
    const im = x.createImageData(37, 61);
    let s = 42;
    for (let i = 0; i < im.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      im.data[i] = s & 255; im.data[i + 1] = (s >> 8) & 255; im.data[i + 2] = (s >> 16) & 255; im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    return c.toDataURL("image/png");
  });
  const tmp = path.join(os.tmpdir(), "frame-e2e-test.png");
  fs.writeFileSync(tmp, Buffer.from(dataUrl.split(",")[1], "base64"));
  await page.setInputFiles("#file", tmp);

  // card appears, Verify proves the lossless invariant through the REAL UI
  await page.waitForSelector(".card .vfy");
  await page.click(".card .vfy");
  await page.waitForFunction(() => document.querySelector(".card .vfy")?.textContent?.includes("0.000% loss"), null, { timeout: 10000 });
  console.log("✓ photo loaded, Verify = 0.000% loss");

  // tick it into the video timeline
  await page.click(".card .pick input");
  await page.waitForFunction(() => document.querySelector("#seqInfo")?.textContent?.includes("1 clip"));
  console.log("✓ clip on the timeline");

  // give the debounced autosave time, then ALSO rely on the pagehide flush
  await page.waitForTimeout(1600);

  // reload = new session → the restore bar must offer the previous one
  await page.reload();
  await page.waitForSelector(".restoreBar", { timeout: 10000 });
  const barText = await page.textContent(".restoreBar .rinfo");
  if (!barText.includes("1 photo")) fail("restore bar text unexpected: " + barText);
  console.log("✓ restore bar offered:", barText.trim());

  await page.click("#restoreYes");
  await page.waitForSelector(".card .vfy", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("#seqInfo")?.textContent?.includes("1 clip"), null, { timeout: 10000 });
  // and the restored photo is STILL pixel-perfect
  await page.click(".card .vfy");
  await page.waitForFunction(() => document.querySelector(".card .vfy")?.textContent?.includes("0.000% loss"), null, { timeout: 10000 });
  console.log("✓ session restored — photo back on the timeline, still 0.000% loss");

  const realErrors = errors.filter((e) => !e.includes("favicon"));
  if (realErrors.length) fail("page errors:\n" + realErrors.join("\n"));

  await browser.close();
  console.log("E2E SANITY PASS");
} catch (e) {
  fail(e.message);
} finally {
  server.kill();
}
