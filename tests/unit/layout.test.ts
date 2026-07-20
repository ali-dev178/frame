import { describe, expect, it } from "vitest";
import { layout } from "../../src/core/layout";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("layout", () => {
  it("adds side bars for a photo taller than the target ratio", () => {
    const L = layout(1080, 1920, 4 / 5); // 9:16 photo into 4:5
    expect(L.orient).toBe("sides");
    expect(L.ch).toBe(1920);
    expect(L.cw).toBe(Math.round(1920 * (4 / 5)));
    expect(L.cw).toBeGreaterThan(1080);
  });

  it("adds top/bottom bars for a photo wider than the target ratio", () => {
    const L = layout(1920, 1080, 1); // 16:9 photo into square
    expect(L.orient).toBe("vert");
    expect(L.cw).toBe(1920);
    expect(L.ch).toBe(1920);
  });

  it("detects an exact match as passthrough (orient none)", () => {
    const L = layout(1080, 1350, 4 / 5);
    expect(L.orient).toBe("none");
    expect(L.cw).toBe(1080);
    expect(L.ch).toBe(1350);
    expect(L.dx).toBe(0);
    expect(L.dy).toBe(0);
  });

  it("treats a frame that ROUNDS to the photo's own size as passthrough", () => {
    // 1000×1000 into r=1.0004: cw = round(1000*1.0004) = 1000 -> already fits
    const L = layout(1000, 1000, 1.0004);
    expect(L.orient).toBe("none");
    expect(L.cw).toBe(1000);
    expect(L.ch).toBe(1000);
  });

  it("NEVER shrinks the photo: canvas always contains it at full size", () => {
    const rnd = mulberry32(42);
    const ratios = [1, 4 / 5, 1.91, 9 / 16];
    for (let n = 0; n < 500; n++) {
      const iw = 1 + Math.floor(rnd() * 4000);
      const ih = 1 + Math.floor(rnd() * 4000);
      const r = ratios[Math.floor(rnd() * ratios.length)];
      const L = layout(iw, ih, r);
      expect(L.cw).toBeGreaterThanOrEqual(iw);
      expect(L.ch).toBeGreaterThanOrEqual(ih);
      // photo fits fully inside the canvas at its offset
      expect(L.dx).toBeGreaterThanOrEqual(0);
      expect(L.dy).toBeGreaterThanOrEqual(0);
      expect(L.dx + iw).toBeLessThanOrEqual(L.cw);
      expect(L.dy + ih).toBeLessThanOrEqual(L.ch);
      // margins only ever grow ONE axis
      if (L.orient === "sides") expect(L.ch).toBe(ih);
      if (L.orient === "vert") expect(L.cw).toBe(iw);
      if (L.orient === "none") { expect(L.cw).toBe(iw); expect(L.ch).toBe(ih); }
      // centered within 1px rounding
      expect(Math.abs(L.cw - iw - 2 * L.dx)).toBeLessThanOrEqual(1);
      expect(Math.abs(L.ch - ih - 2 * L.dy)).toBeLessThanOrEqual(1);
    }
  });
});
