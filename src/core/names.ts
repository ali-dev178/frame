import { curTarget } from "../state";
import type { Item } from "../types";

/** Download name for a framed PNG. */
export function outName(it: Item): string {
  return it.name.replace(/\.[^.]+$/, "") + "_" + curTarget().suffix + ".png";
}

/** Download name for a passthrough original — keeps the source extension. */
export function passName(it: Item): string {
  let ext = (it.name.match(/\.([A-Za-z0-9]+)$/) || [])[1];
  if(!ext && it.file && it.file.type){ ext = it.file.type.split("/")[1]; if(ext === "jpeg") ext = "jpg"; }
  return it.name.replace(/\.[^.]+$/, "") + "_" + curTarget().suffix + "." + (ext || "png");
}

export function fmtTime(s: number): string {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s/60), r = s%60;
  return m + ":" + (r<10?"0":"") + r;
}

export function shortName(n: string): string {
  n = n.replace(/\.[^.]+$/, "");
  return n.length > 24 ? n.slice(0,23) + "…" : n;
}

export function round10(x: number): number {
  return Math.round(x*10)/10;
}
