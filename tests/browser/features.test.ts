import { beforeEach, describe, expect, it } from "vitest";
import { idbDel, idbGet, idbSet } from "../../src/core/idb";
import { drawAtTime, drawClipFrame } from "../../src/render/sequence";
import { insertIndexAt } from "../../src/ui/timeline";
import { S, app } from "../../src/state";
import type { Item } from "../../src/types";

function noiseCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!;
  const im = new ImageData(w, h);
  let seed = 12345;
  for (let i = 0; i < im.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    im.data[i] = seed & 255; im.data[i + 1] = (seed >> 8) & 255; im.data[i + 2] = (seed >> 16) & 255; im.data[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  return cv;
}

function fakeItem(id: number, cv: HTMLCanvasElement): Item {
  return {
    id, name: "i" + id, file: new File([], "i" + id), img: null as unknown as HTMLImageElement,
    iw: cv.width, ih: cv.height, edges: null, grad: null, canvas: cv, el: null,
  };
}

function pixelsOf(cv: HTMLCanvasElement): Uint8ClampedArray {
  return cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
}

function countDiffs(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

beforeEach(() => {
  S.motion = "static"; S.trans = "none"; S.look = "none"; S.vfit = "framed";
  app.items = []; app.seq = []; app.tracks = [];
});

describe("color looks", () => {
  it('look "none" keeps the exact 1:1 copy path (bit-identical)', () => {
    const src = noiseCanvas(64, 64);
    const item = fakeItem(1, src);
    const out = document.createElement("canvas");
    out.width = 64; out.height = 64;
    drawClipFrame(out.getContext("2d")!, 64, 64, item, 0);
    expect(countDiffs(pixelsOf(out), pixelsOf(src))).toBe(0);
  });

  it("a non-none look changes pixels (color only — mono means r==g==b)", () => {
    const src = noiseCanvas(64, 64);
    const item = fakeItem(1, src);
    S.look = "mono";
    const out = document.createElement("canvas");
    out.width = 64; out.height = 64;
    drawClipFrame(out.getContext("2d")!, 64, 64, item, 0);
    const px = pixelsOf(out);
    expect(countDiffs(px, pixelsOf(src))).toBeGreaterThan(0);
    // mono means r == g == b everywhere
    for (let i = 0; i < px.length; i += 4) {
      expect(px[i]).toBe(px[i + 1]);
      expect(px[i + 1]).toBe(px[i + 2]);
    }
  });

  it("a look on an ODD-size still keeps 1:1 GEOMETRY (color changes, no resampling)", () => {
    const w = 63, h = 49; // odd — output canvas is 64×50
    const src = noiseCanvas(w, h);
    const item = fakeItem(1, src);
    S.look = "mono";

    const out = document.createElement("canvas");
    out.width = w + 1; out.height = h + 1;
    drawClipFrame(out.getContext("2d")!, w + 1, h + 1, item, 0);

    // reference: the same filter applied to a plain 1:1 draw — if the exact
    // path had fallen back to cover-scaling, pixels would differ everywhere
    const ref = document.createElement("canvas");
    ref.width = w; ref.height = h;
    const rc = ref.getContext("2d")!;
    rc.imageSmoothingEnabled = false;
    rc.filter = "grayscale(1) contrast(1.05)";
    rc.drawImage(src, 0, 0);
    rc.filter = "none";

    const got = out.getContext("2d")!.getImageData(0, 0, w, h).data;
    const want = pixelsOf(ref);
    expect(countDiffs(got, want)).toBe(0);
  });
});

describe("per-clip overrides", () => {
  it("a per-clip look recolors just that clip while the global look stays none", () => {
    const src = noiseCanvas(64, 64);
    app.items = [fakeItem(1, src)];
    // S.look is "none" (beforeEach) — the OVERRIDE lives on the clip
    app.seq = [{ id: 1, dur: 4, look: "mono" }];
    const out = document.createElement("canvas");
    out.width = 64; out.height = 64;
    drawAtTime(out.getContext("2d")!, 64, 64, 1);
    const px = pixelsOf(out);
    expect(countDiffs(px, pixelsOf(src))).toBeGreaterThan(0); // recolored, not the 1:1 path
    for (let i = 0; i < px.length; i += 4) { // mono ⇒ r==g==b
      expect(px[i]).toBe(px[i + 1]);
      expect(px[i + 1]).toBe(px[i + 2]);
    }
  });

  it("a per-clip transition blends even when the global transition is a hard cut", () => {
    const black = document.createElement("canvas");
    black.width = 64; black.height = 64;
    black.getContext("2d")!.fillRect(0, 0, 64, 64);
    const white = document.createElement("canvas");
    white.width = 64; white.height = 64;
    const wc = white.getContext("2d")!; wc.fillStyle = "#fff"; wc.fillRect(0, 0, 64, 64);

    app.items = [fakeItem(1, black), fakeItem(2, white)];
    // global trans stays "none" — a spatial transition is set ON the first clip
    app.seq = [{ id: 1, dur: 4, trans: "slideup" }, { id: 2, dur: 4 }];
    S.transDur = 1;

    const out = document.createElement("canvas");
    out.width = 64; out.height = 64;
    drawAtTime(out.getContext("2d")!, 64, 64, 4); // dead center of the cut
    const px = pixelsOf(out);
    let dark = 0, light = 0;
    for (let i = 0; i < px.length; i += 4) { if (px[i] < 64) dark++; if (px[i] > 192) light++; }
    expect(dark, "outgoing clip visible").toBeGreaterThan(0);
    expect(light, "incoming clip visible").toBeGreaterThan(0);
  });
});

describe("per-photo framed vs original in the video", () => {
  function blackCount(cv: HTMLCanvasElement): number {
    const px = pixelsOf(cv); let b = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] === 0 && px[i + 1] === 0 && px[i + 2] === 0 && px[i + 3] === 255) b++;
    return b;
  }
  it("an UNFRAMED photo (framed=false) draws the whole original, no fills", () => {
    // a wide 80×20 original into a tall 40×80 frame → letterboxed (fit), rest black
    const src = noiseCanvas(80, 20);
    const item = fakeItem(1, src);
    item.img = src as unknown as HTMLImageElement; item.iw = 80; item.ih = 20;
    item.framed = false; // Video-tab photo → original
    const out = document.createElement("canvas"); out.width = 40; out.height = 80;
    drawClipFrame(out.getContext("2d")!, 40, 80, item, 0);
    expect(blackCount(out)).toBeGreaterThan(40 * 80 * 0.5);
  });
  it("a FRAMED photo (default) uses the framed canvas 1:1, not the original", () => {
    const src = noiseCanvas(40, 80); // exact frame size
    const item = fakeItem(1, src); // framed undefined → framed path
    const out = document.createElement("canvas"); out.width = 40; out.height = 80;
    drawClipFrame(out.getContext("2d")!, 40, 80, item, 0);
    expect(countDiffs(pixelsOf(out), pixelsOf(src))).toBe(0);
  });
});

describe("title cards", () => {
  it("renders its text on its background colour (no source photo)", () => {
    app.items = [];
    app.seq = [{ id: 0, dur: 3, card: { text: "Hello", bg: "#000000", fg: "#ffffff" } }];
    const out = document.createElement("canvas");
    out.width = 240; out.height = 135;
    drawAtTime(out.getContext("2d")!, 240, 135, 1);
    const px = pixelsOf(out);
    let white = 0, black = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] > 200 && px[i + 1] > 200 && px[i + 2] > 200) white++;
      else if (px[i] < 40 && px[i + 1] < 40 && px[i + 2] < 40) black++;
    }
    expect(black, "background fill").toBeGreaterThan(0);
    expect(white, "text glyphs").toBeGreaterThan(0);
  });
});

describe("clip reorder math", () => {
  it("insertIndexAt picks the drop slot by clip midpoints", () => {
    // durations 4,6,2 → boundaries 0,4,10,12 ; midpoints 2,7,11
    app.seq = [{ id: 1, dur: 4 }, { id: 2, dur: 6 }, { id: 3, dur: 2 }];
    expect(insertIndexAt(0)).toBe(0);
    expect(insertIndexAt(1.9)).toBe(0);
    expect(insertIndexAt(2.1)).toBe(1); // past clip 0's midpoint
    expect(insertIndexAt(6.9)).toBe(1);
    expect(insertIndexAt(7.1)).toBe(2); // past clip 1's midpoint
    expect(insertIndexAt(11.1)).toBe(3); // past the last midpoint → append
    expect(insertIndexAt(999)).toBe(3);
  });
});

describe("captions", () => {
  it("draws the clip's caption over the frame", () => {
    const src = noiseCanvas(120, 120);
    const item = fakeItem(1, src);
    app.items = [item];

    const plain = document.createElement("canvas");
    plain.width = 120; plain.height = 120;
    app.seq = [{ id: 1, dur: 4 }];
    drawAtTime(plain.getContext("2d")!, 120, 120, 1);

    const withText = document.createElement("canvas");
    withText.width = 120; withText.height = 120;
    app.seq = [{ id: 1, dur: 4, text: "Hello" }];
    drawAtTime(withText.getContext("2d")!, 120, 120, 1);

    expect(countDiffs(pixelsOf(withText), pixelsOf(plain))).toBeGreaterThan(0);
  });
});

describe("new transitions render", () => {
  for (const trans of ["slideup", "iris"]) {
    it(`"${trans}" mid-blend shows parts of BOTH clips`, () => {
      const black = document.createElement("canvas");
      black.width = 64; black.height = 64;
      black.getContext("2d")!.fillRect(0, 0, 64, 64); // black
      const white = document.createElement("canvas");
      white.width = 64; white.height = 64;
      const wc = white.getContext("2d")!;
      wc.fillStyle = "#fff"; wc.fillRect(0, 0, 64, 64);

      app.items = [fakeItem(1, black), fakeItem(2, white)];
      app.seq = [{ id: 1, dur: 4 }, { id: 2, dur: 4 }];
      S.trans = trans; S.transDur = 1;

      const out = document.createElement("canvas");
      out.width = 64; out.height = 64;
      drawAtTime(out.getContext("2d")!, 64, 64, 4); // dead center of the transition window
      const px = pixelsOf(out);
      let dark = 0, light = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] < 64) dark++;
        if (px[i] > 192) light++;
      }
      expect(dark, "outgoing clip visible").toBeGreaterThan(0);
      expect(light, "incoming clip visible").toBeGreaterThan(0);
    });
  }
});

describe("IndexedDB store", () => {
  it("round-trips structured data including blobs", async () => {
    const value = { n: 7, blob: new Blob(["frame!"], { type: "text/plain" }) };
    await idbSet("test-key", value);
    const back = await idbGet<typeof value>("test-key");
    expect(back).toBeTruthy();
    expect(back!.n).toBe(7);
    expect(back!.blob).toBeInstanceOf(Blob);
    expect(await back!.blob.text()).toBe("frame!");
    await idbDel("test-key");
    expect(await idbGet("test-key")).toBeUndefined();
  });
});
