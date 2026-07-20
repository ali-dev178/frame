import type { Item, RGB } from "../types";

export function rgb(c: RGB): string {
  return "rgb(" + (c[0]|0) + "," + (c[1]|0) + "," + (c[2]|0) + ")";
}

/**
 * One-time per-photo color analysis: edge-color strips (matched-edges fill),
 * overall average (auto solid fill), two dominant tones (duotone), and
 * corner-averaged gradient endpoints. Throws on oversized/tainted canvases —
 * callers catch and fall back.
 */
export function computeColors(it: Item): void {
  const iw = it.iw, ih = it.ih;
  const off = document.createElement("canvas");
  off.width = iw; off.height = ih;
  const octx = off.getContext("2d", {willReadFrequently:true})!;
  octx.drawImage(it.img, 0, 0);
  const data = octx.getImageData(0,0,iw,ih).data;
  const k = Math.max(1, Math.round(Math.min(iw,ih) * 0.012));
  let i: number, idx: number, x: number, y: number, r: number, g: number, b: number;

  const left: RGB[] = new Array(ih), right: RGB[] = new Array(ih);
  for(y=0;y<ih;y++){
    r=0;g=0;b=0;
    for(i=0;i<k;i++){ idx=(y*iw + i)*4; r+=data[idx]; g+=data[idx+1]; b+=data[idx+2]; }
    left[y]=[r/k,g/k,b/k];
    r=0;g=0;b=0;
    for(i=0;i<k;i++){ idx=(y*iw + (iw-1-i))*4; r+=data[idx]; g+=data[idx+1]; b+=data[idx+2]; }
    right[y]=[r/k,g/k,b/k];
  }
  const top: RGB[] = new Array(iw), bottom: RGB[] = new Array(iw);
  for(x=0;x<iw;x++){
    r=0;g=0;b=0;
    for(i=0;i<k;i++){ idx=(i*iw + x)*4; r+=data[idx]; g+=data[idx+1]; b+=data[idx+2]; }
    top[x]=[r/k,g/k,b/k];
    r=0;g=0;b=0;
    for(i=0;i<k;i++){ idx=((ih-1-i)*iw + x)*4; r+=data[idx]; g+=data[idx+1]; b+=data[idx+2]; }
    bottom[x]=[r/k,g/k,b/k];
  }
  it.edges = {left:left,right:right,top:top,bottom:bottom};

  // overall average color (for the Auto solid fill) via a 1x1 downscale
  const a1 = document.createElement("canvas"); a1.width = 1; a1.height = 1;
  const a1ctx = a1.getContext("2d")!; a1ctx.drawImage(it.img, 0, 0, 1, 1);
  const ap = a1ctx.getImageData(0,0,1,1).data;
  it.avg = [ap[0], ap[1], ap[2]];

  // two dominant tones (for the Duotone fill) from a small downsample, split by luminance
  const ds = document.createElement("canvas"); ds.width = 32; ds.height = 32;
  const dctx = ds.getContext("2d", {willReadFrequently:true})!;
  dctx.drawImage(it.img, 0, 0, 32, 32);
  const dd = dctx.getImageData(0,0,32,32).data, pts: number[][] = [];
  let p2: number;
  for(p2=0;p2<dd.length;p2+=4){ const rr=dd[p2],gg=dd[p2+1],bb=dd[p2+2]; pts.push([rr,gg,bb, 0.299*rr+0.587*gg+0.114*bb]); }
  pts.sort(function(m,n){ return m[3]-n[3]; });
  const third = Math.max(1, Math.floor(pts.length/3));
  function avgOf(a: number, b: number): RGB {
    let r=0,g=0,bl=0,i: number;
    for(i=a;i<b;i++){ r+=pts[i][0]; g+=pts[i][1]; bl+=pts[i][2]; }
    const n=(b-a)||1; return [r/n,g/n,bl/n];
  }
  it.duo = { dark: avgOf(0, third), light: avgOf(pts.length-third, pts.length) };

  function avgRange(arr: RGB[], a: number, b: number): RGB {
    let rr=0,gg=0,bb=0,n=0;
    for(let j=a;j<=b;j++){ if(j<0||j>=arr.length) continue; rr+=arr[j][0]; gg+=arr[j][1]; bb+=arr[j][2]; n++; }
    n=n||1; return [rr/n,gg/n,bb/n];
  }
  it.grad = {
    leftTop: avgRange(left,0,Math.floor(ih*0.18)),   leftBot: avgRange(left,Math.floor(ih*0.82),ih-1),
    rightTop:avgRange(right,0,Math.floor(ih*0.18)),  rightBot:avgRange(right,Math.floor(ih*0.82),ih-1),
    topStart:avgRange(top,0,Math.floor(iw*0.18)),    topEnd:  avgRange(top,Math.floor(iw*0.82),iw-1),
    botStart:avgRange(bottom,0,Math.floor(iw*0.18)), botEnd:  avgRange(bottom,Math.floor(iw*0.82),iw-1)
  };
}
