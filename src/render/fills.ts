import { rgb } from "../core/colors";
import { S } from "../state";
import type { Geometry, Item } from "../types";

/** Soft darkening gradients on the outer edges of the frame. */
export function shade(ctx: CanvasRenderingContext2D, cw: number, ch: number, lp: number, rp: number, tp: number, bp: number, a: number): void {
  let g: CanvasGradient;
  if(lp>0){ g=ctx.createLinearGradient(0,0,lp,0); g.addColorStop(0,"rgba(0,0,0,"+a+")"); g.addColorStop(1,"rgba(0,0,0,0)"); ctx.fillStyle=g; ctx.fillRect(0,0,lp,ch); }
  if(rp>0){ const x0=cw-rp; g=ctx.createLinearGradient(x0,0,cw,0); g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,"rgba(0,0,0,"+a+")"); ctx.fillStyle=g; ctx.fillRect(x0,0,rp,ch); }
  if(tp>0){ g=ctx.createLinearGradient(0,0,0,tp); g.addColorStop(0,"rgba(0,0,0,"+a+")"); g.addColorStop(1,"rgba(0,0,0,0)"); ctx.fillStyle=g; ctx.fillRect(0,0,cw,tp); }
  if(bp>0){ const y0=ch-bp; g=ctx.createLinearGradient(0,y0,0,ch); g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,"rgba(0,0,0,"+a+")"); ctx.fillStyle=g; ctx.fillRect(0,y0,cw,bp); }
}

/** Paints ONLY the margin regions described by G, dispatching on the current fill mode. */
export function fillMargins(ctx: CanvasRenderingContext2D, it: Item, G: Geometry): void {
  switch(S.mode){
    case "blur":     return fillBlur(ctx, it, G, false);
    case "frosted":  return fillBlur(ctx, it, G, true);
    case "mirror":   return fillMirror(ctx, it, G);
    case "stretch":  return fillStretch(ctx, it, G);
    case "gradient": return it.grad ? fillGradient(ctx, it, G) : fillMatched(ctx, it, G);
    case "duotone":  return it.duo ? fillDuotone(ctx, it, G) : fillSolid(ctx, it, G);
    case "solid":    return fillSolid(ctx, it, G);
    case "edges":
    default:         return it.edges ? fillMatched(ctx, it, G) : fillSolid(ctx, it, G);
  }
}

function fillBlur(ctx: CanvasRenderingContext2D, it: Item, G: Geometry, frosted: boolean): void {
  const cw=G.cw, ch=G.ch, iw=G.iw, ih=G.ih;
  const scale = Math.max(cw/iw, ch/ih);
  const bw = iw*scale, bh = ih*scale;
  const px = Math.max(1, Math.round((S.blur/100) * Math.min(cw,ch) * 0.09));
  ctx.filter = frosted ? ("blur(" + px + "px) saturate(0.62) brightness(1.12)") : ("blur(" + px + "px)");
  ctx.drawImage(it.img, (cw-bw)/2, (ch-bh)/2, bw, bh);
  ctx.filter = "none";
  if(frosted){ ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(0, 0, cw, ch); }
}

function fillMatched(ctx: CanvasRenderingContext2D, it: Item, G: Geometry): void {
  const cw=G.cw, ch=G.ch, lp=G.leftPad, rp=G.rightPad, tp=G.topPad, bp=G.botPad;
  const edges = it.edges!;
  let x: number, y: number;
  if(G.orient === "sides"){
    for(y=0;y<ch;y++){
      const cl = edges.left[y] || edges.left[edges.left.length-1];
      ctx.fillStyle = rgb(cl); ctx.fillRect(0, y, lp, 1);
      const cr = edges.right[y] || edges.right[edges.right.length-1];
      ctx.fillStyle = rgb(cr); ctx.fillRect(cw-rp, y, rp, 1);
    }
  } else {
    for(x=0;x<cw;x++){
      const ct = edges.top[x] || edges.top[edges.top.length-1];
      ctx.fillStyle = rgb(ct); ctx.fillRect(x, 0, 1, tp);
      const cb = edges.bottom[x] || edges.bottom[edges.bottom.length-1];
      ctx.fillStyle = rgb(cb); ctx.fillRect(x, ch-bp, 1, bp);
    }
  }
}

function fillGradient(ctx: CanvasRenderingContext2D, it: Item, G: Geometry): void {
  const cw=G.cw, ch=G.ch, lp=G.leftPad, rp=G.rightPad, tp=G.topPad, bp=G.botPad;
  const grad = it.grad!;
  let g: CanvasGradient;
  if(G.orient === "sides"){
    g = ctx.createLinearGradient(0,0,0,ch); g.addColorStop(0,rgb(grad.leftTop)); g.addColorStop(1,rgb(grad.leftBot));
    ctx.fillStyle=g; ctx.fillRect(0,0,lp,ch);
    g = ctx.createLinearGradient(0,0,0,ch); g.addColorStop(0,rgb(grad.rightTop)); g.addColorStop(1,rgb(grad.rightBot));
    ctx.fillStyle=g; ctx.fillRect(cw-rp,0,rp,ch);
  } else {
    g = ctx.createLinearGradient(0,0,cw,0); g.addColorStop(0,rgb(grad.topStart)); g.addColorStop(1,rgb(grad.topEnd));
    ctx.fillStyle=g; ctx.fillRect(0,0,cw,tp);
    g = ctx.createLinearGradient(0,0,cw,0); g.addColorStop(0,rgb(grad.botStart)); g.addColorStop(1,rgb(grad.botEnd));
    ctx.fillStyle=g; ctx.fillRect(0,ch-bp,cw,bp);
  }
}

function fillSolid(ctx: CanvasRenderingContext2D, it: Item, G: Geometry): void {
  const color = (S.solidMode === "auto" && it.avg) ? rgb(it.avg) : S.solidColor;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, G.cw, G.ch);
}

function fillMirror(ctx: CanvasRenderingContext2D, it: Item, G: Geometry): void {
  // base so oversized margins are always covered, then reflect the photo over it
  if(it.edges) fillMatched(ctx, it, G); else fillSolid(ctx, it, G);
  const cw=G.cw, ch=G.ch, iw=G.iw, ih=G.ih, lp=G.leftPad, rp=G.rightPad, tp=G.topPad, bp=G.botPad;
  ctx.imageSmoothingEnabled = true;
  if(G.orient === "sides"){
    if(lp>0){ // reflect: photo column 0 sits at the seam (x=lp), extending left
      ctx.save(); ctx.beginPath(); ctx.rect(0,0,lp,ch); ctx.clip();
      ctx.translate(lp,0); ctx.scale(-1,1); ctx.drawImage(it.img,0,0); ctx.restore();
    }
    if(rp>0){ const sR=cw-rp; // photo column iw sits at the seam (x=sR), extending right
      ctx.save(); ctx.beginPath(); ctx.rect(sR,0,rp,ch); ctx.clip();
      ctx.translate(sR+iw,0); ctx.scale(-1,1); ctx.drawImage(it.img,0,0); ctx.restore();
    }
  } else {
    if(tp>0){ // photo row 0 sits at the seam (y=tp), extending up
      ctx.save(); ctx.beginPath(); ctx.rect(0,0,cw,tp); ctx.clip();
      ctx.translate(0,tp); ctx.scale(1,-1); ctx.drawImage(it.img,0,0); ctx.restore();
    }
    if(bp>0){ const sB=ch-bp; // photo row ih sits at the seam (y=sB), extending down
      ctx.save(); ctx.beginPath(); ctx.rect(0,sB,cw,bp); ctx.clip();
      ctx.translate(0,sB+ih); ctx.scale(1,-1); ctx.drawImage(it.img,0,0); ctx.restore();
    }
  }
  ctx.imageSmoothingEnabled = false;
}

function fillStretch(ctx: CanvasRenderingContext2D, it: Item, G: Geometry): void {
  const cw=G.cw, ch=G.ch, iw=G.iw, ih=G.ih, lp=G.leftPad, rp=G.rightPad, tp=G.topPad, bp=G.botPad;
  ctx.imageSmoothingEnabled = true;
  if(G.orient === "sides"){
    if(lp>0) ctx.drawImage(it.img, 0, 0, 1, ih, 0, 0, lp, ch);
    if(rp>0) ctx.drawImage(it.img, iw-1, 0, 1, ih, cw-rp, 0, rp, ch);
  } else {
    if(tp>0) ctx.drawImage(it.img, 0, 0, iw, 1, 0, 0, cw, tp);
    if(bp>0) ctx.drawImage(it.img, 0, ih-1, iw, 1, 0, ch-bp, cw, bp);
  }
  ctx.imageSmoothingEnabled = false;
}

function fillDuotone(ctx: CanvasRenderingContext2D, it: Item, G: Geometry): void {
  const cw=G.cw, ch=G.ch, lp=G.leftPad, rp=G.rightPad, tp=G.topPad, bp=G.botPad;
  const duo = it.duo!;
  const g = ctx.createLinearGradient(0, 0, cw, ch);
  g.addColorStop(0, rgb(duo.dark)); g.addColorStop(1, rgb(duo.light));
  ctx.fillStyle = g;
  if(G.orient === "sides"){ ctx.fillRect(0,0,lp,ch); ctx.fillRect(cw-rp,0,rp,ch); }
  else { ctx.fillRect(0,0,cw,tp); ctx.fillRect(0,ch-bp,cw,bp); }
}
