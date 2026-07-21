import { LOOK_FILTERS } from "../core/config";
import { S, app, byId } from "../state";
import type { Item } from "../types";

/**
 * THE single frame renderer: preview, fast export, and the recording
 * fallback all draw through drawAtTime — what you see is what exports.
 */

export interface ClipBounds {
  it: Item | null;
  start: number;
  dur: number;
  /** Effective (per-clip override → global) motion for this clip. */
  motion: string;
  /** Effective color look for this clip. */
  look: string;
  /** Effective transition OUT of this clip into the next. */
  trans: string;
}

/** Output size = the largest clip's canvas, rounded up to even (encoder requirement). */
export function outDims(): { W: number; H: number } {
  let W = 0, H = 0;
  app.seq.forEach(function(c){
    const it = byId(c.id);
    if(it && it.canvas && it.canvas.width > W){ W = it.canvas.width; H = it.canvas.height; }
  });
  W += W % 2; H += H % 2;
  return { W: W, H: H };
}

export function clipBoundsAt(t: number): { bs: ClipBounds[]; i: number } {
  const bs: ClipBounds[] = [];
  let acc = 0;
  app.seq.forEach(function(c){
    bs.push({ it: byId(c.id), start: acc, dur: c.dur,
              motion: c.motion || S.motion, look: c.look || S.look, trans: c.trans || S.trans });
    acc += c.dur;
  });
  let i = 0;
  while(i < bs.length - 1 && t >= bs[i].start + bs[i].dur) i++;
  return { bs: bs, i: i };
}

export function prog(b: { start: number; dur: number }, t: number): number {
  return Math.min(1, Math.max(0, (t - b.start) / b.dur));
}

export function drawClipFrame(c2: CanvasRenderingContext2D, W: number, H: number, it: Item | null, p: number, motion?: string, look?: string): void {
  if(!it || !it.canvas){ c2.fillStyle="#000"; c2.fillRect(0,0,W,H); return; }
  const mo = motion || S.motion;             // per-clip override → global default
  const lk = LOOK_FILTERS[look || S.look] || "";
  const src = it.canvas;
  const cover = Math.max(W / src.width, H / src.height);
  if(mo === "static" && W >= src.width && (W - src.width) <= 1 && H >= src.height && (H - src.height) <= 1){
    // exact-size clip: 1:1 geometry, zero resampling; duplicate (never remove)
    // the odd edge. A color look changes ONLY color here — never geometry.
    c2.imageSmoothingEnabled = false;
    if(lk) c2.filter = lk;
    c2.drawImage(src, 0, 0);
    if(W > src.width)  c2.drawImage(src, src.width-1, 0, 1, src.height, src.width, 0, 1, src.height);
    if(H > src.height) c2.drawImage(src, 0, src.height-1, src.width, 1, 0, src.height, src.width, 1);
    if(W > src.width && H > src.height) c2.drawImage(src, src.width-1, src.height-1, 1, 1, src.width, src.height, 1, 1);
    c2.filter = "none";
    c2.imageSmoothingEnabled = true;
    return;
  }
  let s: number;
  if(mo === "zoomin") s = cover * (1 + 0.10*p);
  else if(mo === "zoomout") s = cover * (1.10 - 0.10*p);
  else if(mo === "pan") s = cover * 1.06;
  else s = cover;
  const dw = src.width*s, dh = src.height*s;
  let dx: number, dy: number;
  if(mo === "pan"){ dx = -(dw - W) * p; dy = (H - dh)/2; }
  else { dx = (W - dw)/2; dy = (H - dh)/2; }
  c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = "high";
  if(lk) c2.filter = lk;
  c2.drawImage(src, dx, dy, dw, dh);
  c2.filter = "none";
}

export function drawBlend(c2: CanvasRenderingContext2D, W: number, H: number, A: ClipBounds, B: ClipBounds, q: number, t: number, trans: string): void {
  q = Math.min(1, Math.max(0, q));
  const e = q*q*(3 - 2*q);   // ease in-out
  const pA = prog(A, t), pB = prog(B, t);
  if(trans === "fadeblack"){
    if(e < 0.5){
      drawClipFrame(c2, W, H, A.it, pA, A.motion, A.look);
      c2.fillStyle = "rgba(0,0,0," + (e*2) + ")"; c2.fillRect(0,0,W,H);
    } else {
      drawClipFrame(c2, W, H, B.it, pB, B.motion, B.look);
      c2.fillStyle = "rgba(0,0,0," + ((1-e)*2) + ")"; c2.fillRect(0,0,W,H);
    }
    return;
  }
  drawClipFrame(c2, W, H, A.it, pA, A.motion, A.look);
  if(trans === "slide"){
    c2.save(); c2.translate(W*(1-e), 0);
    drawClipFrame(c2, W, H, B.it, pB, B.motion, B.look);
    c2.restore(); return;
  }
  if(trans === "slideup"){
    c2.save(); c2.translate(0, H*(1-e));
    drawClipFrame(c2, W, H, B.it, pB, B.motion, B.look);
    c2.restore(); return;
  }
  if(trans === "wipe"){
    c2.save(); c2.beginPath(); c2.rect(0, 0, W*e, H); c2.clip();
    drawClipFrame(c2, W, H, B.it, pB, B.motion, B.look);
    c2.restore(); return;
  }
  if(trans === "iris"){
    c2.save(); c2.beginPath();
    c2.arc(W/2, H/2, Math.max(0.01, e * Math.hypot(W/2, H/2)), 0, Math.PI*2);
    c2.clip();
    drawClipFrame(c2, W, H, B.it, pB, B.motion, B.look);
    c2.restore(); return;
  }
  // crossfade (default)
  c2.globalAlpha = e;
  drawClipFrame(c2, W, H, B.it, pB, B.motion, B.look);
  c2.globalAlpha = 1;
}

/** Per-clip caption, drawn OVER the frame (and after any color look). */
export function drawCaption(c2: CanvasRenderingContext2D, W: number, H: number, text: string | undefined, alpha: number): void {
  if(!text || alpha <= 0.01) return;
  c2.save();
  c2.globalAlpha = Math.min(1, alpha);
  const size = Math.max(12, Math.round(H * 0.045));
  c2.font = "600 " + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  c2.textAlign = "center"; c2.textBaseline = "alphabetic";
  c2.shadowColor = "rgba(0,0,0,0.75)";
  c2.shadowBlur = Math.round(size * 0.35);
  c2.shadowOffsetY = Math.max(1, Math.round(size * 0.08));
  c2.fillStyle = "#fff";
  c2.fillText(text, W/2, H - Math.round(H * 0.07), W * 0.92);
  c2.restore();
}

export function drawAtTime(c2: CanvasRenderingContext2D, W: number, H: number, t: number): void {
  if(!app.seq.length){ c2.fillStyle="#000"; c2.fillRect(0,0,W,H); return; }
  const cb = clipBoundsAt(t), bs = cb.bs, i = cb.i, n = bs.length;
  const ease = function(q: number){ q = Math.min(1, Math.max(0, q)); return q*q*(3 - 2*q); };
  const capOf = function(idx: number){ return app.seq[idx] ? app.seq[idx].text : undefined; };
  // fadeblack dips captions WITH the frame; everything else crossfades them
  const capAlphas = function(e: number, tr: string): [number, number] {
    if(tr === "fadeblack") return [1 - Math.min(1, e*2), Math.max(0, e*2 - 1)];
    return [1 - e, e];
  };
  // transitions are decided PER BOUNDARY: each clip's effective `trans` governs
  // the cut OUT of it into the next. A clip set to "none" hard-cuts regardless
  // of neighbours, so mixed per-clip transitions compose correctly.
  if(n > 1){
    if(i < n - 1 && bs[i].trans !== "none"){
      const tr = bs[i].trans;
      const d = Math.min(S.transDur, bs[i].dur, bs[i+1].dur);
      const cutT = bs[i].start + bs[i].dur;
      if(d > 0.05 && t >= cutT - d/2){
        const q = (t - (cutT - d/2)) / d;
        drawBlend(c2, W, H, bs[i], bs[i+1], q, t, tr);
        const a = capAlphas(ease(q), tr);
        drawCaption(c2, W, H, capOf(i), a[0]);
        drawCaption(c2, W, H, capOf(i+1), a[1]);
        return;
      }
    }
    if(i > 0 && bs[i-1].trans !== "none"){
      const tr2 = bs[i-1].trans;
      const d2 = Math.min(S.transDur, bs[i-1].dur, bs[i].dur);
      const cutT2 = bs[i].start;
      if(d2 > 0.05 && t < cutT2 + d2/2){
        const q2 = (t - (cutT2 - d2/2)) / d2;
        drawBlend(c2, W, H, bs[i-1], bs[i], q2, t, tr2);
        const a2 = capAlphas(ease(q2), tr2);
        drawCaption(c2, W, H, capOf(i-1), a2[0]);
        drawCaption(c2, W, H, capOf(i), a2[1]);
        return;
      }
    }
  }
  drawClipFrame(c2, W, H, bs[i].it, prog(bs[i], t), bs[i].motion, bs[i].look);
  drawCaption(c2, W, H, capOf(i), 1);
}
