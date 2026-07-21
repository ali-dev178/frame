import { ensureCtx } from "../audio/engine";
import { FORMATS, LOOKS, MKEYS, MOTIONS, TRANSITIONS, VQUAL } from "../core/config";
import { clearHistory } from "../core/history";
import { armAutosave, loadSaved, markDirty } from "../core/project";
import type { SavedClip, SavedProject } from "../core/project";
import { MAX_CLIP, S, app } from "../state";
import type { Clip, Item, Settings, TitleCard } from "../types";
import { loadFile, syncBars } from "./cards";
import { initControls } from "./controls";
import { initStudio, setVideoOpen, syncItemSelection, updateSelUI } from "./studio";
import { renderTimeline } from "./timeline";
import { refreshAudioUI } from "./soundtrack";

/**
 * Boot-time session restore: settings come back silently (before first
 * render), media comes back behind an explicit "Restore" bar.
 *
 * Autosave stays DISARMED until the restore decision is made — otherwise
 * the first edit would overwrite the saved session with empty media while
 * the bar is still promising it back.
 */
export async function maybeOfferRestore(): Promise<void> {
  let saved: SavedProject | undefined;
  try { saved = await loadSaved(); } catch (e) { saved = undefined; }
  if (!saved) { armAutosave(); return; }
  // unknown (likely NEWER) format: never arm — we must not clobber it
  if (saved.v !== 1) return;

  try {
    applySettings(saved.S);
    initControls();
    initStudio();
    const items = Array.isArray(saved.items) ? saved.items : [];
    const tracks = Array.isArray(saved.tracks) ? saved.tracks : [];
    if (items.length || tracks.length) {
      showBar(saved); // arms autosave when the user decides
      return;
    }
  } catch (e) {
    console.error("session restore failed", e);
  }
  armAutosave();
}

/** Restored settings are UNTRUSTED-shaped: validate keys, sanitize numbers, deep-merge maps. */
function applySettings(stored: Settings | undefined): void {
  const s = (stored || {}) as Partial<Settings>;
  const merged: Settings = Object.assign({}, S, s);
  merged.targetByTab = Object.assign({}, S.targetByTab, s.targetByTab || {});
  if (!FORMATS.some(function (f) { return f.tab === merged.tab; })) merged.tab = S.tab;
  if (MKEYS.indexOf(merged.mode) < 0) merged.mode = S.mode;
  if (!LOOKS.some(function (l) { return l.key === merged.look; })) merged.look = S.look;
  if (!TRANSITIONS.some(function (t) { return t.key === merged.trans; })) merged.trans = S.trans;
  if (!MOTIONS.some(function (m) { return m.key === merged.motion; })) merged.motion = S.motion;
  if (!VQUAL.some(function (q) { return q.key === merged.vq; })) merged.vq = S.vq;
  merged.blur = clampNum(merged.blur, 0, 100, S.blur);
  merged.dark = clampNum(merged.dark, 0, 100, S.dark);
  merged.customW = clampNum(merged.customW, 1, 8000, S.customW);
  merged.customH = clampNum(merged.customH, 1, 8000, S.customH);
  merged.transDur = clampNum(merged.transDur, 0.3, 1, S.transDur);
  Object.assign(S, merged);
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

/** Validate + attach the per-clip render overrides (UNTRUSTED-shaped — known keys only). */
function applyClipOverrides(clip: Clip, c: SavedClip): void {
  if (typeof c.motion === "string" && MOTIONS.some(function (m) { return m.key === c.motion; })) clip.motion = c.motion;
  if (typeof c.look === "string" && LOOKS.some(function (l) { return l.key === c.look; })) clip.look = c.look;
  if (typeof c.trans === "string" && TRANSITIONS.some(function (tr) { return tr.key === c.trans; })) clip.trans = c.trans;
}

/** Coerce an UNTRUSTED-shaped saved card into a valid TitleCard. */
function sanitizeCard(c: unknown): TitleCard {
  const o = (c || {}) as Partial<TitleCard>;
  const hex = function (v: unknown, fallback: string): string {
    return (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) ? v : fallback;
  };
  return {
    text: (typeof o.text === "string") ? o.text.slice(0, 200) : "",
    bg: hex(o.bg, "#101010"),
    fg: hex(o.fg, "#ffffff"),
  };
}

function showBar(saved: SavedProject): void {
  const bar = document.createElement("div");
  bar.className = "restoreBar";
  const n = saved.items.length, a = saved.tracks.length;
  bar.innerHTML =
    '<span class="rinfo">Previous session: ' + n + (n === 1 ? " photo" : " photos") +
    (a ? " · " + a + (a === 1 ? " audio file" : " audio files") : "") + "</span>" +
    '<span class="spacer"></span>' +
    '<button type="button" class="btn primary" id="restoreYes">Restore</button>' +
    '<button type="button" class="btn ghost" id="restoreNo">Dismiss</button>';
  const wrap = document.querySelector(".wrap")!;
  wrap.insertBefore(bar, wrap.children[1]); // right under the header
  (bar.querySelector("#restoreNo") as HTMLButtonElement).onclick = function () {
    bar.remove();
    armAutosave(); // dismissed: the next real edit replaces the old session
  };
  const yes = bar.querySelector("#restoreYes") as HTMLButtonElement;
  yes.onclick = async function () {
    yes.disabled = true; yes.textContent = "Restoring…";
    let failures = 0;
    try { failures = await restoreMedia(saved); }
    catch (e) { console.error("media restore failed", e); failures++; }
    finally {
      bar.remove();
      armAutosave();
      // only overwrite the saved record when EVERYTHING came back —
      // a transient decode failure must not become permanent loss
      if (failures === 0) markDirty();
      else console.warn(failures + " file(s) could not be restored — keeping the previous saved session untouched");
    }
  };
}

/** Returns the number of files that failed to come back. */
async function restoreMedia(saved: SavedProject): Promise<number> {
  let failures = 0;

  // photos — through the normal load path, sequentially to keep item order stable
  const loaded: (Item | null)[] = [];
  for (let i = 0; i < saved.items.length; i++) {
    const si = saved.items[i];
    const f = new File([si.blob], si.name, { type: si.blob.type || "image/png" });
    const it = await loadFile(f);
    if (!it) failures++;
    loaded.push(it);
  }

  // clips: rebuild the timeline directly (duplicates allowed), clamped on ingestion
  saved.seq.forEach(function (c) {
    const dur = Math.max(1, Math.min(MAX_CLIP, Math.round(Number(c.dur)) || 4));
    if (c.card) { // title card — no source photo
      const clip: Clip = { uid: ++app.clipIdc, id: 0, dur: dur, card: sanitizeCard(c.card) };
      applyClipOverrides(clip, c);
      app.seq.push(clip);
      return;
    }
    const it = loaded[c.idx];
    if (!it) return;
    const clip: Clip = { uid: ++app.clipIdc, id: it.id, dur: dur };
    if (typeof c.text === "string" && c.text.trim()) clip.text = c.text.slice(0, 80);
    applyClipOverrides(clip, c);
    app.seq.push(clip);
  });
  loaded.forEach(function (it) { if (it) syncItemSelection(it); });

  // audio — re-decode the original files, restore trims/positions
  if (saved.tracks.length) {
    const ctx = ensureCtx();
    for (let i = 0; i < saved.tracks.length; i++) {
      const st = saved.tracks[i];
      try {
        const buf = await ctx.decodeAudioData(await st.blob.arrayBuffer());
        const start = clampNum(st.start, 0, buf.duration, 0);
        app.tracks.push({
          id: ++app.trackIdc, name: st.name, file: st.blob, buffer: buf, dur: buf.duration,
          start: start,
          end: clampNum(st.end, start, buf.duration, buf.duration),
          at: clampNum(st.at, 0, 36000, 0),
          lane: Math.max(0, Math.round(Number(st.lane)) || 0),
          gain: clampNum(st.gain === undefined ? 1 : st.gain, 0, 1, 1),
          fadeIn: clampNum(st.fadeIn, 0, 30, 0),
          fadeOut: clampNum(st.fadeOut, 0, 30, 0),
          duck: !!st.duck,
        });
      } catch (e) { failures++; }
    }
  }

  refreshAudioUI();
  syncBars();
  renderTimeline();
  updateSelUI();
  if(app.seq.length) setVideoOpen(true); // a restored session with a video re-opens the editor
  clearHistory(); // the restored state is the new baseline — nothing to undo into
  return failures;
}
