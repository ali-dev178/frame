import { beforeEach, describe, expect, it } from "vitest";
import { renderAudioOffline } from "../../src/audio/engine";
import { S, app } from "../../src/state";

/** A 1s stereo buffer of constant 0.5 amplitude. */
function constantBuffer(): AudioBuffer {
  const sr = 48000;
  const buf = new AudioBuffer({ length: sr, sampleRate: sr, numberOfChannels: 2 });
  for (let ch = 0; ch < 2; ch++) buf.getChannelData(ch).fill(0.5);
  return buf;
}

function peakOf(x: Float32Array): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; }
  return m;
}

beforeEach(() => {
  S.vfade = false; // flat envelope — we're measuring track gain, not fades
  app.seq = [{ uid: 1, id: 1, dur: 1 }];
  app.tracks = [];
});

describe("per-track volume reaches the actual mixdown", () => {
  it("gain 0.3 scales the rendered audio to ~0.15 peak", async () => {
    app.tracks = [{ id: 1, name: "bed", buffer: constantBuffer(), dur: 1, start: 0, end: 1, at: 0, lane: 0, gain: 0.3 }];
    const plan = await renderAudioOffline(1);
    const peak = peakOf(plan.left.subarray(4800, 43200)); // interior, away from edges
    expect(peak).toBeGreaterThan(0.13);
    expect(peak).toBeLessThan(0.17);
  });

  it("default gain (undefined) plays at full level", async () => {
    app.tracks = [{ id: 1, name: "voice", buffer: constantBuffer(), dur: 1, start: 0, end: 1, at: 0, lane: 0 }];
    const plan = await renderAudioOffline(1);
    const peak = peakOf(plan.left.subarray(4800, 43200));
    expect(peak).toBeGreaterThan(0.45);
    expect(peak).toBeLessThan(0.55);
  });

  it("a 0.3 bed under a full-level voice mixes both levels", async () => {
    app.tracks = [
      { id: 1, name: "bed", buffer: constantBuffer(), dur: 1, start: 0, end: 1, at: 0, lane: 0, gain: 0.3 },
      { id: 2, name: "voice", buffer: constantBuffer(), dur: 1, start: 0, end: 1, at: 0, lane: 1 },
    ];
    const plan = await renderAudioOffline(1);
    const peak = peakOf(plan.left.subarray(4800, 43200));
    expect(peak).toBeGreaterThan(0.6); // 0.15 + 0.5
    expect(peak).toBeLessThan(0.7);
  });
});
