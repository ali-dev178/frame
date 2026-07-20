import { describe, expect, it } from "vitest";
import { aacBitrateLadder } from "../../src/export/fast";

describe("aacBitrateLadder", () => {
  it("tries the requested bitrate first, then standard rungs downward", () => {
    expect(aacBitrateLadder(320000)).toEqual([320000, 256000, 192000, 160000, 128000, 96000]);
  });
  it("dedupes when the request equals a standard rung", () => {
    expect(aacBitrateLadder(192000)).toEqual([192000, 256000, 160000, 128000, 96000]);
  });
  it("keeps an unusual request as the first rung", () => {
    expect(aacBitrateLadder(200000)[0]).toBe(200000);
  });
});
