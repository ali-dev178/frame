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
  app.seq.forEach(function(c){ bs.push({ it: byId(c.id), start: acc, dur: c.dur }); acc += c.dur; });
  let i = 0;
  while(i < bs.length - 1 && t >= bs[i].start + bs[i].dur) i++;
  return { bs: bs, i: i };
}

export function prog(b: ClipBounds, t: number): number {
  return Math.min(1, Math.max(0, (t - b.start) / b.dur));
}

export function drawClipFrame(c2: CanvasRenderingContext2D, W: number, H: number, it: Item | null, p: number): void {
  if(!it || !it.canvas){ c2.fillStyle="#000"; c2.fillRect(0,0,W,H); return; }
  const src = it.canvas;
  const cover = Math.max(W / src.width, H / src.height);
  if(S.motion === "static" && W >= src.width && (W - src.width) <= 1 && H >= src.height && (H - src.height) <= 1){
    // exact-size clip: 1:1 copy, zero resampling; duplicate (never remove) the odd edge
    c2.imageSmoothingEnabled = false;
    c2.drawImage(src, 0, 0);
    if(W > src.width)  c2.drawImage(src, src.width-1, 0, 1, src.height, src.width, 0, 1, src.height);
    if(H > src.height) c2.drawImage(src, 0, src.height-1, src.width, 1, 0, src.height, src.width, 1);
    if(W > src.width && H > src.height) c2.drawImage(src, src.width-1, src.height-1, 1, 1, src.width, src.height, 1, 1);
    c2.imageSmoothingEnabled = true;
    return;
  }
  let s: number;
  if(S.motion === "zoomin") s = cover * (1 + 0.10*p);
  else if(S.motion === "zoomout") s = cover * (1.10 - 0.10*p);
  else if(S.motion === "pan") s = cover * 1.06;
  else s = cover;
  const dw = src.width*s, dh = src.height*s;
  let dx: number, dy: number;
  if(S.motion === "pan"){ dx = -(dw - W) * p; dy = (H - dh)/2; }
  else { dx = (W - dw)/2; dy = (H - dh)/2; }
  c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = "high";
  c2.drawImage(src, dx, dy, dw, dh);
}

export function drawBlend(c2: CanvasRenderingContext2D, W: number, H: number, A: ClipBounds, B: ClipBounds, q: number, t: number): void {
  q = Math.min(1, Math.max(0, q));
  const e = q*q*(3 - 2*q);   // ease in-out
  const pA = prog(A, t), pB = prog(B, t);
  if(S.trans === "fadeblack"){
    if(e < 0.5){
      drawClipFrame(c2, W, H, A.it, pA);
      c2.fillStyle = "rgba(0,0,0," + (e*2) + ")"; c2.fillRect(0,0,W,H);
    } else {
      drawClipFrame(c2, W, H, B.it, pB);
      c2.fillStyle = "rgba(0,0,0," + ((1-e)*2) + ")"; c2.fillRect(0,0,W,H);
    }
    return;
  }
  drawClipFrame(c2, W, H, A.it, pA);
  if(S.trans === "slide"){
    c2.save(); c2.translate(W*(1-e), 0);
    drawClipFrame(c2, W, H, B.it, pB);
    c2.restore(); return;
  }
  if(S.trans === "wipe"){
    c2.save(); c2.beginPath(); c2.rect(0, 0, W*e, H); c2.clip();
    drawClipFrame(c2, W, H, B.it, pB);
    c2.restore(); return;
  }
  // crossfade (default)
  c2.globalAlpha = e;
  drawClipFrame(c2, W, H, B.it, pB);
  c2.globalAlpha = 1;
}

export function drawAtTime(c2: CanvasRenderingContext2D, W: number, H: number, t: number): void {
  if(!app.seq.length){ c2.fillStyle="#000"; c2.fillRect(0,0,W,H); return; }
  const cb = clipBoundsAt(t), bs = cb.bs, i = cb.i, n = bs.length;
  if(S.trans !== "none" && n > 1){
    if(i < n - 1){
      const d = Math.min(S.transDur, bs[i].dur, bs[i+1].dur);
      const cutT = bs[i].start + bs[i].dur;
      if(d > 0.05 && t >= cutT - d/2){
        return drawBlend(c2, W, H, bs[i], bs[i+1], (t - (cutT - d/2)) / d, t);
      }
    }
    if(i > 0){
      const d2 = Math.min(S.transDur, bs[i-1].dur, bs[i].dur);
      const cutT2 = bs[i].start;
      if(d2 > 0.05 && t < cutT2 + d2/2){
        return drawBlend(c2, W, H, bs[i-1], bs[i], (t - (cutT2 - d2/2)) / d2, t);
      }
    }
  }
  drawClipFrame(c2, W, H, bs[i].it, prog(bs[i], t));
}
