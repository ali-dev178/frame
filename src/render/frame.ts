import { layout } from "../core/layout";
import { S, curTarget } from "../state";
import { fillMargins, shade } from "./fills";
import type { BuiltFrame, Geometry, Item } from "../types";

/**
 * Builds the framed canvas for one photo. THE invariant lives here:
 * the original is drawn once, at its natural size, with smoothing off —
 * the picture region must stay bit-for-bit identical to the upload.
 */
export function buildCanvas(it: Item): BuiltFrame {
  const iw = it.iw, ih = it.ih;
  const L = layout(iw, ih, curTarget().r);
  const cw = L.cw, ch = L.ch, dx = L.dx, dy = L.dy, orient = L.orient;
  const leftPad = dx, rightPad = cw - iw - dx, topPad = dy, botPad = ch - ih - dy;

  const cv = document.createElement("canvas");
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext("2d")!;
  const geom: Geometry = { cw:cw, ch:ch, dx:dx, dy:dy, orient:orient,
               leftPad:leftPad, rightPad:rightPad, topPad:topPad, botPad:botPad, iw:iw, ih:ih };
  if(orient !== "none") fillMargins(ctx, it, geom);

  const alpha = (S.dark/100) * 0.55;
  if(alpha > 0 && orient !== "none") shade(ctx, cw, ch, leftPad, rightPad, topPad, botPad, alpha);

  // ---- the ORIGINAL, drawn 1:1, pristine, on top ----
  if((S.mode === "blur" || S.mode === "frosted" || S.mode === "mirror") && orient !== "none"){
    ctx.shadowColor = "rgba(0,0,0,0.34)";
    ctx.shadowBlur = Math.round(Math.min(cw,ch) * 0.02);
  }
  ctx.filter = "none";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(it.img, dx, dy, iw, ih); // dest size == natural size -> no resampling
  ctx.shadowBlur = 0; ctx.shadowColor = "transparent";

  return {cv:cv, cw:cw, ch:ch, dx:dx, dy:dy, iw:iw, ih:ih};
}
