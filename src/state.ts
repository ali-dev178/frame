import { targetDef } from "./core/config";
import type { AudioTrack, Clip, Item, Settings, Target } from "./types";

/** Longest a single clip may show, in seconds (10 minutes). */
export const MAX_CLIP = 600;

export const S: Settings = {
  tab: "insta",
  targetByTab: { insta: "ig-4x5", tiktok: "tiktok", yt: "shorts", x: "x-169", fb: "fb-191", li: "li-191", custom: "custom" },
  mode: "edges",
  blur: 55,
  dark: 22,
  bounds: false,
  solidMode: "auto",
  solidColor: "#101010",
  customW: 1080,
  customH: 1350,
  motion: "static",
  vfit: "framed",
  vq: "ultra",
  vfade: true,
  trans: "none",
  transDur: 0.6,
  look: "none",
};

export function curTarget(): Target {
  if(S.tab === "custom"){
    const w = Math.max(1, Math.round(S.customW) || 1080), h = Math.max(1, Math.round(S.customH) || 1350);
    return { key: "custom", label: "Custom " + w + "×" + h, r: w/h, suffix: w + "x" + h,
             dims: w + " × " + h, hint: "Your own canvas — the photo is framed to these proportions." };
  }
  return targetDef(S.tab, S.targetByTab[S.tab]);
}

/**
 * Shared mutable app state. Kept on one object so any module can
 * reassign collections (`app.items = app.items.filter(...)`) — ESM
 * exports themselves are read-only bindings for importers.
 */
export const app = {
  items: [] as Item[],
  idc: 0,
  /** The clip timeline, in order. */
  seq: [] as Clip[],
  clipIdc: 0,
  tracks: [] as AudioTrack[],
  trackIdc: 0,
  selClipId: null as number | null,
  selTrackId: null as number | null,
  /** True while an export runs — locks the studio UI. */
  vbusy: false,
  /** Set by the Cancel button; the export loops check it and bail. */
  vcancel: false,
  resultUrl: null as string | null,
  resultExt: "mp4",
};

export function byId(id: number): Item | null {
  for(let i=0;i<app.items.length;i++){ if(app.items[i].id===id) return app.items[i]; }
  return null;
}
export function totalDur(): number {
  let s=0; app.seq.forEach(function(c){ s += c.dur; }); return s;
}
export function trackById(id: number): AudioTrack | null {
  for(let i=0;i<app.tracks.length;i++){ if(app.tracks[i].id===id) return app.tracks[i]; }
  return null;
}
export function trackLen(t: AudioTrack): number {
  return Math.max(0, t.end - t.start);
}
export function sndExtent(): number {
  let m=0; app.tracks.forEach(function(t){ m = Math.max(m, t.at + trackLen(t)); }); return m;
}
export function hasAudio(): boolean {
  return app.tracks.some(function(t){ return trackLen(t) > 0.05; });
}
export function nextLane(): number {
  let m=-1; app.tracks.forEach(function(t){ if(t.lane>m) m=t.lane; }); return m+1;
}
