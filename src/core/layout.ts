import type { LayoutResult } from "../types";

/**
 * How to reach the target ratio R by GROWING the canvas around the photo —
 * the photo itself is never scaled. Returns the canvas size, the photo's
 * offset inside it, and which sides get margins.
 */
export function layout(iw: number, ih: number, R: number): LayoutResult {
  const a = iw/ih;
  let cw: number, ch: number, orient: LayoutResult["orient"];
  if(a < R - 1e-9){ ch = ih; cw = Math.round(ih*R); orient="sides"; }
  else if(a > R + 1e-9){ cw = iw; ch = Math.round(iw/R); orient="vert"; }
  else { cw = iw; ch = ih; orient="none"; }
  if(cw === iw && ch === ih) orient = "none";   // frame rounds to the photo's own size — already fits
  return {cw:cw, ch:ch, dx:Math.round((cw-iw)/2), dy:Math.round((ch-ih)/2), orient:orient};
}
