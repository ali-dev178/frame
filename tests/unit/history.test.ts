import { beforeEach, describe, expect, it } from "vitest";
import { beginOp, canRedo, canUndo, clearHistory, commitOp, op, redo, undo } from "../../src/core/history";
import { app } from "../../src/state";

beforeEach(() => {
  app.seq = [];
  app.tracks = [];
  app.selClipId = null;
  app.selTrackId = null;
  clearHistory();
});

describe("timeline history", () => {
  it("undoes and redoes a discrete edit", () => {
    app.seq = [{ uid: 1, id: 10, dur: 4 }];
    op(() => { app.seq[0].dur = 9; });
    expect(app.seq[0].dur).toBe(9);
    expect(undo()).toBe(true);
    expect(app.seq[0].dur).toBe(4);
    expect(redo()).toBe(true);
    expect(app.seq[0].dur).toBe(9);
  });

  it("does not record no-op interactions (click without change)", () => {
    app.seq = [{ uid: 1, id: 10, dur: 4 }];
    beginOp();
    commitOp(); // nothing changed between begin and commit
    expect(canUndo()).toBe(false);
  });

  it("a new edit clears the redo branch", () => {
    app.seq = [{ uid: 1, id: 10, dur: 4 }];
    op(() => { app.seq[0].dur = 9; });
    undo();
    expect(canRedo()).toBe(true);
    op(() => { app.seq[0].dur = 7; });
    expect(canRedo()).toBe(false);
    expect(app.seq[0].dur).toBe(7);
  });

  it("restores removals — the mis-drag insurance", () => {
    app.seq = [{ uid: 1, id: 10, dur: 4, text: "hello" }, { uid: 2, id: 11, dur: 6 }];
    op(() => { app.seq.splice(0, 1); });
    expect(app.seq.length).toBe(1);
    undo();
    expect(app.seq.length).toBe(2);
    expect(app.seq[0].text).toBe("hello");
  });

  it("covers audio arrangement incl. per-track volume", () => {
    const buffer = {} as AudioBuffer;
    app.tracks = [{ id: 1, name: "bed.mp3", buffer, dur: 60, start: 0, end: 60, at: 0, lane: 0, gain: 1 }];
    op(() => { app.tracks[0].gain = 0.3; });
    expect(app.tracks[0].gain).toBe(0.3);
    undo();
    expect(app.tracks[0].gain).toBe(1);
  });

  it("undo/redo return false at the ends of history", () => {
    expect(undo()).toBe(false);
    expect(redo()).toBe(false);
  });

  it("self-heals a still-open op when a new one begins (no clobbered pending)", () => {
    // Repro of the shared-`pending` clobber: an op is opened (e.g. a focused
    // caption field), changed, then a second op starts before the first commits
    // (a drag whose preventDefault suppressed the field's blur). Both edits must
    // survive as their own undo steps.
    app.seq = [{ uid: 1, id: 10, dur: 4 }];
    beginOp();
    app.seq[0].dur = 9;   // change under the first, still-open op
    beginOp();            // second op starts → first auto-commits instead of vanishing
    app.seq[0].dur = 12;
    commitOp();
    expect(app.seq[0].dur).toBe(12);
    expect(undo()).toBe(true);
    expect(app.seq[0].dur).toBe(9);
    expect(undo()).toBe(true);
    expect(app.seq[0].dur).toBe(4);
  });
});
