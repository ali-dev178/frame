import { describe, expect, it } from "vitest";
import { LOOKS, MODES, MOTIONS, TRANSITIONS, VQUAL } from "../../src/core/config";
import { S } from "../../src/state";

/**
 * Quality contract: these values came from the original single-file app and
 * define "outstanding quality". Any change here must be a deliberate,
 * reviewed decision — never an accident.
 */
describe("quality defaults are pinned", () => {
  it("Ultra encodes at 40 Mbps H.264 / 320 kbps AAC (original app parity)", () => {
    const ultra = VQUAL.filter((q) => q.key === "ultra")[0];
    expect(ultra.v).toBe(40000000);
    expect(ultra.a).toBe(320000);
  });

  it("the DEFAULTS are the lossless path: Ultra + Still + Cut + Look:None", () => {
    expect(S.vq).toBe("ultra");     // highest quality is the default, not opt-in
    expect(S.motion).toBe("static"); // Still = 1:1 frame copies
    expect(S.trans).toBe("none");    // Cut = no blended frames
    expect(S.look).toBe("none");     // untouched color
    // the video shows the whole ORIGINAL photo by default (fit); the 1:1
    // exact-copy video path is the "framed" opt-in, still fully available.
    expect(S.vfit).toBe("fit");
  });

  it("every pixel-affecting option has an untouched choice", () => {
    expect(MOTIONS.some((m) => m.key === "static")).toBe(true);
    expect(TRANSITIONS.some((t) => t.key === "none")).toBe(true);
    expect(LOOKS.some((l) => l.key === "none")).toBe(true);
    expect(MODES.length).toBeGreaterThan(0); // fills paint MARGINS only — the photo region is untouchable by design
  });
});
