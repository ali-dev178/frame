import { LOOKS, MOTIONS, TRANSITIONS } from "../core/config";
import { beginOp, commitOp, op } from "../core/history";
import { fmtTime, shortName } from "../core/names";
import { markDirty } from "../core/project";
import { S, app, byId, totalDur, trackById } from "../state";
import type { AudioTrack, Clip, OptionDef } from "../types";
import { $ } from "./dom";
import { drawPreviewFrame, invalidateResult, invalidateResultQuiet, pv, pvSeek, setSelected, syncItemSelection, syncTransDurUI, updatePvTime, updateSelUI } from "./studio";
import { refreshAudioUI } from "./soundtrack";

/** Pixels per second on the timeline — recomputed by renderTimeline to fit. */
let tlPps = 12;
/** Zoom multiplier over the fit-to-width base: 1 = fit, up to 8× in. */
let tlZoom = 1;

function tlWidth(): number {
  return Math.max(100, ($("tledit").clientWidth || 600) - 18);
}

/** Set the timeline zoom (1 = fit-to-width … 8× in) and re-render. */
function setZoom(z: number): void {
  const nz = Math.max(1, Math.min(8, z));
  if(nz === tlZoom) return;
  tlZoom = nz;
  renderTimeline();
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
  app.seq = app.seq.filter(function(c){ return c.card || byId(c.id); }); // title cards have no item
  if(app.selClipId !== null && !app.seq.some(function(c){ return c.uid === app.selClipId; })) app.selClipId = null;
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
  if(total > 90) info.textContent += " — over 90s, longer than some platforms allow";

  drawPreviewFrame(); updatePvTime();
  markDirty(); // every timeline mutation re-renders through here — even to empty
  syncTransDurUI(); // per-clip transitions can flip the global duration slider's visibility
  $("tlzoom").style.display = has ? "" : "none";
  if(!has){ tlZoom = 1; return; } // an empty/cleared timeline resets to fit-to-width

  const fit = Math.max(5, Math.min(60, tlWidth() / Math.max(total, 8)));
  tlPps = Math.max(5, Math.min(400, fit * tlZoom));
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
    d.className = "tlclip" + (c.uid === app.selClipId ? " on" : "") + (c.card ? " titlecard" : "");
    d.style.left = (acc*tlPps) + "px";
    d.style.width = Math.max(6, c.dur*tlPps) + "px";
    if(c.card){ d.style.backgroundColor = c.card.bg; }
    else if(it && it.thumbUrl){ d.style.backgroundImage = "url(" + it.thumbUrl + ")"; }
    d.innerHTML = '<span class="tlo">' + (i+1) + '</span><span class="tld">' + c.dur + 's</span><div class="tlh"></div>';
    if(c.card){
      const tt = document.createElement("span");
      tt.className = "tlt"; tt.style.color = c.card.fg; tt.textContent = c.card.text || "Title";
      d.insertBefore(tt, d.querySelector(".tlh"));
    }
    const clipStart = acc;
    d.addEventListener("pointerdown", function(e){
      if(app.vbusy) return;
      if((e.target as Element).classList.contains("tlh")){ startResize(e, c, clipStart, d); return; }
      e.stopPropagation();
      startClipDrag(e, c, i, d);
    });
    vlane.appendChild(d);
    if((c.trans || S.trans) !== "none" && i < app.seq.length - 1){
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

/** Insertion index (0..n) for a drop at time `curT`, by clip midpoints. Exported for tests. */
export function insertIndexAt(curT: number): number {
  let acc = 0;
  for(let k=0; k<app.seq.length; k++){
    if(curT < acc + app.seq[k].dur/2) return k;
    acc += app.seq[k].dur;
  }
  return app.seq.length;
}

// drag a clip along the video lane to reorder it (a click with no drag just selects)
function startClipDrag(e: PointerEvent, clip: Clip, index: number, el: HTMLElement): void {
  e.preventDefault();
  // select now, but DON'T rebuild the lane yet — that would destroy `el` mid-drag
  app.selClipId = clip.uid !== undefined ? clip.uid : null; app.selTrackId = null;
  const vlane = $("vlane");
  Array.from(vlane.querySelectorAll(".tlclip")).forEach(function(n){ n.classList.remove("on"); });
  el.classList.add("on");
  showClipTool();
  const x0 = evX(e);
  let moved = false;
  let to = index;
  const ind = document.createElement("div");
  ind.className = "tldrop"; ind.style.display = "none";
  vlane.appendChild(ind);
  const place = function(){
    let acc = 0;
    for(let k=0; k<to; k++) acc += app.seq[k].dur;
    ind.style.left = (acc*tlPps) + "px";
  };
  const move = function(ev: PointerEvent){
    if(!moved && Math.abs(evX(ev) - x0) < 4) return;
    moved = true;
    el.classList.add("drag");
    const r = $("tlinner").getBoundingClientRect();
    const curT = (evX(ev) - r.left - 8) / tlPps;
    to = insertIndexAt(curT);
    place();
    ind.style.display = "";
  };
  const up = function(){
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    ind.remove();
    // to === index or index+1 means the same slot → not a real move
    if(moved && to !== index && to !== index + 1){
      op(function(){
        const cut = app.seq.splice(index, 1)[0];
        const dest = to > index ? to - 1 : to;
        app.seq.splice(dest, 0, cut);
      });
      invalidateResult();
    }
    renderTimeline(); showClipTool();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
}

// drag a clip's right edge to change its duration
function startResize(e: PointerEvent, clip: Clip, clipStart: number, el: HTMLElement): void {
  e.preventDefault(); e.stopPropagation();
  beginOp();
  app.selClipId = clip.uid !== undefined ? clip.uid : null; app.selTrackId = null;
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
    document.removeEventListener("pointercancel", up);
    commitOp();
    renderTimeline(); updateSelUI(); invalidateResult(); showClipTool();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up); // touch/pen interruption still terminates the drag → commitOp runs
}

// drag an audio block body to move it along the timeline (click = select)
function startAudioMove(e: PointerEvent, t: AudioTrack, el: HTMLElement): void {
  e.preventDefault();
  beginOp();
  const x0 = evX(e);
  const at0 = t.at;
  let moved = false;
  const wc = el.querySelector("canvas")!;
  let raf = 0, dirty = false;
  let bw = 0;
  // clip-cut times to snap the block's start against
  const bounds = [0]; let ba = 0;
  app.seq.forEach(function(c){ ba += c.dur; bounds.push(ba); });
  const move = function(ev: PointerEvent){
    const dx = (evX(ev) - x0) / tlPps;
    if(!moved && Math.abs(dx*tlPps) < 3) return;
    moved = true;
    const total = totalDur(), atCap = Math.max(0, total - 0.5);
    let nat = Math.round((at0 + dx)*10)/10;
    const snap = 7 / tlPps; // px tolerance → seconds
    let best = -1, bd = snap; // snap to the NEAREST clip cut within tolerance, not the first
    for(let bi=0; bi<bounds.length; bi++){ const dd = Math.abs(bounds[bi] - nat); if(dd < bd){ bd = dd; best = bi; } }
    if(best >= 0) nat = bounds[best];
    t.at = Math.max(0, Math.min(nat, atCap));
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
    document.removeEventListener("pointercancel", up);
    cancelAnimationFrame(raf);
    commitOp();
    app.selTrackId = t.id; app.selClipId = null;
    if(moved){ refreshAudioUI(); invalidateResult(); }
    else renderTimeline();
    showAudioTool();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up); // touch/pen interruption still terminates the drag → commitOp runs
}

// drag an audio block's edges: left trims the start (block edge moves, audio stays time-aligned), right trims the end
function startAudioTrim(e: PointerEvent, t: AudioTrack, side: "L" | "R", el: HTMLElement): void {
  e.preventDefault(); e.stopPropagation();
  beginOp();
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
    document.removeEventListener("pointercancel", up);
    cancelAnimationFrame(raf);
    commitOp();
    refreshAudioUI(); invalidateResult(); showAudioTool();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up); // touch/pen interruption still terminates the drag → commitOp runs
  $("audiotool").style.display = ""; $("cliptool").style.display = "none";
  updateAudioToolLbl();
}

// toolbar for the selected clip
function selClipIdx(): number {
  for(let i=0;i<app.seq.length;i++){ if(app.seq[i].uid===app.selClipId) return i; }
  return -1;
}
function showClipTool(): void {
  const i = selClipIdx();
  if(i < 0){ $("cliptool").style.display = "none"; return; }
  const clip = app.seq[i];
  const it = byId(clip.id);
  const isCard = !!clip.card;
  $("audiotool").style.display = "none";
  $("cliptool").style.display = "";
  $("cliptoolLbl").textContent = isCard
    ? "Title card · " + clip.dur + "s"
    : "Clip " + (i+1) + (it ? " · " + it.name : "") + " · " + clip.dur + "s";
  $<HTMLButtonElement>("ctL").disabled = (i === 0);
  $<HTMLButtonElement>("ctR").disabled = (i === app.seq.length - 1);
  // motion & look are photo-only; a title card gets text + colors instead
  $<HTMLSelectElement>("ctMotion").style.display = isCard ? "none" : "";
  $<HTMLSelectElement>("ctLook").style.display = isCard ? "none" : "";
  $<HTMLSelectElement>("ctMotion").value = clip.motion || "";
  $<HTMLSelectElement>("ctLook").value = clip.look || "";
  const trSel = $<HTMLSelectElement>("ctTrans");
  trSel.value = clip.trans || "";
  trSel.disabled = (i === app.seq.length - 1); // last clip has nothing to transition into
  const txt = $<HTMLInputElement>("ctText");
  const titleIn = $<HTMLInputElement>("ctTitle");
  const bg = $<HTMLInputElement>("ctBg"), fg = $<HTMLInputElement>("ctFg");
  txt.style.display = isCard ? "none" : "";
  titleIn.style.display = isCard ? "" : "none";
  bg.style.display = isCard ? "" : "none";
  fg.style.display = isCard ? "" : "none";
  // resync the active text field when the SELECTED CLIP changes, even while it has
  // focus, so a clip switch doesn't leave the old value editable into the new clip
  if(isCard){
    if(document.activeElement !== titleIn || capSyncId !== app.selClipId){
      titleIn.value = clip.card!.text;
      capSyncId = app.selClipId;
    }
    bg.value = clip.card!.bg;
    fg.value = clip.card!.fg;
  } else if(document.activeElement !== txt || capSyncId !== app.selClipId){
    txt.value = clip.text || "";
    capSyncId = app.selClipId;
  }
}
let capSyncId: number | null = null;

/** Add a blank title card at the end of the timeline and select it. */
function addTitleCard(): void {
  if(app.vbusy) return;
  op(function(){
    const c: Clip = { uid: ++app.clipIdc, id: 0, dur: 3, card: { text: "Title", bg: "#101010", fg: "#ffffff" } };
    app.seq.push(c);
    app.selClipId = c.uid !== undefined ? c.uid : null; app.selTrackId = null;
  });
  renderTimeline(); updateSelUI(); invalidateResult(); markDirty(); showClipTool();
}

/** Populate a per-clip override <select>: an "Auto" row (value "") + one per option. */
function fillClipSel(sel: HTMLSelectElement, defs: OptionDef[], autoLabel: string): void {
  sel.innerHTML = "";
  const o0 = document.createElement("option");
  o0.value = ""; o0.textContent = autoLabel;
  sel.appendChild(o0);
  defs.forEach(function(d){
    const o = document.createElement("option");
    o.value = d.key; o.textContent = d.label;
    sel.appendChild(o);
  });
}

/** Set (or clear, when v==="") a per-clip motion/look/transition override. */
function setClipOverride(key: "motion" | "look" | "trans", v: string): void {
  const i = selClipIdx(); if(app.vbusy || i < 0) return;
  op(function(){ if(v) app.seq[i][key] = v; else delete app.seq[i][key]; });
  renderTimeline(); invalidateResult(); showClipTool();
}

// toolbar for the selected audio piece
function selTrackIdx(): number {
  for(let i=0;i<app.tracks.length;i++){ if(app.tracks[i].id===app.selTrackId) return i; }
  return -1;
}
function updateAudioToolLbl(): void {
  const i = selTrackIdx(); if(i < 0) return;
  const t = app.tracks[i];
  const vol = t.gain === undefined ? 1 : t.gain;
  let lbl = shortName(t.name) + " · " + fmtTime(t.end - t.start) + " · at " + fmtTime(t.at);
  if(t.start > 0.05) lbl += " · from " + fmtTime(t.start);
  if(t.end < t.dur - 0.05) lbl += " · to " + fmtTime(t.end);
  lbl += " · vol " + Math.round(vol * 100) + "%";
  if(t.fadeIn) lbl += " · in " + t.fadeIn + "s";
  if(t.fadeOut) lbl += " · out " + t.fadeOut + "s";
  if(t.duck) lbl += " · duck";
  $("audiotoolLbl").textContent = lbl;
}
function showAudioTool(): void {
  const i = selTrackIdx();
  if(i < 0){ $("audiotool").style.display = "none"; return; }
  $("cliptool").style.display = "none";
  $("audiotool").style.display = "";
  const t = app.tracks[i];
  $<HTMLInputElement>("atVol").value = String(Math.round((t.gain === undefined ? 1 : t.gain) * 100));
  $<HTMLInputElement>("atFadeIn").value = String(t.fadeIn || 0);
  $<HTMLInputElement>("atFadeOut").value = String(t.fadeOut || 0);
  $<HTMLInputElement>("atDuck").checked = !!t.duck;
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

  $("ctL").onclick = function(){ const i=selClipIdx(); if(app.vbusy||i<1) return; op(function(){ const t=app.seq[i-1]; app.seq[i-1]=app.seq[i]; app.seq[i]=t; }); renderTimeline(); invalidateResult(); showClipTool(); };
  $("ctR").onclick = function(){ const i=selClipIdx(); if(app.vbusy||i<0||i>=app.seq.length-1) return; op(function(){ const t=app.seq[i+1]; app.seq[i+1]=app.seq[i]; app.seq[i]=t; }); renderTimeline(); invalidateResult(); showClipTool(); };
  $("ctM").onclick = function(){ const i=selClipIdx(); if(app.vbusy||i<0) return; op(function(){ app.seq[i].dur=Math.max(1,app.seq[i].dur-1); }); renderTimeline(); updateSelUI(); invalidateResult(); showClipTool(); };
  $("ctP").onclick = function(){ const i=selClipIdx(); if(app.vbusy||i<0) return; op(function(){ app.seq[i].dur=Math.min(60,app.seq[i].dur+1); }); renderTimeline(); updateSelUI(); invalidateResult(); showClipTool(); };
  $("ctD").onclick = function(){
    const i=selClipIdx(); if(app.vbusy||i<0) return;
    op(function(){
      const c = app.seq[i];
      const copy: Clip = { uid: ++app.clipIdc, id: c.id, dur: c.dur };
      if(c.text) copy.text = c.text;
      if(c.motion) copy.motion = c.motion;
      if(c.look) copy.look = c.look;
      if(c.trans) copy.trans = c.trans;
      if(c.card) copy.card = { text: c.card.text, bg: c.card.bg, fg: c.card.fg };
      app.seq.splice(i+1, 0, copy);
      app.selClipId = copy.uid!;
    });
    renderTimeline(); updateSelUI(); invalidateResult(); markDirty(); showClipTool();
  };
  $("ctX").onclick = function(){
    const i=selClipIdx(); if(app.vbusy||i<0) return;
    // removes just THIS clip — the photo stays ticked while other copies remain
    const it = byId(app.seq[i].id);
    op(function(){
      app.seq.splice(i, 1);
      app.selClipId = null;
    });
    if(it) syncItemSelection(it);
    renderTimeline(); updateSelUI(); invalidateResult(); markDirty();
  };

  // per-clip caption — updates the preview live without rebuilding the
  // timeline (a rebuild would steal focus mid-typing)
  const ctText = $<HTMLInputElement>("ctText");
  ctText.onfocus = function(){ beginOp(); };   // one undo step per editing session,
  ctText.onblur = function(){ commitOp(); };   // not per keystroke
  ctText.oninput = function(){
    const i = selClipIdx(); if(app.vbusy || i < 0 || app.seq[i].card) return; // captions are photo-only
    const v = ctText.value;
    app.seq[i].text = v.trim() ? v : undefined;
    // quiet invalidation: typing must not pause a playing preview
    drawPreviewFrame(); invalidateResultQuiet(); markDirty();
  };

  $("atS").onclick = function(){
    const i = selTrackIdx(); if(app.vbusy || i < 0) return;
    const t = app.tracks[i], len = t.end - t.start, rel = pv.t - t.at;
    if(rel < 0.15 || rel > len - 0.15){
      $("audiotoolLbl").textContent = "Move the playhead over this audio, then split.";
      return;
    }
    op(function(){
      const right: AudioTrack = { id: ++app.trackIdc, name: t.name, file: t.file, buffer: t.buffer, dur: t.dur,
                    start: t.start + rel, end: t.end, at: t.at + rel, lane: t.lane, gain: t.gain,
                    fadeOut: t.fadeOut, duck: t.duck };
      t.end = t.start + rel;
      t.fadeOut = 0; // the left half no longer reaches the original end
      app.tracks.splice(i+1, 0, right);
    });
    refreshAudioUI(); invalidateResult(); showAudioTool();
  };
  $("atD").onclick = function(){
    const i = selTrackIdx(); if(app.vbusy || i < 0) return;
    op(function(){
      const t = app.tracks[i];
      const len = Math.max(0, t.end - t.start);
      const copy: AudioTrack = { id: ++app.trackIdc, name: t.name, file: t.file, buffer: t.buffer, dur: t.dur,
                    start: t.start, end: t.end, at: t.at + len, lane: t.lane, gain: t.gain,
                    fadeIn: t.fadeIn, fadeOut: t.fadeOut, duck: t.duck };
      app.tracks.splice(i+1, 0, copy);
      app.selTrackId = copy.id;
    });
    refreshAudioUI(); invalidateResult(); showAudioTool();
  };
  $("atX").onclick = function(){
    const i = selTrackIdx(); if(app.vbusy || i < 0) return;
    op(function(){
      app.tracks.splice(i, 1); app.selTrackId = null;
    });
    refreshAudioUI(); invalidateResult();
  };

  // per-track volume — the mixing story: drop a music bed under narration
  const atVol = $<HTMLInputElement>("atVol");
  // One undo step per adjustment session: begin when the slider takes focus
  // (mouse press or Tab), commit on blur. A per-onchange commit would only
  // record the FIRST keyboard arrow-key change and drop the rest.
  atVol.onfocus = function(){ beginOp(); };
  atVol.oninput = function(){
    const i = selTrackIdx(); if(app.vbusy || i < 0) return;
    app.tracks[i].gain = Math.max(0, Math.min(1, (+atVol.value) / 100));
    updateAudioToolLbl();
    if(pv.playing) pvSeek(pv.t); // reschedule live audio with the new level
    invalidateResultQuiet(); markDirty();
  };
  atVol.onblur = function(){ commitOp(); };

  // per-track fade in/out (seconds) + auto-duck toggle
  const wireFade = function(id: string, key: "fadeIn" | "fadeOut"){
    const inp = $<HTMLInputElement>(id);
    // one undo step per editing session (focus→blur), like the volume slider —
    // committing per onchange would drop all but the first spinner/arrow step
    inp.onfocus = function(){ beginOp(); };
    inp.onblur = function(){ commitOp(); };
    inp.oninput = function(){
      const i = selTrackIdx(); if(app.vbusy || i < 0) return;
      app.tracks[i][key] = Math.max(0, Math.min(30, (+inp.value) || 0));
      updateAudioToolLbl();
      if(pv.playing) pvSeek(pv.t); // reschedule live audio with the new envelope
      invalidateResultQuiet(); markDirty();
    };
  };
  wireFade("atFadeIn", "fadeIn");
  wireFade("atFadeOut", "fadeOut");
  const atDuck = $<HTMLInputElement>("atDuck");
  atDuck.onchange = function(){
    const i = selTrackIdx(); if(app.vbusy || i < 0) return;
    op(function(){ app.tracks[i].duck = atDuck.checked; });
    updateAudioToolLbl();
    if(pv.playing) pvSeek(pv.t);
    invalidateResultQuiet(); markDirty();
  };

  // per-clip overrides — Motion / Look / Transition-out, each defaulting to Auto (global)
  fillClipSel($<HTMLSelectElement>("ctMotion"), MOTIONS, "Motion: auto");
  fillClipSel($<HTMLSelectElement>("ctLook"), LOOKS, "Look: auto");
  fillClipSel($<HTMLSelectElement>("ctTrans"), TRANSITIONS, "After: auto");
  $<HTMLSelectElement>("ctMotion").onchange = function(){ setClipOverride("motion", $<HTMLSelectElement>("ctMotion").value); };
  $<HTMLSelectElement>("ctLook").onchange = function(){ setClipOverride("look", $<HTMLSelectElement>("ctLook").value); };
  $<HTMLSelectElement>("ctTrans").onchange = function(){ setClipOverride("trans", $<HTMLSelectElement>("ctTrans").value); };

  // title cards: add button + text/colour editing (mirrors the caption pattern)
  $("addTitle").onclick = addTitleCard;
  const ctTitle = $<HTMLInputElement>("ctTitle");
  ctTitle.onfocus = function(){ beginOp(); };
  ctTitle.onblur = function(){ commitOp(); renderTimeline(); }; // refresh the timeline label on finish
  ctTitle.oninput = function(){
    const i = selClipIdx(); if(app.vbusy || i < 0 || !app.seq[i].card) return;
    app.seq[i].card!.text = ctTitle.value;
    drawPreviewFrame(); invalidateResultQuiet(); markDirty(); // no full re-render: don't steal focus
  };
  const wireCardColor = function(id: string, key: "bg" | "fg"){
    const inp = $<HTMLInputElement>(id);
    inp.onfocus = function(){ beginOp(); };
    inp.onchange = function(){ commitOp(); renderTimeline(); };
    inp.oninput = function(){
      const i = selClipIdx(); if(app.vbusy || i < 0 || !app.seq[i].card) return;
      app.seq[i].card![key] = inp.value;
      drawPreviewFrame(); invalidateResultQuiet(); markDirty();
    };
  };
  wireCardColor("ctBg", "bg");
  wireCardColor("ctFg", "fg");

  // timeline zoom — buttons + Ctrl+wheel over the timeline
  $("tlZoomIn").onclick = function(){ if(!app.vbusy) setZoom(tlZoom * 1.5); };
  $("tlZoomOut").onclick = function(){ if(!app.vbusy) setZoom(tlZoom / 1.5); };
  $("tlZoomFit").onclick = function(){ if(!app.vbusy) setZoom(1); };
  $("tledit").addEventListener("wheel", function(e){
    if(!e.ctrlKey || app.vbusy || !app.seq.length) return;
    e.preventDefault();
    setZoom(tlZoom * ((e as WheelEvent).deltaY < 0 ? 1.2 : 1/1.2));
  }, { passive: false });

  window.addEventListener("resize", function(){ if(app.seq.length) renderTimeline(); });
}
