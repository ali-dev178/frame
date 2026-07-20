import { computeColors } from "../core/colors";
import { outName, passName } from "../core/names";
import { platform } from "../platform";
import type { SaveJob, SaveOutcome } from "../platform";
import { buildCanvas } from "../render/frame";
import { S, app, curTarget } from "../state";
import type { Item } from "../types";
import { $ } from "./dom";
import { invalidateResult, setSelected, studioOnFrameChange, updateSelUI } from "./studio";
import { renderTimeline } from "./timeline";

const grid = $("grid"), empty = $("empty"), bar = $("bar"), countEl = $("count");

let rerenderTimer: number | undefined;

/** Photo grid + dropzone: loading, rendering, verifying, downloading. */
export function initCards(): void {
  const drop = $("drop"), file = $<HTMLInputElement>("file");
  drop.addEventListener("click", function(){ file.click(); });
  drop.addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); file.click(); }});
  file.addEventListener("change", function(){ if(file.files) addFiles(file.files); file.value=""; });

  ["dragenter","dragover"].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add("hot"); }); });
  ["dragleave","drop"].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove("hot"); }); });
  drop.addEventListener("drop", function(e){ const de = e as DragEvent; if(de.dataTransfer && de.dataTransfer.files) addFiles(de.dataTransfer.files); });
  window.addEventListener("dragover", function(e){ e.preventDefault(); });
  window.addEventListener("drop", function(e){
    e.preventDefault();
    const target = e.target as Element;
    if(target.closest && target.closest("#drop")) return;
    if(e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  $("clear").onclick = function(){ if(app.vbusy) return; app.items = []; app.seq = []; grid.innerHTML=""; invalidateResult(); renderTimeline(); syncBars(); };
  $("dlAll").onclick = downloadAll;
}

function addFiles(list: FileList): void {
  Array.from(list).filter(function(f){ return /^image\//.test(f.type); }).forEach(loadOne);
}

function loadOne(f: File): void {
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = function(){
    const id = ++app.idc;
    const it: Item = { id:id, name:f.name || ("image-"+id), file:f, img:img, iw:img.naturalWidth, ih:img.naturalHeight, edges:null, grad:null, canvas:null, el:null };
    try { computeColors(it); } catch(e){ it.edges=null; it.grad=null; }
    app.items.push(it);
    createCard(it);
    renderItem(it);
    syncBars();
    URL.revokeObjectURL(url);
  };
  img.onerror = function(){ URL.revokeObjectURL(url); };
  img.src = url;
}

function createCard(it: Item): void {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML =
    '<div class="stage"><div class="frame"><div class="bounds"></div></div>' +
      '<label class="pick" title="Add to video"><input type="checkbox"></label></div>' +
    '<div class="meta"><div class="name"></div><div class="dims"></div></div>' +
    '<div class="foot"><button class="btn primary dl">Download PNG</button>' +
    '<button class="btn vfy" title="Check the picture region is bit-identical to your upload">Verify</button>' +
    '<button class="btn rm" title="Remove">Remove</button></div>';
  card.querySelector(".name")!.textContent = it.name;
  (card.querySelector(".vfy") as HTMLButtonElement).onclick = function(){ verifyItem(it); };
  const pick = card.querySelector(".pick input") as HTMLInputElement;
  pick.addEventListener("change", function(){
    setSelected(it, pick.checked);
  });
  const dlBtn = card.querySelector(".dl") as HTMLButtonElement;
  dlBtn.onclick = function(){
    downloadItem(it).then(function(r){
      if(r === "failed"){
        const old = dlBtn.textContent;
        dlBtn.textContent = "Save failed";
        setTimeout(function(){ dlBtn.textContent = old; }, 1800);
      }
    });
  };
  (card.querySelector(".rm") as HTMLButtonElement).onclick = function(){
    if(app.vbusy) return;
    setSelected(it, false);
    app.items = app.items.filter(function(x){ return x.id !== it.id; });
    card.remove(); syncBars();
  };
  grid.appendChild(card);
  it.el = card;
}

export function renderItem(it: Item): void {
  if(!it.el) return;
  const frame = it.el.querySelector(".frame")!;
  const boundsEl = it.el.querySelector(".bounds") as HTMLElement;
  try{
    const out = buildCanvas(it);
    it.canvas = out.cv;
    const old = frame.querySelector("canvas");
    if(old) old.remove();
    frame.insertBefore(out.cv, boundsEl);
    boundsEl.style.left   = (out.dx / out.cw * 100) + "%";
    boundsEl.style.top    = (out.dy / out.ch * 100) + "%";
    boundsEl.style.width  = (out.iw / out.cw * 100) + "%";
    boundsEl.style.height = (out.ih / out.ch * 100) + "%";
    boundsEl.classList.toggle("on", S.bounds);
    it.passthrough = (out.cw === it.iw && out.ch === it.ih);
    it.geo = { dx: out.dx, dy: out.dy };
    const vb = it.el.querySelector(".vfy") as HTMLButtonElement | null;
    if(vb){ vb.disabled = false; vb.textContent = "Verify"; vb.classList.remove("ok"); }
    // small thumbnail for the video timeline — shows the photo itself, not the framed frame
    try{
      const th = 110, tw = Math.max(1, Math.round(it.iw * th / it.ih));
      const tc = document.createElement("canvas"); tc.width = tw; tc.height = th;
      const tctx = tc.getContext("2d")!; tctx.imageSmoothingQuality = "high";
      tctx.drawImage(it.img, 0, 0, tw, th);
      it.thumbUrl = tc.toDataURL();
    }catch(te){ it.thumbUrl = null; }
    studioOnFrameChange();
    const dlBtn = it.el.querySelector(".dl") as HTMLButtonElement | null;
    if(it.passthrough){
      it.el.querySelector(".dims")!.innerHTML =
        out.cw + " × " + out.ch + " px · already " + curTarget().label.toLowerCase() +
        ' <span class="badge">· <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>original file, untouched</span>';
      if(dlBtn) dlBtn.textContent = "Download original";
    } else {
      it.el.querySelector(".dims")!.innerHTML =
        out.cw + " × " + out.ch + " px · original " + it.iw + " × " + it.ih +
        ' <span class="badge">· <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>lossless PNG</span>';
      if(dlBtn) dlBtn.textContent = "Download PNG";
    }
  }catch(e){
    it.canvas = null;
    const st = it.el.querySelector(".stage")!;
    st.innerHTML = '<div class="err">Could not render this image — it may be too large for the browser canvas.</div>';
    it.el.querySelector(".dims")!.textContent = "";
  }
}

export function renderAll(): void {
  if(app.vbusy){ scheduleRender(400); return; }
  app.items.forEach(renderItem);
}
export function scheduleRender(delay?: number): void {
  clearTimeout(rerenderTimer);
  rerenderTimer = window.setTimeout(renderAll, delay || 0);
}

function verifyItem(it: Item): void {
  if(!it.el || !it.canvas || !it.geo) return;
  const btn = it.el.querySelector(".vfy") as HTMLButtonElement;
  btn.disabled = true; btn.textContent = "Verifying…"; btn.classList.remove("ok");
  setTimeout(function(){
    try{
      const ref = document.createElement("canvas");
      ref.width = it.iw; ref.height = it.ih;
      const rc = ref.getContext("2d", { willReadFrequently: true })!;
      rc.drawImage(it.img, 0, 0);
      const a = rc.getImageData(0, 0, it.iw, it.ih).data;
      const cc = it.canvas!.getContext("2d", { willReadFrequently: true })!;
      const b = cc.getImageData(it.geo!.dx, it.geo!.dy, it.iw, it.ih).data;
      let diff = 0;
      for(let i = 0; i < a.length; i += 4){
        if(a[i] !== b[i] || a[i+1] !== b[i+1] || a[i+2] !== b[i+2]) diff++;
      }
      btn.disabled = false;
      if(diff === 0){
        btn.textContent = "✓ 0.000% loss";
        btn.title = "Picture region is bit-for-bit identical to your upload";
        btn.classList.add("ok");
      } else {
        const pct = diff / (it.iw * it.ih) * 100;
        btn.textContent = pct.toFixed(3) + "% differ";
        btn.title = diff + " of " + (it.iw*it.ih) + " pixels differ from the upload";
      }
    }catch(e){
      btn.disabled = false; btn.textContent = "Verify (couldn't read pixels)";
    }
  }, 30);
}

function canvasToBlob(cv: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(function(res){ cv.toBlob(res, "image/png"); });
}

export function downloadItem(it: Item): Promise<SaveOutcome> {
  if(it.passthrough && it.file){
    // already the target shape: hand over the original file, byte-for-byte
    return platform.saveBlob(it.file, passName(it));
  }
  if(!it.canvas) return Promise.resolve("canceled");
  return canvasToBlob(it.canvas).then(function(blob){
    if(!blob) return "failed" as const;
    return platform.saveBlob(blob, outName(it));
  });
}

async function downloadAll(): Promise<void> {
  const jobs: SaveJob[] = app.items.map(function(it){
    return {
      // name + blob are decided in the same instant (and re-check membership,
      // so an item removed mid-batch is skipped like the original loop did)
      make: function(){
        if(app.items.indexOf(it) < 0) return Promise.resolve(null);
        if(it.passthrough && it.file) return Promise.resolve({ blob: it.file as Blob, name: passName(it) });
        if(!it.canvas) return Promise.resolve(null);
        const name = outName(it);
        return canvasToBlob(it.canvas).then(function(blob){ return blob ? { blob: blob, name: name } : null; });
      },
    };
  });
  const r = await platform.saveMany(jobs);
  if(r.failed > 0){
    countEl.textContent = r.saved + " saved · " + r.failed + " failed — check disk space or folder permissions";
  }
}

export function syncBars(): void {
  const n = app.items.length;
  empty.style.display = n ? "none" : "";
  (bar as HTMLElement & { hidden: boolean }).hidden = !n;
  countEl.textContent = n + (n===1 ? " photo" : " photos") + " ready";
  $("videoPanel").style.display = n ? "" : "none";
  updateSelUI();
}
