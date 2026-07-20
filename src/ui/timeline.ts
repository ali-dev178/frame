import { fmtTime, shortName } from "../core/names";
import { S, app, byId, totalDur, trackById } from "../state";
import type { AudioTrack, Clip } from "../types";
import { $ } from "./dom";
import { drawPreviewFrame, invalidateResult, pv, pvSeek, setSelected, updatePvTime, updateSelUI } from "./studio";
import { refreshAudioUI } from "./soundtrack";

/** Pixels per second on the timeline — recomputed by renderTimeline to fit. */
let tlPps = 12;

function tlWidth(): number {
  return Math.max(100, ($("tledit").clientWidth || 600) - 18);
}

export function positionPlayhead(): void {
  const x = 8 + pv.t * tlPps;
  $("playhead").style.left = (x - 1) + "px";
  const sc = $("tledit");
  if(x < sc.scrollLeft + 24) sc.scrollLeft = Math.max(0, x - 24);
  else if(x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - sc.clientWidth + 40;
}

function drawSegWave(cv2: HTMLCanvasElement, bw: number, bh: number, tr: AudioTrack, segAt: number, total: number): void {
  const c2 = cv2.getContext("2d")!;
  c2.clearRect(0, 0, bw, bh);
  const b0 = tr.buffer.getChannelData(0);
  const b1 = tr.buffer.numberOfChannels > 1 ? tr.buffer.getChannelData(1) : b0;
  const srr = tr.buffer.sampleRate;
  for(let x=0; x<bw; x++){
    const i0 = Math.floor((tr.start + x/tlPps) * srr);
    const i1 = Math.min(b0.length, Math.floor((tr.start + (x+1)/tlPps) * srr));
    let m = 0;
    const stp = Math.max(1, Math.floor((i1 - i0) / 40));
    for(let ii=i0; ii<i1; ii+=stp){ const v = Math.max(Math.abs(b0[ii]||0), Math.abs(b1[ii]||0)); if(v>m) m=v; }
    const h = Math.max(1, m*(bh-4));
    c2.fillStyle = (segAt + x/tlPps >= total) ? "#57506b" : "#8f7bd8";
    c2.fillRect(x, (bh-h)/2, 1, h);
  }
}

export function renderTimeline(): void {
  app.seq = app.seq.filter(function(c){ return byId(c.id); });
  if(app.selClipId !== null && !app.seq.some(function(c){ return c.id === app.selClipId; })) app.selClipId = null;
  if(app.selTrackId !== null && !trackById(app.selTrackId)) app.selTrackId = null;
  const total = totalDur();
  if(pv.t > total) pv.t = total;

  const has = app.seq.length > 0;
  $("seqHint").style.display = has ? "none" : "";
  $("tledit").style.display = has ? "" : "none";
  $("cliptool").style.display = "none";
  $("audiotool").style.display = "none";
  const info = $("seqInfo");
  info.textContent = has ? (app.seq.length + (app.seq.length===1?" clip":" clips") + " · " + total + "s total") : "";
  info.classList.toggle("warn", total > 90);
  if(total > 90) info.textContent += " — over Instagram's 90s reel limit";

  drawPreviewFrame(); updatePvTime();
  if(!has) return;

  tlPps = Math.max(5, Math.min(60, tlWidth() / Math.max(total, 8)));
  const limit = total;
  $("tlinner").style.width = Math.ceil(limit * tlPps + 20) + "px";

  // ruler
  const ruler = $("ruler"); ruler.innerHTML = "";
  const steps = [1,2,5,10,15,30,60];
  let step = 60;
  for(let si=0; si<steps.length; si++){ if(steps[si]*tlPps >= 44){ step = steps[si]; break; } }
  for(let s=0; s<=limit; s+=step){
    const tk = document.createElement("span");
    tk.className = "tick"; tk.style.left = (s*tlPps) + "px";
    tk.textContent = fmtTime(s);
    ruler.appendChild(tk);
  }

  // video lane
  const vlane = $("vlane"); vlane.innerHTML = "";
  let acc = 0;
  app.seq.forEach(function(c, i){
    const it = byId(c.id);
    const d = document.createElement("div");
    d.className = "tlclip" + (c.id === app.selClipId ? " on" : "");
    d.style.left = (acc*tlPps) + "px";
    d.style.width = Math.max(6, c.dur*tlPps) + "px";
    if(it && it.thumbUrl) d.style.backgroundImage = "url(" + it.thumbUrl + ")";
    d.innerHTML = '<span class="tlo">' + (i+1) + '</span><span class="tld">' + c.dur + 's</span><div class="tlh"></div>';
    const clipStart = acc;
    d.addEventListener("pointerdown", function(e){
      if(app.vbusy) return;
      if((e.target as Element).classList.contains("tlh")){ startResize(e, c, clipStart, d); return; }
      app.selClipId = c.id; app.selTrackId = null;
      renderTimeline(); showClipTool();
      e.stopPropagation();
    });
    vlane.appendChild(d);
    if(S.trans !== "none" && i < app.seq.length - 1){
      const mk = document.createElement("div");
      mk.className = "tcut";
      mk.style.left = ((acc + c.dur) * tlPps) + "px";
      vlane.appendChild(mk);
    }
    acc += c.dur;
  });

  // audio rows — one row per lane; blocks are freely positioned and can overlap across rows
  const alanes = $("alanes");
  alanes.innerHTML = "";
  alanes.style.display = app.tracks.length ? "" : "none";
  if(app.tracks.length){
    const atCap = Math.max(0, total - 0.25);
    app.tracks.forEach(function(t){ if(t.at > atCap) t.at = atCap; });
    const laneVals: number[] = [];
    app.tracks.forEach(function(t){ if(laneVals.indexOf(t.lane) < 0) laneVals.push(t.lane); });
    laneVals.sort(function(a,b){ return a-b; });
    const rows: Record<number, HTMLElement> = {};
    laneVals.forEach(function(lv){
      const r = document.createElement("div");
      r.className = "alanerow";
      alanes.appendChild(r);
      rows[lv] = r;
    });
    app.tracks.forEach(function(t){ buildAudioBlock(rows[t.lane], t, total); });
  }

  positionPlayhead();
  if(app.selClipId !== null) showClipTool();
  else if(app.selTrackId !== null) showAudioTool();
}

function buildAudioBlock(host: HTMLElement, t: AudioTrack, total: number): void {
  const b = document.createElement("div");
  const len = Math.max(0, t.end - t.start);
  const vLen = Math.max(0.25, Math.min(len, total - t.at));   // visible/audible part — cut at the video's end
  b.className = "tlseg" + (t.id === app.selTrackId ? " on" : "");
  b.style.left = (t.at*tlPps) + "px";
  const bw = Math.max(12, Math.round(vLen*tlPps)), bh = 30;
  b.style.width = bw + "px";
  const wc = document.createElement("canvas");
  wc.width = bw; wc.height = bh;
  drawSegWave(wc, bw, bh, t, t.at, total);
  b.appendChild(wc);
  b.insertAdjacentHTML("beforeend", '<div class="tshL"></div><div class="tshR"></div>');
  b.title = t.name;
  b.addEventListener("pointerdown", function(e){
    if(app.vbusy) return;
    if((e.target as Element).classList.contains("tshL")){ startAudioTrim(e, t, "L", b); return; }
    if((e.target as Element).classList.contains("tshR")){ startAudioTrim(e, t, "R", b); return; }
    startAudioMove(e, t, b);
    e.stopPropagation();
  });
  host.appendChild(b);
}

/** clientX that tolerates both pointer and touch events (as the original did). */
function evX(e: PointerEvent | TouchEvent): number {
  const te = e as TouchEvent;
  return te.touches ? te.touches[0].clientX : (e as PointerEvent).clientX;
}

// drag a clip's right edge to change its duration
function startResize(e: PointerEvent, clip: Clip, clipStart: number, el: HTMLElement): void {
  e.preventDefault(); e.stopPropagation();
  app.selClipId = clip.id; app.selTrackId = null;
  const move = function(ev: PointerEvent){
    const r = $("tlinner").getBoundingClientRect();
    const x = evX(ev) - r.left - 8;
    let nd = Math.round(x / tlPps - clipStart);
    nd = Math.max(1, Math.min(60, nd));
    if(nd !== clip.dur){
      clip.dur = nd;
      el.style.width = Math.max(6, clip.dur*tlPps) + "px";
      el.querySelector(".tld")!.textContent = clip.dur + "s";
    }
  };
  const up = function(){
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    renderTimeline(); updateSelUI(); invalidateResult(); showClipTool();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

// drag an audio block body to move it along the timeline (click = select)
function startAudioMove(e: PointerEvent, t: AudioTrack, el: HTMLElement): void {
  e.preventDefault();
  const x0 = evX(e);
  const at0 = t.at;
  let moved = false;
  const wc = el.querySelector("canvas")!;
  let raf = 0, dirty = false;
  let bw = 0;
  const move = function(ev: PointerEvent){
    const dx = (evX(ev) - x0) / tlPps;
    if(!moved && Math.abs(dx*tlPps) < 3) return;
    moved = true;
    const total = totalDur(), atCap = Math.max(0, total - 0.5);
    t.at = Math.max(0, Math.min(Math.round((at0 + dx)*10)/10, atCap));
    if(t.at < 0.15) t.at = 0;
    el.style.left = (t.at*tlPps) + "px";
    const vLen = Math.max(0.25, Math.min(t.end - t.start, total - t.at));
    bw = Math.max(12, Math.round(vLen*tlPps));
    el.style.width = bw + "px";
    dirty = true;
    if(!raf) raf = requestAnimationFrame(function(){
      raf = 0;
      if(dirty){ dirty = false; wc.width = bw; drawSegWave(wc, bw, 30, t, t.at, totalDur()); }
    });
    app.selTrackId = t.id;
    updateAudioToolLbl();
  };
  const up = function(){
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    cancelAnimationFrame(raf);
    app.selTrackId = t.id; app.selClipId = null;
    if(moved){ refreshAudioUI(); invalidateResult(); }
    else renderTimeline();
    showAudioTool();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

// drag an audio block's edges: left trims the start (block edge moves, audio stays time-aligned), right trims the end
function startAudioTrim(e: PointerEvent, t: AudioTrack, side: "L" | "R", el: HTMLElement): void {
  e.preventDefault(); e.stopPropagation();
  app.selTrackId = t.id; app.selClipId = null;
  const x0 = evX(e);
  const s0 = t.start, e0 = t.end, a0 = t.at;
  let raf = 0, dirty = false;
  let bw = 0;
  const wc = el.querySelector("canvas")!;
  const move = function(ev: PointerEvent){
    const dx = (evX(ev) - x0) / tlPps;
    const total = totalDur();
    if(side === "L"){
      const dxMax = Math.max(0, total - 0.25) - a0;      // can't push the block past the video end
      const eff = Math.min(dx, dxMax);
      t.start = Math.min(Math.max(0, s0 + eff), t.end - 0.25);
      t.at = Math.max(0, a0 + (t.start - s0));
      el.style.left = (t.at*tlPps) + "px";
    } else {
      const endCap = Math.min(t.dur, t.start + Math.max(0.25, total - t.at));  // right edge stops at the video end
      t.end = Math.max(Math.min(endCap, e0 + dx), t.start + 0.25);
    }
    const vLen = Math.max(0.25, Math.min(t.end - t.start, total - t.at));
    bw = Math.max(12, Math.round(vLen*tlPps));
    el.style.width = bw + "px";
    dirty = true;
    if(!raf) raf = requestAnimationFrame(function(){
      raf = 0;
      if(dirty){ dirty = false; wc.width = bw; drawSegWave(wc, bw, 30, t, t.at, totalDur()); }
    });
    updateAudioToolLbl();
  };
  const up = function(){
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    cancelAnimationFrame(raf);
    refreshAudioUI(); invalidateResult(); showAudioTool();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  $("audiotool").style.display = ""; $("cliptool").style.display = "none";
  updateAudioToolLbl();
}

// toolbar for the selected clip
function selClipIdx(): number {
  for(let i=0;i<app.seq.length;i++){ if(app.seq[i].id===app.selClipId) return i; }
  return -1;
}
function showClipTool(): void {
  const i = selClipIdx();
  if(i < 0){ $("cliptool").style.display = "none"; return; }
  const it = byId(app.seq[i].id);
  $("audiotool").style.display = "none";
  $("cliptool").style.display = "";
  $("cliptoolLbl").textContent = "Clip " + (i+1) + (it ? " · " + it.name : "") + " · " + app.seq[i].dur + "s";
  $<HTMLButtonElement>("ctL").disabled = (i === 0);
  $<HTMLButtonElement>("ctR").disabled = (i === app.seq.length - 1);
}

// toolbar for the selected audio piece
function selTrackIdx(): number {
  for(let i=0;i<app.tracks.length;i++){ if(app.tracks[i].id===app.selTrackId) return i; }
  return -1;
}
function updateAudioToolLbl(): void {
  const i = selTrackIdx(); if(i < 0) return;
  const t = app.tracks[i];
  let lbl = shortName(t.name) + " · " + fmtTime(t.end - t.start) + " · at " + fmtTime(t.at);
  if(t.start > 0.05) lbl += " · from " + fmtTime(t.start);
  if(t.end < t.dur - 0.05) lbl += " · to " + fmtTime(t.end);
  $("audiotoolLbl").textContent = lbl;
}
function showAudioTool(): void {
  const i = selTrackIdx();
  if(i < 0){ $("audiotool").style.display = "none"; return; }
  $("cliptool").style.display = "none";
  $("audiotool").style.display = "";
  updateAudioToolLbl();
}

/** Scrub + toolbar + resize wiring. */
export function initTimeline(): void {
  // scrub by dragging the ruler / lane background
  let scrubbing = false;
  function toT(e: PointerEvent): number {
    const r = $("tlinner").getBoundingClientRect();
    const x = evX(e) - r.left - 8;
    return x / tlPps;
  }
  document.addEventListener("pointerdown", function(e){
    const target = e.target as Element;
    const ed = target.closest && target.closest("#tledit");
    if(!ed || app.vbusy) return;
    if(target.closest(".tlclip") || target.closest(".tlseg")) return;
    scrubbing = true;
    pvSeek(toT(e));
  });
  document.addEventListener("pointermove", function(e){ if(scrubbing) pvSeek(toT(e)); });
  document.addEventListener("pointerup", function(){ scrubbing = false; });

  $("ctL").onclick = function(){ const i=selClipIdx(); if(app.vbusy||i<1) return; const t=app.seq[i-1]; app.seq[i-1]=app.seq[i]; app.seq[i]=t; renderTimeline(); invalidateResult(); showClipTool(); };
  $("ctR").onclick = function(){ const i=selClipIdx(); if(app.vbusy||i<0||i>=app.seq.length-1) return; const t=app.seq[i+1]; app.seq[i+1]=app.seq[i]; app.seq[i]=t; renderTimeline(); invalidateResult(); showClipTool(); };
  $("ctM").onclick = function(){ const i=selClipIdx(); if(app.vbusy||i<0) return; app.seq[i].dur=Math.max(1,app.seq[i].dur-1); renderTimeline(); updateSelUI(); invalidateResult(); showClipTool(); };
  $("ctP").onclick = function(){ const i=selClipIdx(); if(app.vbusy||i<0) return; app.seq[i].dur=Math.min(60,app.seq[i].dur+1); renderTimeline(); updateSelUI(); invalidateResult(); showClipTool(); };
  $("ctX").onclick = function(){ const i=selClipIdx(); if(app.vbusy||i<0) return; const it=byId(app.seq[i].id); if(it) setSelected(it,false); };

  $("atS").onclick = function(){
    const i = selTrackIdx(); if(app.vbusy || i < 0) return;
    const t = app.tracks[i], len = t.end - t.start, rel = pv.t - t.at;
    if(rel < 0.15 || rel > len - 0.15){
      $("audiotoolLbl").textContent = "Move the playhead over this audio, then split.";
      return;
    }
    const right: AudioTrack = { id: ++app.trackIdc, name: t.name, buffer: t.buffer, dur: t.dur,
                  start: t.start + rel, end: t.end, at: t.at + rel, lane: t.lane };
    t.end = t.start + rel;
    app.tracks.splice(i+1, 0, right);
    refreshAudioUI(); invalidateResult(); showAudioTool();
  };
  $("atX").onclick = function(){
    const i = selTrackIdx(); if(app.vbusy || i < 0) return;
    app.tracks.splice(i, 1); app.selTrackId = null;
    refreshAudioUI(); invalidateResult();
  };

  window.addEventListener("resize", function(){ if(app.seq.length) renderTimeline(); });
}
