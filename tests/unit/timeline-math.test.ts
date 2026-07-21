import { beforeEach, describe, expect, it } from "vitest";
import { clipBoundsAt, outDims, prog } from "../../src/render/sequence";
import { S, app, totalDur } from "../../src/state";
import type { Item } from "../../src/types";

function fakeItem(id: number, w = 0, h = 0): Item {
  return {
    id, name: "i" + id, file: {} as File, img: null as unknown as HTMLImageElement,
    iw: w, ih: h, edges: null, grad: null,
    canvas: w ? ({ width: w, height: h } as HTMLCanvasElement) : null,
    el: null,
  };
}

beforeEach(() => {
  app.items = [];
  app.seq = [];
});

describe("totalDur", () => {
  it("sums clip durations", () => {
    app.seq = [{ id: 1, dur: 4 }, { id: 2, dur: 6 }];
    expect(totalDur()).toBe(10);
  });
  it("is 0 for an empty timeline", () => {
    expect(totalDur()).toBe(0);
  });
});

describe("clipBoundsAt", () => {
  beforeEach(() => {
    app.items = [fakeItem(1), fakeItem(2), fakeItem(3)];
    app.seq = [{ id: 1, dur: 4 }, { id: 2, dur: 6 }, { id: 3, dur: 2 }];
  });
  it("finds the active clip and its start offset", () => {
    expect(clipBoundsAt(0).i).toBe(0);
    expect(clipBoundsAt(3.999).i).toBe(0);
    expect(clipBoundsAt(4).i).toBe(1);
    expect(clipBoundsAt(9.999).i).toBe(1);
    expect(clipBoundsAt(10).i).toBe(2);
    const b = clipBoundsAt(10);
    expect(b.bs[2].start).toBe(10);
    expect(b.bs[2].dur).toBe(2);
  });
  it("clamps to the last clip at/after the end", () => {
    expect(clipBoundsAt(12).i).toBe(2);
    expect(clipBoundsAt(999).i).toBe(2);
  });
  it("resolves per-clip motion/look/trans overrides, else falls back to global S", () => {
    S.motion = "static"; S.look = "none"; S.trans = "none";
    app.seq = [
      { id: 1, dur: 4, motion: "zoomin", look: "warm", trans: "crossfade" },
      { id: 2, dur: 6 },
    ];
    const bs = clipBoundsAt(0).bs;
    expect(bs[0].motion).toBe("zoomin");
    expect(bs[0].look).toBe("warm");
    expect(bs[0].trans).toBe("crossfade");
    expect(bs[1].motion).toBe("static"); // no override → global
    expect(bs[1].look).toBe("none");
    expect(bs[1].trans).toBe("none");
  });
});

describe("prog", () => {
  it("maps time to 0..1 within a clip, clamped", () => {
    const b = { it: null, start: 4, dur: 6 };
    expect(prog(b, 4)).toBe(0);
    expect(prog(b, 7)).toBe(0.5);
    expect(prog(b, 10)).toBe(1);
    expect(prog(b, 0)).toBe(0);
    expect(prog(b, 99)).toBe(1);
  });
});

describe("outDims", () => {
  it("uses the largest clip's canvas, rounded up to even", () => {
    app.items = [fakeItem(1, 1080, 1349), fakeItem(2, 500, 400)];
    app.seq = [{ id: 1, dur: 4 }, { id: 2, dur: 4 }];
    const d = outDims();
    expect(d.W).toBe(1080);
    expect(d.H).toBe(1350); // odd 1349 -> even 1350: encoders reject odd dimensions
  });
  it("is 0×0 when no clip has a canvas", () => {
    app.items = [fakeItem(1)];
    app.seq = [{ id: 1, dur: 4 }];
    expect(outDims()).toEqual({ W: 0, H: 0 });
  });
});
