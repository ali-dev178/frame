import { applyFadesFrom, ensureCtx, scheduleSegs } from "../audio/engine";
import { LOOKS, MOTIONS, TDURS, TRANSITIONS, VQUAL } from "../core/config";
import { beginOp, commitOp } from "../core/history";
import { fmtTime } from "../core/names";
import { markDirty } from "../core/project";
import { exportFast } from "../export/fast";
import { exportRecord } from "../export/record";
import { REC, hasAEnc, hasVEnc } from "../export/capabilities";
import { platform } from "../platform";
import { drawAtTime, outDims } from "../render/sequence";
import { S, app, byId, curTarget, hasAudio, totalDur } from "../state";
import type { Item } from "../types";
import { $, buildSeg, refreshSeg } from "./dom";
import { positionPlayhead, renderTimeline } from "./timeline";

/* ---------- selection ---------- */
export function setSelected(it: Item, on: boolean): void {
  it.selected = !!on;
  if(it.el){
    it.el.classList.toggle("sel", it.selected);
    const cb = it.el.querySelector(".pick input") as HTMLInputElement | null;
    if(cb) cb.checked = it.selected;
  }
  if(it.selected){
    if(!app.seq.some(function(c){ return c.id===it.id; })) app.seq.push({uid: ++app.clipIdc, id: it.id, dur: 4});
  } else {
    // unticking removes EVERY clip of this photo, duplicates included
    if(app.seq.some(function(c){ return c.id===it.id && c.uid===app.selClipId; })) app.selClipId = null;
    app.seq = app.seq.filter(function(c){ return c.id !== it.id; });
  }
  renderTimeline(); updateSelUI(); invalidateResult(); markDirty();
}

/** Card checkbox/highlight follow the timeline — used when single clips are removed. */
export function syncItemSelection(it: Item): void {
  it.selected = app.seq.some(function(c){ return c.id === it.id; });
  if(it.el){
    it.el.classList.toggle("sel", !!it.selected);
    const cb = it.el.querySelector(".pick input") as HTMLInputElement | null;
    if(cb) cb.checked = !!it.selected;
  }
}

export function updateSelUI(): void {
  const n = app.seq.length, m = app.items.length;
  // duplicates mean clip count ≠ photo count — "all selected" is about PHOTOS
  const selItems = app.items.filter(function(it){ return !!it.selected; }).length;
  $("selInfo").textContent = (n === 0)
    ? "Tick the checkbox on the photos you want in the video"
    : selItems + " of " + m + " photos · " + n + (n === 1 ? " clip" : " clips") + " · " + totalDur() + "s";
  $("selAll").textContent = (m > 0 && selItems === m) ? "Select none" : "Select all";
  const btn = $<HTMLButtonElement>("exportBtn");
  if(!app.vbusy){ btn.disabled = (n === 0); btn.textContent = "Export video"; }
}

export function studioOnFrameChange(): void {
  renderTimeline();
  invalidateResult();
}

/* ---------- live preview engine ---------- */
export const pv = {
  playing: false,
  t: 0,
  raf: 0,
  clock0: 0,
  nodes: [] as AudioBufferSourceNode[],
  gain: null as GainNode | null,
  comp: null as DynamicsCompressorNode | null,
};

function pvStopAudio(): void {
  pv.nodes.forEach(function(n){ try{ n.stop(); }catch(e){} });
  pv.nodes = [];
  if(pv.gain){ try{ pv.gain.disconnect(); }catch(e){} pv.gain = null; }
  if(pv.comp){ try{ pv.comp.disconnect(); }catch(e){} pv.comp = null; }
}
function pvStartAudio(fromT: number): void {
  if(!hasAudio()) return;
  const a = ensureCtx();
  if(a.state === "suspended") a.resume();
  pv.gain = a.createGain();
  pv.comp = a.createDynamicsCompressor();
  pv.gain.connect(pv.comp); pv.comp.connect(a.destination);
  const base = a.currentTime + 0.03;
  applyFadesFrom(pv.gain, base, fromT, totalDur());
  pv.nodes = scheduleSegs(a, pv.gain, base, fromT, totalDur());
}
export function pvPause(): void {
  if(!pv.playing){ return; }
  pv.playing = false;
  cancelAnimationFrame(pv.raf);
  pvStopAudio();
  $("pvPlayBtn").textContent = "►";
}
function pvPlay(): void {
  if(app.vbusy || !app.seq.length) return;
  if(pv.t >= totalDur() - 0.01) pv.t = 0;
  pv.playing = true;
  $("pvPlayBtn").textContent = "❚❚";
  pv.clock0 = performance.now() - pv.t*1000;
  pvStartAudio(pv.t);
  (function loop(){
    if(!pv.playing) return;
    pv.t = (performance.now() - pv.clock0) / 1000;
    if(pv.t >= totalDur()){
      pv.t = totalDur();
      drawPreviewFrame(); positionPlayhead(); updatePvTime();
      pvPause();
      return;
    }
    drawPreviewFrame(); positionPlayhead(); updatePvTime();
    pv.raf = requestAnimationFrame(loop);
  })();
}
export function pvSeek(t: number): void {
  pv.t = Math.min(Math.max(0, t), totalDur());
  if(pv.playing){
    pv.clock0 = performance.now() - pv.t*1000;
    pvStopAudio(); pvStartAudio(pv.t);
  }
  drawPreviewFrame(); positionPlayhead(); updatePvTime();
}

export function updatePvTime(): void {
  $("pvTime").textContent = fmtTime(Math.floor(pv.t)) + " / " + fmtTime(totalDur());
}
export function drawPreviewFrame(): void {
  const cvp = $<HTMLCanvasElement>("pvCanvas");
  if(!app.seq.length){
    cvp.style.display = "none"; $("pvEmpty").style.display = "";
    return;
  }
  cvp.style.display = ""; $("pvEmpty").style.display = "none";
  const dims = outDims(), ar = dims.W / Math.max(1, dims.H);
  const boxW = Math.max(160, Math.min(560, ($("player").clientWidth || 560) - 24)), boxH = 400;
  const W = Math.round(Math.min(boxW, boxH * ar));
  const H = Math.round(W / ar);
  if(cvp.width !== W || cvp.height !== H){ cvp.width = W; cvp.height = H; }
  drawAtTime(cvp.getContext("2d")!, W, H, Math.min(pv.t, totalDur()));
}

/* ---------- result area ---------- */
let resultBlob: Blob | null = null;

export function invalidateResult(): void {
  if(app.vbusy) return;
  pvPause();
  invalidateResultQuiet();
}

/** Same teardown WITHOUT pausing the preview — e.g. while typing a caption. */
export function invalidateResultQuiet(): void {
  if(app.vbusy) return;
  resultBlob = null;
  if(app.resultUrl){ URL.revokeObjectURL(app.resultUrl); app.resultUrl = null; }
  $("result").style.display = "none";
  const st = $("resultStage");
  Array.from(st.querySelectorAll("canvas,video")).forEach(function(n){ n.remove(); });
  $("dlResult").style.display = "none";
  $("resultInfo").textContent = "";
}
function invalidateResultForce(): void {
  resultBlob = null;
  if(app.resultUrl){ URL.revokeObjectURL(app.resultUrl); app.resultUrl = null; }
  const st = $("resultStage");
  Array.from(st.querySelectorAll("canvas,video")).forEach(function(n){ n.remove(); });
  $("dlResult").style.display = "none";
  $("resultInfo").textContent = "";
}
function setProg(f: number, label: string): void {
  const pr = $("expProg"); pr.classList.add("on");
  (pr.querySelector("i") as HTMLElement).style.width = (Math.min(1,f)*100).toFixed(1) + "%";
  $("exportBtn").textContent = label + "… " + Math.round(Math.min(1,f)*100) + "%";
}
function setBusy(v: boolean): void {
  app.vbusy = v;
  $("videoPanel").classList.toggle("busy", v);
  $<HTMLButtonElement>("selAll").disabled = v;
  $<HTMLButtonElement>("pvPlayBtn").disabled = v;
  if(v){ $<HTMLButtonElement>("exportBtn").disabled = true; }
  else { $("expProg").classList.remove("on"); $("expRec").classList.remove("on"); updateSelUI(); }
}

function setFmtLine(txt: string): void { $("fmtLine").innerHTML = txt; }

/* ---------- export orchestration ---------- */
function exportName(ext: string): string {
  const first = byId(app.seq[0].id);
  const base = first ? first.name.replace(/\.[^.]+$/, "") : "video";
  return base + "_" + curTarget().suffix + (app.seq.length > 1 ? "_slideshow" : "") + "." + ext;
}
function finishExport(blob: Blob, ext: string, engineLabel: string): void {
  resultBlob = blob;
  app.resultUrl = URL.createObjectURL(blob); app.resultExt = ext;
  const st = $("resultStage");
  Array.from(st.querySelectorAll("canvas")).forEach(function(n){ n.remove(); });
  const v = document.createElement("video");
  v.controls = true; v.playsInline = true; v.loop = true; v.src = app.resultUrl;
  st.insertBefore(v, st.firstChild);
  const mb = (blob.size/1048576).toFixed(1);
  $("resultInfo").textContent = totalDur() + "s · " + ext.toUpperCase() + " · " + mb + " MB · " + engineLabel;
  const dl = $("dlResult");
  dl.style.display = "";
  dl.onclick = function(){
    if(!resultBlob) return;
    platform.saveBlob(resultBlob, exportName(app.resultExt)).then(function(r){
      // a failed save of the export must never look like success
      if(r === "failed") $("resultInfo").textContent = "Couldn't save the video — check disk space and try again.";
    });
  };
}

/**
 * Step 2 panel wiring: motion/look/quality/transition segs, transport,
 * export. Idempotent — presets and project restore re-run it to resync
 * every control with S.
 */
export function initStudio(): void {
  if(hasVEnc) setFmtLine('fast export: <b>merges image + sound directly</b> — no real-time recording');
  else if(REC) setFmtLine('this browser records in <b class="bad">real time</b> (' + REC.label + ') — for fast export use recent Chrome or Edge');
  else setFmtLine('<b class="bad">this browser can\'t make videos</b> — use a recent Chrome, Edge, or Safari');

  function hintOf(list: typeof MOTIONS, key: string): string {
    const o = list.filter(function(x){return x.key===key;})[0] || list[0];
    return o.hint!;
  }

  buildSeg($("segMotion"), MOTIONS, S.motion, function(k){
    S.motion = k;
    refreshSeg($("segMotion"), MOTIONS.map(function(x){return x.key;}), k);
    $("motionHint").textContent = hintOf(MOTIONS, k);
    drawPreviewFrame(); invalidateResult(); markDirty();
  });
  $("motionHint").textContent = hintOf(MOTIONS, S.motion);

  buildSeg($("segLook"), LOOKS, S.look, function(k){
    S.look = k;
    refreshSeg($("segLook"), LOOKS.map(function(x){return x.key;}), k);
    $("lookHint").textContent = hintOf(LOOKS, k);
    drawPreviewFrame(); invalidateResult(); markDirty();
  });
  $("lookHint").textContent = hintOf(LOOKS, S.look);

  buildSeg($("segVQuality"), VQUAL, S.vq, function(k){
    S.vq = k;
    refreshSeg($("segVQuality"), VQUAL.map(function(x){return x.key;}), k);
    invalidateResult(); markDirty();
  });
  const vfade = $<HTMLInputElement>("vfade"); vfade.checked = S.vfade;

  buildSeg($("segTrans"), TRANSITIONS, S.trans, function(k){
    S.trans = k;
    refreshSeg($("segTrans"), TRANSITIONS.map(function(x){return x.key;}), k);
    $("transHint").textContent = hintOf(TRANSITIONS, k);
    $("segTransDur").style.display = (k === "none") ? "none" : "";
    renderTimeline(); invalidateResult();
  });
  $("transHint").textContent = hintOf(TRANSITIONS, S.trans);
  $("segTransDur").style.display = (S.trans === "none") ? "none" : "";
  buildSeg($("segTransDur"), TDURS, String(S.transDur), function(k){
    S.transDur = parseFloat(k);
    refreshSeg($("segTransDur"), TDURS.map(function(x){return x.key;}), k);
    renderTimeline(); invalidateResult();
  });
  vfade.onchange = function(){ S.vfade = vfade.checked; invalidateResult(); markDirty(); };

  $("pvPlayBtn").onclick = function(){ if(pv.playing) pvPause(); else pvPlay(); };

  // frame-perfect still of the playhead moment — e.g. a reel cover that
  // matches the actual video (same renderer as export, full output size)
  $("pvFrameBtn").onclick = function(){
    if(app.vbusy || !app.seq.length) return;
    const dims = outDims();
    if(!dims.W) return;
    const cv = document.createElement("canvas");
    cv.width = dims.W; cv.height = dims.H;
    drawAtTime(cv.getContext("2d")!, dims.W, dims.H, Math.min(pv.t, totalDur()));
    cv.toBlob(function(blob){
      if(!blob) return;
      const first = byId(app.seq[0].id);
      const base = first ? first.name.replace(/\.[^.]+$/, "") : "video";
      const at = Math.round(Math.min(pv.t, totalDur()) * 10) / 10;
      platform.saveBlob(blob, base + "_" + curTarget().suffix + "_frame-" + at + "s.png").then(function(r){
        // a failed save must never look like success (mirrors dlResult / cards.ts)
        if(r === "failed"){
          const b = $("pvFrameBtn"), old = b.textContent;
          b.textContent = "✕"; b.title = "Couldn't save — check disk space";
          setTimeout(function(){ b.textContent = old; b.title = "Save this frame as PNG — e.g. a cover matching the video"; }, 1800);
        }
      });
    }, "image/png");
  };

  $("selAll").onclick = function(){
    if(app.vbusy) return;
    const all = app.items.length > 0 && app.items.every(function(it){ return !!it.selected; });
    // whole select-all / select-none is ONE undo step, not one per photo
    beginOp();
    app.items.forEach(function(it){ setSelected(it, !all); });
    commitOp();
  };

  $("exportBtn").onclick = async function(){
    if(app.vbusy || !app.seq.length) return;
    pvPause();
    setBusy(true);
    invalidateResultForce();
    $("result").style.display = "";
    const okFast = hasVEnc && (!hasAudio() || hasAEnc);
    try{
      if(okFast){
        const blob = await exportFast(setProg);
        finishExport(blob, "mp4", "fast export");
        setFmtLine('fast export: <b>merges image + sound directly</b> — no real-time recording');
      } else {
        const r = await exportRecord(setProg);
        finishExport(r.blob, r.ext, "real-time recording");
      }
    }catch(e){
      // fast path failed → honest fallback to real-time recording
      try{
        const r2 = await exportRecord(setProg);
        finishExport(r2.blob, r2.ext, "real-time recording (fallback)");
        setFmtLine('fast export unavailable — recorded in <b class="bad">real time</b> instead');
      }catch(e2){
        $("resultInfo").textContent = "Export failed in this browser — try a recent Chrome or Edge.";
      }
    }
    setBusy(false);
  };
}
