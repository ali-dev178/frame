import { beforeEach, describe, expect, it } from "vitest";
import { computeColors } from "../../src/core/colors";
import { MODES } from "../../src/core/config";
import { buildCanvas } from "../../src/render/frame";
import { drawClipFrame } from "../../src/render/sequence";
import { S } from "../../src/state";
import type { Item } from "../../src/types";

/**
 * THE invariant: the picture region of every framed output must be
 * bit-for-bit identical to the uploaded photo — for every fill mode,
 * every orientation, and every shading level. Runs in real Chromium.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseData(w: number, h: number, seed: number): ImageData {
  const im = new ImageData(w, h);
  const rnd = mulberry32(seed);
  for (let i = 0; i < im.data.length; i += 4) {
    im.data[i] = (rnd() * 256) | 0;
    im.data[i + 1] = (rnd() * 256) | 0;
    im.data[i + 2] = (rnd() * 256) | 0;
    im.data[i + 3] = 255; // fully opaque, like a photo
  }
  return im;
}

/** Worst-case photo: pure per-pixel noise survives NO resampling undetected. */
async function makeItem(w: number, h: number, seed: number): Promise<{ it: Item; src: ImageData }> {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const src = noiseData(w, h, seed);
  ctx.putImageData(src, 0, 0);
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("test image failed to load"));
    img.src = c.toDataURL("image/png"); // PNG round-trip is lossless
  });
  const it: Item = {
    id: 1, name: "noise.png", file: new File([], "noise.png"), img,
    iw: w, ih: h, edges: null, grad: null, canvas: null, el: null,
  };
  computeColors(it);
  return { it, src };
}

function countRegionDiffs(cv: HTMLCanvasElement, dx: number, dy: number, src: ImageData): number {
  const got = cv.getContext("2d")!.getImageData(dx, dy, src.width, src.height).data;
  const want = src.data;
  let diffs = 0;
  for (let i = 0; i < want.length; i++) {
    if (got[i] !== want[i]) diffs++;
  }
  return diffs;
}

function resetSettings(): void {
  S.tab = "post";
  S.targetByTab = { post: "post-4x5", story: "story", reel: "reel", profile: "profile" };
  S.mode = "edges";
  S.blur = 55;
  S.dark = 22;
  S.solidMode = "auto";
  S.solidColor = "#101010";
  S.motion = "static";
}

beforeEach(resetSettings);

describe("lossless invariant — framed images", () => {
  for (const mode of MODES.map((m) => m.key)) {
    it(`keeps the photo bit-identical with the "${mode}" fill (side bars)`, async () => {
      const { it: item, src } = await makeItem(37, 61, 1000); // odd dims, tall -> side bars
      S.mode = mode;
      const out = buildCanvas(item);
      expect(out.cw).toBeGreaterThan(item.iw); // bars were actually added
      expect(countRegionDiffs(out.cv, out.dx, out.dy, src)).toBe(0);
    });

    it(`keeps the photo bit-identical with the "${mode}" fill (top/bottom bars)`, async () => {
      const { it: item, src } = await makeItem(61, 37, 2000); // wide -> top/bottom bars
      S.mode = mode;
      const out = buildCanvas(item);
      expect(out.ch).toBeGreaterThan(item.ih);
      expect(countRegionDiffs(out.cv, out.dx, out.dy, src)).toBe(0);
    });
  }

  it("survives maximum edge shading", async () => {
    const { it: item, src } = await makeItem(37, 61, 3000);
    S.dark = 100;
    const out = buildCanvas(item);
    expect(countRegionDiffs(out.cv, out.dx, out.dy, src)).toBe(0);
  });

  it("survives maximum blur with the frosted fill", async () => {
    const { it: item, src } = await makeItem(37, 61, 4000);
    S.mode = "frosted";
    S.blur = 100;
    const out = buildCanvas(item);
    expect(countRegionDiffs(out.cv, out.dx, out.dy, src)).toBe(0);
  });

  it("an exact-ratio photo produces a same-size canvas (passthrough shape)", async () => {
    const { it: item, src } = await makeItem(40, 50, 5000); // exactly 4:5
    const out = buildCanvas(item);
    expect(out.cw).toBe(40);
    expect(out.ch).toBe(50);
    expect(out.dx).toBe(0);
    expect(out.dy).toBe(0);
    expect(countRegionDiffs(out.cv, 0, 0, src)).toBe(0);
  });

  it("works across every format tab", async () => {
    for (const [tab, key] of [["post", "post-1x1"], ["post", "post-191"], ["story", "story"], ["reel", "reel"], ["profile", "profile"]]) {
      resetSettings();
      S.tab = tab;
      S.targetByTab[tab] = key;
      const { it: item, src } = await makeItem(37, 61, 6000);
      const out = buildCanvas(item);
      expect(countRegionDiffs(out.cv, out.dx, out.dy, src), `tab=${tab} target=${key}`).toBe(0);
    }
  });
});

describe("lossless invariant — video frames (Still + Cut)", () => {
  it("copies an exact-size static clip 1:1 and duplicates (never removes) the odd edge", async () => {
    const w = 39, h = 49; // both odd — the encoder needs 40×50
    const { it: item, src } = await makeItem(w, h, 7000);
    // the item's framed canvas IS the source of video frames — use the photo itself
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    cv.getContext("2d")!.putImageData(src, 0, 0);
    item.canvas = cv;

    const W = w + 1, H = h + 1; // outDims' even-rounding
    const frame = document.createElement("canvas");
    frame.width = W; frame.height = H;
    const c2 = frame.getContext("2d")!;
    S.motion = "static";
    drawClipFrame(c2, W, H, item, 0);

    // interior: bit-identical
    expect(countRegionDiffs(frame, 0, 0, src)).toBe(0);
    // duplicated edge column/row: equals the source's last column/row
    const got = c2.getImageData(0, 0, W, H).data;
    const at = (x: number, y: number) => (y * W + x) * 4;
    const sat = (x: number, y: number) => (y * w + x) * 4;
    for (let y = 0; y < h; y++) {
      for (let k = 0; k < 3; k++) {
        expect(got[at(w, y) + k]).toBe(src.data[sat(w - 1, y) + k]);
      }
    }
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) {
        expect(got[at(x, h) + k]).toBe(src.data[sat(x, h - 1) + k]);
      }
    }
  });
});
