import { S, app } from "../state";
import type { Settings, TitleCard } from "../types";
import { idbDel, idbGet, idbSet } from "./idb";

/**
 * Session persistence: the whole working state (settings + source files +
 * timeline) autosaves to IndexedDB, debounced. Source files persist as the
 * ORIGINAL blobs — restoring re-runs the exact load path, so the lossless
 * guarantee survives a round-trip untouched.
 */

export interface SavedItem { name: string; blob: Blob }
export interface SavedClip { idx: number; dur: number; text?: string; motion?: string; look?: string; trans?: string; card?: TitleCard }
export interface SavedTrack { name: string; blob: Blob; start: number; end: number; at: number; lane: number; gain?: number }
export interface SavedProject {
  v: 1;
  savedAt: number;
  S: Settings;
  items: SavedItem[];
  seq: SavedClip[];
  tracks: SavedTrack[];
}

const KEY = "project";

let armed = false;
let dirty = false;
let timer: number | undefined;

let flushHooked = false;

/** Autosave stays off until boot (incl. the restore decision) has finished. */
export function armAutosave(): void {
  armed = true;
  if (!flushHooked) {
    flushHooked = true;
    // the debounce must not lose the final burst of edits on close/hide
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") { clearTimeout(timer); void saveNow(); }
    });
    window.addEventListener("pagehide", function () { clearTimeout(timer); void saveNow(); });
  }
}

export function markDirty(): void {
  if (!armed) return;
  dirty = true;
  clearTimeout(timer);
  timer = window.setTimeout(saveNow, 1200);
}

export async function saveNow(): Promise<void> {
  if (!dirty) return;
  dirty = false;
  try { await idbSet(KEY, serialize()); } catch (e) { /* persistence is best-effort */ }
}

/** Item ids regenerate every session — clips serialize as ITEM INDEXES. */
export function serialize(): SavedProject {
  return {
    v: 1,
    savedAt: Date.now(),
    S: JSON.parse(JSON.stringify(S)) as Settings,
    items: app.items.map(function (it) { return { name: it.name, blob: it.file as Blob }; }),
    seq: app.seq
      .map(function (c) {
        return { idx: c.card ? -1 : app.items.findIndex(function (i) { return i.id === c.id; }), dur: c.dur, text: c.text,
                 motion: c.motion, look: c.look, trans: c.trans, card: c.card };
      })
      .filter(function (c) { return !!c.card || c.idx >= 0; }), // title cards have no item index
    tracks: app.tracks
      .filter(function (t) { return !!t.file; })
      .map(function (t) { return { name: t.name, blob: t.file!, start: t.start, end: t.end, at: t.at, lane: t.lane, gain: t.gain }; }),
  };
}

export function loadSaved(): Promise<SavedProject | undefined> {
  return idbGet<SavedProject>(KEY).catch(function () { return undefined; });
}

export function clearSaved(): Promise<void> {
  return idbDel(KEY).catch(function () { /* best-effort */ });
}
