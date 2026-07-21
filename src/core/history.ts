import { app } from "../state";
import type { AudioTrack, Clip } from "../types";

/**
 * Timeline undo/redo. Snapshots cover the ARRANGEMENT (clips + audio-block
 * metadata + selection) — cheap to copy. Photo/audio media themselves are
 * not part of history (removing a photo card is not undoable), but a clip
 * whose photo still exists always restores cleanly.
 *
 * AudioBuffer/Blob references are shared between snapshots — they're
 * immutable, so copies are unnecessary.
 */

interface Snapshot {
  seq: Clip[];
  tracks: AudioTrack[];
  selClipId: number | null;
  selTrackId: number | null;
}

const MAX = 50;
let past: Snapshot[] = [];
let future: Snapshot[] = [];
let pending: Snapshot | null = null;

/** Deep-copy a clip — the card object must be cloned so undo restores its edits. */
function copyClip(c: Clip): Clip {
  return { id: c.id, uid: c.uid, dur: c.dur, text: c.text, motion: c.motion, look: c.look, trans: c.trans,
           card: c.card ? { text: c.card.text, bg: c.card.bg, fg: c.card.fg } : undefined };
}

function snap(): Snapshot {
  return {
    seq: app.seq.map(copyClip),
    tracks: app.tracks.map(function (t) { return Object.assign({}, t); }),
    selClipId: app.selClipId,
    selTrackId: app.selTrackId,
  };
}

/** Ignores selection — two states differ only if the ARRANGEMENT differs. */
function sameArrangement(a: Snapshot, b: Snapshot): boolean {
  if (a.seq.length !== b.seq.length || a.tracks.length !== b.tracks.length) return false;
  for (let i = 0; i < a.seq.length; i++) {
    const x = a.seq[i], y = b.seq[i];
    if (x.id !== y.id || x.uid !== y.uid || x.dur !== y.dur || x.text !== y.text ||
        x.motion !== y.motion || x.look !== y.look || x.trans !== y.trans) return false;
    const xc = x.card, yc = y.card;
    if (!!xc !== !!yc) return false;
    if (xc && yc && (xc.text !== yc.text || xc.bg !== yc.bg || xc.fg !== yc.fg)) return false;
  }
  for (let i = 0; i < a.tracks.length; i++) {
    const x = a.tracks[i], y = b.tracks[i];
    if (x.id !== y.id || x.start !== y.start || x.end !== y.end || x.at !== y.at ||
        x.lane !== y.lane || (x.gain ?? 1) !== (y.gain ?? 1) ||
        (x.fadeIn ?? 0) !== (y.fadeIn ?? 0) || (x.fadeOut ?? 0) !== (y.fadeOut ?? 0) || !!x.duck !== !!y.duck) return false;
  }
  return true;
}

/** Call at the START of a discrete edit (button press, drag start, first keystroke). */
export function beginOp(): void {
  // Self-healing: if an op is still open (e.g. a focused caption field whose
  // blur was suppressed by a drag's preventDefault, or a keyboard shortcut
  // fired mid-drag), close it first so the new edit gets its own clean step
  // instead of clobbering the previous one's pending snapshot.
  if (pending) commitOp();
  pending = snap();
}

/** Call when the edit completes — records it only if something actually changed. */
export function commitOp(): void {
  if (!pending) return;
  if (!sameArrangement(pending, snap())) {
    past.push(pending);
    if (past.length > MAX) past.shift();
    future = [];
  }
  pending = null;
}

/** Wraps an instant (non-drag) edit. */
export function op(fn: () => void): void {
  beginOp();
  fn();
  commitOp();
}

function apply(s: Snapshot): void {
  app.seq = s.seq.map(copyClip);
  app.tracks = s.tracks.map(function (t) { return Object.assign({}, t); });
  app.selClipId = s.selClipId;
  app.selTrackId = s.selTrackId;
}

export function undo(): boolean {
  if (!past.length) return false;
  pending = null;
  future.push(snap());
  apply(past.pop()!);
  return true;
}

export function redo(): boolean {
  if (!future.length) return false;
  pending = null;
  past.push(snap());
  apply(future.pop()!);
  return true;
}

export function canUndo(): boolean { return past.length > 0; }
export function canRedo(): boolean { return future.length > 0; }

/** For session boundaries (restore) — history starts fresh. */
export function clearHistory(): void {
  past = []; future = []; pending = null;
}
