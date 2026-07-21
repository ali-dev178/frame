import { S, app, trackLen } from "../state";
import type { AudioPlan } from "../types";

let audioCtx: AudioContext | null = null;

export function ensureCtx(): AudioContext {
  if(!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return audioCtx;
}

const DUCK_LEVEL = 0.28; // how far a music bed drops under a voice track
const DUCK_RAMP = 0.12;  // ramp seconds in/out of a duck

/** Merged [start,end] spans of the NON-duck (voice) tracks — what a bed ducks under. */
function duckSpans(total: number): number[][] {
  if(!app.tracks.some(function(t){ return t.duck && trackLen(t) > 0.01; })) return [];
  const raw: number[][] = [];
  app.tracks.forEach(function(t){
    if(t.duck) return;
    const len = trackLen(t); if(len <= 0.01) return;
    const s1 = Math.min(t.at + len, total);
    if(s1 > t.at) raw.push([t.at, s1]);
  });
  raw.sort(function(a,b){ return a[0]-b[0]; });
  const out: number[][] = [];
  raw.forEach(function(sp){
    const last = out[out.length-1];
    if(last && sp[0] <= last[1] + 2*DUCK_RAMP) last[1] = Math.max(last[1], sp[1]); // merge near-adjacent
    else out.push([sp[0], sp[1]]);
  });
  return out;
}

/** Piecewise-linear volume+fade envelope on a track's gain param. */
function schedFade(param: AudioParam, baseTime: number, fromT: number, aStart: number, aEnd: number, vol: number, fi: number, fo: number): void {
  const clk = function(ts: number){ return baseTime + Math.max(0, ts - fromT); };
  const evalG = function(x: number){
    let g = vol;
    if(fi > 0 && x < aStart + fi) g = Math.min(g, vol * (x - aStart) / fi);
    if(fo > 0 && x > aEnd - fo) g = Math.min(g, vol * (aEnd - x) / fo);
    return Math.max(0.0001, g);
  };
  const x0 = Math.max(fromT, aStart);
  param.setValueAtTime(evalG(x0), clk(x0));
  [aStart + fi, aEnd - fo, aEnd].filter(function(ts){ return ts > x0 + 0.0001; })
    .sort(function(a,b){ return a-b; })
    .forEach(function(ts){ param.linearRampToValueAtTime(evalG(ts), clk(ts)); });
}

/** Ducking envelope: 1.0 normally, DUCK_LEVEL across each voice span, with ramps. */
function schedDuck(param: AudioParam, baseTime: number, fromT: number, aStart: number, aEnd: number, spans: number[][]): void {
  const clk = function(ts: number){ return baseTime + Math.max(0, ts - fromT); };
  const x0 = Math.max(fromT, aStart);
  // starting value must reflect a scrub that begins already inside a voice span
  const startDucked = spans.some(function(sp){ return x0 >= sp[0] && x0 < sp[1]; });
  const pts: { t: number; v: number }[] = [{ t: x0, v: startDucked ? DUCK_LEVEL : 1 }];
  spans.forEach(function(sp){
    const a = Math.max(sp[0], aStart), b = Math.min(sp[1], aEnd);
    if(b <= a) return;
    pts.push({ t: Math.max(x0, a - DUCK_RAMP), v: 1 });
    pts.push({ t: Math.max(x0, a), v: DUCK_LEVEL });
    pts.push({ t: Math.min(aEnd, b), v: DUCK_LEVEL });
    pts.push({ t: Math.min(aEnd, b + DUCK_RAMP), v: 1 });
  });
  pts.push({ t: aEnd, v: 1 });
  pts.sort(function(p,q){ return p.t - q.t; });
  let first = true, lastT = -1;
  pts.forEach(function(p){
    if(p.t < x0 - 0.0001 || p.t <= lastT + 0.0005) return;
    lastT = p.t;
    if(first){ param.setValueAtTime(p.v, clk(p.t)); first = false; }
    else param.linearRampToValueAtTime(p.v, clk(p.t));
  });
}

/** Schedules all audio clips (overlaps mix), optionally starting mid-timeline (fromT). */
export function scheduleSegs(ctx: BaseAudioContext, gainNode: GainNode, baseTime: number, fromT: number, total: number): AudioBufferSourceNode[] {
  const nodes: AudioBufferSourceNode[] = [];
  const spans = duckSpans(total);
  app.tracks.forEach(function(t){
    const len = trackLen(t);
    if(len <= 0.01) return;
    const pStart = t.at, pEnd = Math.min(t.at + len, total);
    if(pEnd <= fromT + 0.01 || pStart >= total - 0.01) return;
    const skip = Math.max(0, fromT - pStart);
    const s = ctx.createBufferSource();
    s.buffer = t.buffer;
    const vol = t.gain === undefined ? 1 : t.gain;
    const adur = pEnd - pStart;
    const fi = Math.min(Math.max(0, t.fadeIn || 0), adur);
    const fo = Math.min(Math.max(0, t.fadeOut || 0), adur);
    let head: AudioNode = s;
    if(vol !== 1 || fi > 0 || fo > 0){
      // per-track volume + fades — a music bed under narration mixes at its own level
      const fg = ctx.createGain();
      schedFade(fg.gain, baseTime, fromT, pStart, pEnd, vol, fi, fo);
      head.connect(fg); head = fg;
    }
    if(t.duck && spans.length){
      const dg = ctx.createGain();
      schedDuck(dg.gain, baseTime, fromT, pStart, pEnd, spans);
      head.connect(dg); head = dg;
    }
    head.connect(gainNode);
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
