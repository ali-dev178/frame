import { targetDef } from "./core/config";
import type { AudioTrack, Clip, Item, Settings, Target } from "./types";

export const S: Settings = {
  tab: "post",
  targetByTab: { post: "post-4x5", story: "story", reel: "reel", profile: "profile" },
  mode: "edges",
  blur: 55,
  dark: 22,
  bounds: false,
  solidMode: "auto",
  solidColor: "#101010",
  motion: "static",
  vq: "ultra",
  vfade: true,
  trans: "none",
  transDur: 0.6,
};

export function curTarget(): Target {
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
  tracks: [] as AudioTrack[],
  trackIdc: 0,
  selClipId: null as number | null,
  selTrackId: null as number | null,
  /** True while an export runs — locks the studio UI. */
  vbusy: false,
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
