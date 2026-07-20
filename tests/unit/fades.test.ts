import { beforeEach, describe, expect, it } from "vitest";
import { applyFadesFrom } from "../../src/audio/engine";
import { S } from "../../src/state";

interface Call { fn: "set" | "ramp"; value: number; time: number }

function mockGain(): { node: GainNode; calls: Call[] } {
  const calls: Call[] = [];
  const node = {
    gain: {
      setValueAtTime(value: number, time: number) { calls.push({ fn: "set", value, time }); },
      linearRampToValueAtTime(value: number, time: number) { calls.push({ fn: "ramp", value, time }); },
    },
  } as unknown as GainNode;
  return { node, calls };
}

beforeEach(() => { S.vfade = true; });

describe("applyFadesFrom", () => {
  it("is a flat 1.0 when fades are off", () => {
    S.vfade = false;
    const { node, calls } = mockGain();
    applyFadesFrom(node, 100, 0, 10);
    expect(calls).toEqual([{ fn: "set", value: 1.0, time: 100 }]);
  });

  it("builds the full envelope from t=0: near-zero → ramp up → hold → ramp out", () => {
    const { node, calls } = mockGain();
    applyFadesFrom(node, 100, 0, 10); // fin=0.8, fout=1.2
    expect(calls[0]).toEqual({ fn: "set", value: 0.0001, time: 100 });
    expect(calls[1]).toEqual({ fn: "ramp", value: 1.0, time: 100.8 });
    expect(calls[2]).toEqual({ fn: "set", value: 1.0, time: 100 + (10 - 1.2) });
    expect(calls[3]).toEqual({ fn: "ramp", value: 0.0001, time: 110 });
  });

  it("starts mid-fade-in at the proportional level", () => {
    const { node, calls } = mockGain();
    applyFadesFrom(node, 100, 0.4, 10); // halfway through the 0.8s fade-in
    expect(calls[0].value).toBeCloseTo(0.5, 10);
    expect(calls[1]).toEqual({ fn: "ramp", value: 1.0, time: 100.4 }); // remaining 0.4s
  });

  it("shortens fades for very short videos (fin/fout capped at total/4)", () => {
    const { node, calls } = mockGain();
    applyFadesFrom(node, 100, 0, 2); // fin = fout = 0.5
    expect(calls[1].time).toBeCloseTo(100.5, 10);
    expect(calls[2].time).toBeCloseTo(101.5, 10);
    expect(calls[3].time).toBeCloseTo(102, 10);
  });

  it("starting inside the fade-out holds then ramps down over the remainder (original behavior)", () => {
    const { node, calls } = mockGain();
    applyFadesFrom(node, 100, 9.5, 10); // inside the 1.2s fade-out
    // env(9.5) is scheduled first, then the 1.0 hold lands at the SAME timestamp
    // (holdEnd === fromT) and wins — this mirrors the original app exactly.
    expect(calls[0].fn).toBe("set");
    expect(calls[0].value).toBeCloseTo(0.5 / 1.2, 10);
    expect(calls[0].time).toBe(100);
    expect(calls[1]).toEqual({ fn: "set", value: 1.0, time: 100 });
    expect(calls[2]).toEqual({ fn: "ramp", value: 0.0001, time: 100.5 });
  });
});
