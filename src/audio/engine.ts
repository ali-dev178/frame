import { S, app, trackLen } from "../state";
import type { AudioPlan } from "../types";

let audioCtx: AudioContext | null = null;

export function ensureCtx(): AudioContext {
  if(!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return audioCtx;
}

/** Schedules all audio clips (overlaps mix), optionally starting mid-timeline (fromT). */
export function scheduleSegs(ctx: BaseAudioContext, gainNode: GainNode, baseTime: number, fromT: number, total: number): AudioBufferSourceNode[] {
  const nodes: AudioBufferSourceNode[] = [];
  app.tracks.forEach(function(t){
    const len = trackLen(t);
    if(len <= 0.01) return;
    const pStart = t.at, pEnd = Math.min(t.at + len, total);
    if(pEnd <= fromT + 0.01 || pStart >= total - 0.01) return;
    const skip = Math.max(0, fromT - pStart);
    const s = ctx.createBufferSource();
    s.buffer = t.buffer; s.connect(gainNode);
    s.start(baseTime + Math.max(0, pStart - fromT), t.start + skip);
    s.stop(baseTime + (pEnd - fromT));
    nodes.push(s);
  });
  return nodes;
}

/** Fade envelope that is correct even when starting mid-timeline. */
export function applyFadesFrom(gainNode: GainNode, baseTime: number, fromT: number, total: number): void {
  if(!S.vfade){ gainNode.gain.setValueAtTime(1.0, baseTime); return; }
  const fin = Math.min(0.8, total/4), fout = Math.min(1.2, total/4);
  function env(x: number): number {
    if(x <= 0) return 0.0001;
    if(x < fin) return Math.max(0.0001, x / fin);
    if(x > total - fout) return Math.max(0.0001, (total - x) / fout);
    return 1;
  }
  const g = gainNode.gain;
  g.setValueAtTime(env(fromT), baseTime);
  if(fromT < fin) g.linearRampToValueAtTime(1.0, baseTime + (fin - fromT));
  const holdEnd = Math.max(fromT, total - fout);
  g.setValueAtTime(1.0, baseTime + (holdEnd - fromT));
  g.linearRampToValueAtTime(0.0001, baseTime + (total - fromT));
}

/** Bounces the whole mix to a normalized stereo buffer for the fast exporter. */
export function renderAudioOffline(total: number): Promise<AudioPlan> {
  const SR = 48000;
  const oc = new OfflineAudioContext(2, Math.max(1, Math.ceil(total*SR)), SR);
  const g = oc.createGain();
  applyFadesFrom(g, 0, 0, total);
  g.connect(oc.destination);
  scheduleSegs(oc, g, 0, 0, total);
  return oc.startRendering().then(function(buf){
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    // overlapping clips can sum past full scale — normalize so nothing clips
    let m = 0, i: number;
    for(i=0;i<L.length;i++){ const a=Math.abs(L[i]); if(a>m)m=a; const b=Math.abs(R[i]); if(b>m)m=b; }
    if(m > 0.99){ const k = 0.99/m; for(i=0;i<L.length;i++){ L[i]*=k; R[i]*=k; } }
    return { sampleRate: SR, left: L, right: R };
  });
}
