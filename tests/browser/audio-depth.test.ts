import { beforeEach, describe, expect, it } from "vitest";
import { renderAudioOffline } from "../../src/audio/engine";
import { S, app } from "../../src/state";

/** A constant 0.5-amplitude stereo buffer of `sec` seconds. */
function constBuf(sec: number): AudioBuffer {
  const sr = 48000;
  const buf = new AudioBuffer({ length: Math.round(sr * sec), sampleRate: sr, numberOfChannels: 2 });
  for (let ch = 0; ch < 2; ch++) buf.getChannelData(ch).fill(0.5);
  return buf;
}
const at = (plan: { left: Float32Array }, t: number) => Math.abs(plan.left[Math.round(t * 48000)]);

beforeEach(() => {
  S.vfade = false; // isolate the per-track envelope from the master fade
  app.seq = [{ uid: 1, id: 1, dur: 2 }];
  app.tracks = [];
});

describe("per-track fades reach the mixdown", () => {
  it("fade-in ramps the level up over its fade-in seconds", async () => {
    app.tracks = [{ id: 1, name: "v", buffer: constBuf(1), dur: 1, start: 0, end: 1, at: 0, lane: 0, fadeIn: 0.5 }];
    const plan = await renderAudioOffline(1);
    expect(at(plan, 0.1), "inside the fade-in").toBeLessThan(0.22);
    expect(at(plan, 0.8), "past the fade-in, full level").toBeGreaterThan(0.45);
  });

  it("fade-out ramps the level down at the end", async () => {
    app.tracks = [{ id: 1, name: "v", buffer: constBuf(1), dur: 1, start: 0, end: 1, at: 0, lane: 0, fadeOut: 0.5 }];
    const plan = await renderAudioOffline(1);
    expect(at(plan, 0.4), "before the fade-out").toBeGreaterThan(0.45);
    expect(at(plan, 0.9), "deep in the fade-out").toBeLessThan(0.22);
  });
});

describe("auto-duck", () => {
  it("a ducking bed drops under a voice track, then recovers", async () => {
    app.tracks = [
      { id: 1, name: "bed", buffer: constBuf(2), dur: 2, start: 0, end: 2, at: 0, lane: 0, duck: true },
      { id: 2, name: "voice", buffer: constBuf(1), dur: 1, start: 0, end: 1, at: 0.5, lane: 1 },
    ];
    const plan = await renderAudioOffline(2);
    expect(at(plan, 0.2), "bed alone, full").toBeGreaterThan(0.45);
    expect(at(plan, 0.2)).toBeLessThan(0.55);
    // ducked bed (~0.14) + voice (~0.5) ≈ 0.64 — well below the un-ducked 1.0
    expect(at(plan, 1.0), "bed ducked under voice").toBeGreaterThan(0.55);
    expect(at(plan, 1.0)).toBeLessThan(0.75);
  });
});
