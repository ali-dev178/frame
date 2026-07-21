import { redo, undo } from "../core/history";
import { markDirty } from "../core/project";
import { app } from "../state";
import { $ } from "./dom";
import { invalidateResultQuiet, pv, pvSeek, syncItemSelection, updateSelUI } from "./studio";
import { renderTimeline } from "./timeline";

/**
 * Editor keyboard shortcuts:
 *   Space        play / pause
 *   ← / →        nudge playhead 1s (Shift: 0.1s)
 *   S            split selected audio at the playhead
 *   D            duplicate selected clip / audio piece
 *   Delete       remove selected clip / audio piece
 *   Ctrl+Z       undo timeline edit · Ctrl+Y / Ctrl+Shift+Z redo
 */
export function initShortcuts(): void {
  document.addEventListener("keydown", function (e) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (app.vbusy) return;
    const k = e.key;

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k.toLowerCase() === "z") {
      e.preventDefault();
      if (undo()) afterHistory();
      return;
    }
    if (((e.ctrlKey || e.metaKey) && k.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && k.toLowerCase() === "z")) {
      e.preventDefault();
      if (redo()) afterHistory();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // A focused button/link owns Space and Enter — don't hijack its native
    // activation (e.g. Space right after clicking Export must re-press Export,
    // not toggle playback), and don't fire Delete against the timeline when
    // focus is really on a photo card's button.
    if (t && t.closest("button, a, [role=button]")) return;

    // Nothing to play or edit → let Space/arrows scroll the page normally.
    if (!app.seq.length && app.selTrackId === null) return;

    if (k === " ") { e.preventDefault(); $("pvPlayBtn").click(); return; }
    if (k === "ArrowLeft") { e.preventDefault(); pvSeek(pv.t - (e.shiftKey ? 0.1 : 1)); return; }
    if (k === "ArrowRight") { e.preventDefault(); pvSeek(pv.t + (e.shiftKey ? 0.1 : 1)); return; }
    if (k.toLowerCase() === "s" && app.selTrackId !== null) { e.preventDefault(); $("atS").click(); return; }
    if (k.toLowerCase() === "d") {
      if (app.selClipId !== null) { e.preventDefault(); $("ctD").click(); }
      else if (app.selTrackId !== null) { e.preventDefault(); $("atD").click(); }
      return;
    }
    if (k === "Delete" || k === "Backspace") {
      if (app.selClipId !== null) { e.preventDefault(); $("ctX").click(); }
      else if (app.selTrackId !== null) { e.preventDefault(); $("atX").click(); }
      return;
    }
  });
}

function afterHistory(): void {
  renderTimeline();
  // If the preview is playing, the video frames already track the restored
  // arrangement (the raf loop re-reads app.seq every frame) but the audio graph
  // was baked at schedule time — reschedule it so sound doesn't keep playing the
  // pre-undo mix. renderTimeline has already re-clamped pv.t to the new total.
  if (pv.playing) pvSeek(pv.t);
  updateSelUI();
  invalidateResultQuiet();
  app.items.forEach(syncItemSelection); // clip counts per photo may have changed
  markDirty();
}
