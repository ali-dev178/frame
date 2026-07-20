/** getElementById, typed. The app's markup is static, so lookups can't miss. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export interface SegOption {
  key: string;
  label: string;
}

/** Builds a segmented control from a config array. */
export function buildSeg(host: HTMLElement, opts: SegOption[], current: string, onPick: (key: string) => void): void {
  host.innerHTML = "";
  opts.forEach(function(o){
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = o.label;
    b.setAttribute("aria-pressed", String(o.key === current));
    b.onclick = function(){ onPick(o.key); };
    host.appendChild(b);
  });
}

export function refreshSeg(host: HTMLElement, keys: string[], current: string): void {
  Array.from(host.children).forEach(function(b, i){
    b.setAttribute("aria-pressed", String(keys[i] === current));
  });
}
