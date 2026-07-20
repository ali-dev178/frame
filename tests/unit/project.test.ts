import { beforeEach, describe, expect, it } from "vitest";
import { serialize } from "../../src/core/project";
import { S, app } from "../../src/state";
import type { Item } from "../../src/types";

function fakeItem(id: number, name: string): Item {
  return {
    id, name, file: new File(["x"], name, { type: "image/png" }),
    img: null as unknown as HTMLImageElement, iw: 1, ih: 1,
    edges: null, grad: null, canvas: null, el: null,
  };
}

beforeEach(() => {
  app.items = [fakeItem(11, "a.png"), fakeItem(22, "b.png"), fakeItem(33, "c.png")];
  app.seq = [];
  app.tracks = [];
});

describe("project serialization", () => {
  it("maps clips to item INDEXES (ids regenerate every session)", () => {
    app.seq = [{ id: 33, dur: 5, text: "hi" }, { id: 11, dur: 2 }];
    const p = serialize();
    expect(p.seq).toEqual([{ idx: 2, dur: 5, text: "hi" }, { idx: 0, dur: 2, text: undefined }]);
  });

  it("drops clips whose item no longer exists", () => {
    app.seq = [{ id: 999, dur: 4 }, { id: 22, dur: 3 }];
    const p = serialize();
    expect(p.seq.length).toBe(1);
    expect(p.seq[0].idx).toBe(1);
  });

  it("persists item names and blobs", () => {
    const p = serialize();
    expect(p.items.map((i) => i.name)).toEqual(["a.png", "b.png", "c.png"]);
    expect(p.items[0].blob).toBeInstanceOf(Blob);
  });

  it("only persists audio tracks that kept their source file", () => {
    const blob = new Blob(["audio"]);
    app.tracks = [
      { id: 1, name: "song.mp3", file: blob, buffer: null as unknown as AudioBuffer, dur: 10, start: 1, end: 9, at: 2, lane: 0 },
      { id: 2, name: "lost.mp3", buffer: null as unknown as AudioBuffer, dur: 5, start: 0, end: 5, at: 0, lane: 1 },
    ];
    const p = serialize();
    expect(p.tracks.length).toBe(1);
    expect(p.tracks[0]).toMatchObject({ name: "song.mp3", start: 1, end: 9, at: 2, lane: 0 });
  });

  it("snapshots settings by value, not by reference", () => {
    const p = serialize();
    expect(p.S).not.toBe(S);
    expect(p.S.tab).toBe(S.tab);
  });
});
