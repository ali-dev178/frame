import { beforeEach, describe, expect, it } from "vitest";
import { S, curTarget } from "../../src/state";

beforeEach(() => {
  S.tab = "insta";
  S.targetByTab = { insta: "ig-4x5", tiktok: "tiktok", yt: "shorts", x: "x-169", fb: "fb-191", li: "li-191", custom: "custom" };
  S.customW = 1080;
  S.customH = 1350;
});

describe("curTarget — custom tab", () => {
  it("builds a live target from the custom dimensions", () => {
    S.tab = "custom";
    S.customW = 800;
    S.customH = 600;
    const t = curTarget();
    expect(t.r).toBeCloseTo(800 / 600, 10);
    expect(t.suffix).toBe("800x600");
    expect(t.dims).toBe("800 × 600");
  });

  it("guards against zero/garbage dimensions", () => {
    S.tab = "custom";
    S.customW = 0;
    S.customH = NaN as unknown as number;
    const t = curTarget();
    expect(Number.isFinite(t.r)).toBe(true);
    expect(t.r).toBeGreaterThan(0);
  });
});

describe("curTarget — new platform tabs", () => {
  it("TikTok defaults to 9:16", () => {
    S.tab = "tiktok";
    expect(curTarget().r).toBeCloseTo(9 / 16, 10);
    expect(curTarget().suffix).toBe("tiktok");
  });
  it("YouTube thumbnail is 16:9", () => {
    S.tab = "yt";
    S.targetByTab.yt = "yt-thumb";
    expect(curTarget().r).toBeCloseTo(16 / 9, 10);
  });
  it("X wide is 16:9", () => {
    S.tab = "x";
    expect(curTarget().r).toBeCloseTo(16 / 9, 10);
  });
});
