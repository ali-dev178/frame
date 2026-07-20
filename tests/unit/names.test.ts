import { beforeEach, describe, expect, it } from "vitest";
import { fmtTime, outName, passName, round10, shortName } from "../../src/core/names";
import { S } from "../../src/state";
import type { Item } from "../../src/types";

function fakeItem(name: string, type = ""): Item {
  return { id: 1, name, file: { type } as File, img: null as unknown as HTMLImageElement, iw: 1, ih: 1, edges: null, grad: null, canvas: null, el: null };
}

beforeEach(() => {
  S.tab = "post";
  S.targetByTab = { post: "post-4x5", story: "story", reel: "reel", profile: "profile" };
});

describe("outName", () => {
  it("appends the target suffix and forces .png", () => {
    expect(outName(fakeItem("holiday.jpg"))).toBe("holiday_4x5.png");
  });
  it("follows the currently selected target", () => {
    S.tab = "story";
    expect(outName(fakeItem("pic.webp"))).toBe("pic_story.png");
  });
});

describe("passName", () => {
  it("keeps the original extension for passthrough downloads", () => {
    expect(passName(fakeItem("holiday.JPG"))).toBe("holiday_4x5.JPG");
  });
  it("derives the extension from the mime type when the name has none", () => {
    expect(passName(fakeItem("holiday", "image/jpeg"))).toBe("holiday_4x5.jpg");
  });
  it("falls back to png when nothing is known", () => {
    expect(passName(fakeItem("holiday"))).toBe("holiday_4x5.png");
  });
});

describe("fmtTime", () => {
  it("formats m:ss", () => {
    expect(fmtTime(0)).toBe("0:00");
    expect(fmtTime(65)).toBe("1:05");
    expect(fmtTime(600)).toBe("10:00");
  });
  it("rounds to the nearest second and clamps negatives", () => {
    expect(fmtTime(89.6)).toBe("1:30");
    expect(fmtTime(-3)).toBe("0:00");
  });
});

describe("shortName", () => {
  it("strips the extension", () => {
    expect(shortName("track.mp3")).toBe("track");
  });
  it("truncates long names with an ellipsis", () => {
    const long = "a".repeat(30) + ".mp3";
    const out = shortName(long);
    expect(out.length).toBe(24);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("round10", () => {
  it("rounds to one decimal", () => {
    expect(round10(1.26)).toBe(1.3);
    expect(round10(1.24)).toBe(1.2);
  });
});
