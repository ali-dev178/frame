import { LOOK_FILTERS } from "../core/config";
import { S, app, byId, curTarget } from "../state";
import type { Item, TitleCard } from "../types";

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
  /** Set when this clip is a title card (no source photo). */
  card?: TitleCard;
}

/** Output size = the largest clip's canvas, rounded up to even (encoder requirement). */
export function outDims(): { W: number; H: number } {
  let W = 0, H = 0;
  const framed = (S.vfit || "framed") === "framed";
  app.seq.forEach(function(c){
    const it = byId(c.id);
    if(!it) return;
    if(framed){
      if(it.canvas && it.canvas.width > W){ W = it.canvas.width; H = it.canvas.height; }
    } else if(it.iw > W){
      W = it.iw; H = it.ih; // Fill/Fit: the video matches the ORIGINAL photos, not the frame ratio
    }
  });
  if(!W && app.seq.some(function(c){ return !!c.card; })){
    // a title card with no framed photo to size against — size from the target
    // ratio, 1080 on the shorter side (a canvas-less photo clip still yields 0×0)
    const r = Math.max(0.01, curTarget().r);
    if(r >= 1){ H = 1080; W = Math.round(1080 * r); } else { W = 1080; H = Math.round(1080 / r); }
  }
  W += W % 2; H += H % 2;
  return { W: W, H: H };
}

export function clipBoundsAt(t: number): { bs: ClipBounds[]; i: number } {
  const bs: ClipBounds[] = [];
  let acc = 0;
  app.seq.forEach(function(c){
    bs.push({ it: byId(c.id), start: acc, dur: c.dur,
              motion: c.motion || S.motion, look: c.look || S.look, trans: c.trans || S.trans, card: c.card });
    acc += c.dur;
  });
  let i = 0;
  while(i < bs.length - 1 && t >= bs[i].start + bs[i].dur) i++;
  return { bs: bs, i: i };
}

export function prog(b: { start: number; dur: number }, t: number): number {
  return Math.min(1, Math.max(0, (t - b.start) / b.dur));
}

/** Motion-aware scale for a given base cover/contain factor and progress. */
function motionScale(base: number, mo: string, p: number): number {
  if(mo === "zoomin") return base * (1 + 0.10*p);
  if(mo === "zoomout") return base * (1.10 - 0.10*p);
  if(mo === "pan") return base * 1.06;
  return base;
}

/**
 * Draw the ORIGINAL photo into the frame, ignoring the Frame-tab styling:
 * "fill" crops the photo to cover the whole frame, "fit" letterboxes it whole.
 */
function drawOriginalFit(c2: CanvasRenderingContext2D, W: number, H: number, it: Item, p: number, mo: string, lk: string, fit: string): void {
  const img = it.img;
  const iw = it.iw, ih = it.ih;
  const base = (fit === "fit") ? Math.min(W/iw, H/ih) : Math.max(W/iw, H/ih);
  const s = motionScale(base, mo, p);
  const dw = iw*s, dh = ih*s;
  const dx = (mo === "pan") ? -(dw - W) * p : (W - dw)/2;
  const dy = (H - dh)/2;
  c2.fillStyle = "#000"; c2.fillRect(0, 0, W, H); // letterbox bg for "fit" (harmless for "fill")
  c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = "high";
  if(lk) c2.filter = lk;
  c2.drawImage(img, dx, dy, dw, dh);
  c2.filter = "none";
}

export function drawClipFrame(c2: CanvasRenderingContext2D, W: number, H: number, it: Item | null, p: number, motion?: string, look?: string): void {
  if(!it){ c2.fillStyle="#000"; c2.fillRect(0,0,W,H); return; }
  const mo = motion || S.motion;             // per-clip override → global default
  const lk = LOOK_FILTERS[look || S.look] || "";
  const fit = S.vfit || "framed";
  if(fit !== "framed" && it.img){ drawOriginalFit(c2, W, H, it, p, mo, lk, fit); return; }
  if(!it.canvas){ c2.fillStyle="#000"; c2.fillRect(0,0,W,H); return; } // framed mode needs the canvas
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

/** Word-wrap `text` to `maxW` using the context's current font. */
function wrapText(c2: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  words.forEach(function(w){
    const test = cur ? cur + " " + w : w;
    if(cur && c2.measureText(test).width > maxW){ lines.push(cur); cur = w; }
    else cur = test;
  });
  if(cur) lines.push(cur);
  return lines;
}

/** A title card: centered, word-wrapped text on a solid background. */
export function drawTitleCard(c2: CanvasRenderingContext2D, W: number, H: number, card: TitleCard): void {
  c2.fillStyle = card.bg || "#101010";
  c2.fillRect(0, 0, W, H);
  const text = (card.text || "").trim();
  if(!text) return;
  const size = Math.max(16, Math.round(H * 0.085));
  c2.save();
  c2.fillStyle = card.fg || "#ffffff";
  c2.textAlign = "center"; c2.textBaseline = "middle";
  c2.font = "700 " + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const lines = wrapText(c2, text, W * 0.84);
  const lh = size * 1.22;
  const startY = H/2 - (lines.length - 1) * lh / 2;
  lines.forEach(function(ln, i){ c2.fillText(ln, W/2, startY + i*lh, W * 0.9); });
  c2.restore();
}

/** Draw one clip: a title card, or a framed photo through drawClipFrame. */
function drawClipVisual(c2: CanvasRenderingContext2D, W: number, H: number, b: ClipBounds, p: number): void {
  if(b.card) drawTitleCard(c2, W, H, b.card);
  else drawClipFrame(c2, W, H, b.it, p, b.motion, b.look);
}

export function drawBlend(c2: CanvasRenderingContext2D, W: number, H: number, A: ClipBounds, B: ClipBounds, q: number, t: number, trans: string): void {
  q = Math.min(1, Math.max(0, q));
  const e = q*q*(3 - 2*q);   // ease in-out
  const pA = prog(A, t), pB = prog(B, t);
  if(trans === "fadeblack"){
    if(e < 0.5){
      drawClipVisual(c2, W, H, A, pA);
      c2.fillStyle = "rgba(0,0,0," + (e*2) + ")"; c2.fillRect(0,0,W,H);
    } else {
      drawClipVisual(c2, W, H, B, pB);
      c2.fillStyle = "rgba(0,0,0," + ((1-e)*2) + ")"; c2.fillRect(0,0,W,H);
    }
    return;
  }
  drawClipVisual(c2, W, H, A, pA);
  if(trans === "slide"){
    c2.save(); c2.translate(W*(1-e), 0);
    drawClipVisual(c2, W, H, B, pB);
    c2.restore(); return;
  }
  if(trans === "slideup"){
    c2.save(); c2.translate(0, H*(1-e));
    drawClipVisual(c2, W, H, B, pB);
    c2.restore(); return;
  }
  if(trans === "wipe"){
    c2.save(); c2.beginPath(); c2.rect(0, 0, W*e, H); c2.clip();
    drawClipVisual(c2, W, H, B, pB);
    c2.restore(); return;
  }
  if(trans === "iris"){
    c2.save(); c2.beginPath();
    c2.arc(W/2, H/2, Math.max(0.01, e * Math.hypot(W/2, H/2)), 0, Math.PI*2);
    c2.clip();
    drawClipVisual(c2, W, H, B, pB);
    c2.restore(); return;
  }
  // crossfade (default)
  c2.globalAlpha = e;
  drawClipVisual(c2, W, H, B, pB);
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
  drawClipVisual(c2, W, H, bs[i], prog(bs[i], t));
  drawCaption(c2, W, H, capOf(i), 1);
}
