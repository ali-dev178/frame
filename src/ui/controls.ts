import { FORMATS, MKEYS, MODES, tabDef } from "../core/config";
import { markDirty } from "../core/project";
import { S, app, curTarget } from "../state";
import { $, buildSeg, refreshSeg } from "./dom";
import { scheduleRender } from "./cards";

/**
 * Step 1 panel: format tabs, target picker, fill mode, sliders, solid color,
 * bounds toggle. Idempotent on purpose — presets and project restore re-run
 * it to resync every control with S (hence on* assignments, not addEventListener).
 */
export function initControls(): void {
  // top-level surface tabs: Post / Story / Reel / … / Custom
  const tabHost = $("tabs");
  tabHost.innerHTML = "";
  FORMATS.forEach(function(f){
    const b = document.createElement("button");
    b.type = "button"; b.className = "tab"; b.textContent = f.label;
    b.setAttribute("role","tab");
    b.setAttribute("aria-selected", String(f.tab === S.tab));
    b.onclick = function(){ setTab(f.tab); };
    tabHost.appendChild(b);
  });

  function updateTargetHint(): void {
    const t = curTarget();
    $("targetHint").textContent = t.hint + (t.dims ? " · " + t.dims + "." : "");
  }
  function buildTargetControl(): void {
    const def = tabDef(S.tab), targets = def.targets, seg = $("segTarget"), chip = $("targetChip"), custom = $("customSize");
    if(S.tab === "custom"){
      seg.style.display = "none"; chip.style.display = "none"; custom.style.display = "";
    } else if(targets.length > 1){
      seg.style.display = ""; chip.style.display = "none"; custom.style.display = "none";
      buildSeg(seg, targets, S.targetByTab[S.tab], function(k){
        S.targetByTab[S.tab] = k;
        refreshSeg(seg, targets.map(function(x){return x.key;}), k);
        updateTargetHint(); scheduleRender();
      });
    } else {
      seg.style.display = "none"; chip.style.display = ""; custom.style.display = "none";
      S.targetByTab[S.tab] = targets[0].key;
      chip.textContent = targets[0].label;
    }
    updateTargetHint();
  }
  function setTab(k: string): void {
    S.tab = k;
    Array.from(tabHost.children).forEach(function(b, i){
      b.setAttribute("aria-selected", String(FORMATS[i].tab === k));
    });
    buildTargetControl();
    scheduleRender();
  }

  const customW = $<HTMLInputElement>("customW"), customH = $<HTMLInputElement>("customH");
  customW.value = String(S.customW); customH.value = String(S.customH);
  function onCustomSize(): void {
    // an empty/garbage field keeps the previous value — no ratio jumps mid-typing
    const w = Math.round(+customW.value), h = Math.round(+customH.value);
    if(w >= 1) S.customW = Math.min(8000, w);
    if(h >= 1) S.customH = Math.min(8000, h);
    updateTargetHint(); scheduleRender(140);
  }
  customW.oninput = onCustomSize;
  customH.oninput = onCustomSize;

  buildTargetControl();

  buildSeg($("segMode"), MODES, S.mode, function(k){
    S.mode = k; refreshSeg($("segMode"), MKEYS, k);
    updateModeHint(); syncBlurField(); scheduleRender();
  });
  function updateModeHint(): void { $("modeHint").textContent = (MODES.filter(function(x){return x.key===S.mode;})[0] || MODES[0]).hint!; }
  function syncBlurField(): void {
    $("blurField").style.display = (S.mode === "blur" || S.mode === "frosted") ? "" : "none";
    $("solidField").style.display = (S.mode === "solid") ? "" : "none";
  }
  updateModeHint(); syncBlurField();

  const blur = $<HTMLInputElement>("blur"), dark = $<HTMLInputElement>("dark"), bounds = $<HTMLInputElement>("bounds");
  blur.value = String(S.blur); dark.value = String(S.dark); bounds.checked = S.bounds;
  $("blurVal").textContent = S.blur + "%";
  $("darkVal").textContent = S.dark + "%";

  blur.oninput = function(){ S.blur = +blur.value; $("blurVal").textContent = S.blur + "%"; scheduleRender(140); };
  dark.oninput = function(){ S.dark = +dark.value; $("darkVal").textContent = S.dark + "%"; scheduleRender(140); };
  bounds.onchange = function(){
    S.bounds = bounds.checked;
    app.items.forEach(function(it){ if(it.el){ const bx = it.el.querySelector(".bounds"); if(bx) bx.classList.toggle("on", S.bounds); } });
    markDirty(); // the one settings change that intentionally skips scheduleRender
  };

  const solidColorInput = $<HTMLInputElement>("solidColor");
  solidColorInput.value = (S.solidMode === "custom") ? S.solidColor : "#101010";
  function setSolidChips(): void {
    const c = (S.solidColor || "").toLowerCase();
    $("solidAuto").classList.toggle("on", S.solidMode === "auto");
    $("solidBlack").classList.toggle("on", S.solidMode === "custom" && c === "#000000");
    $("solidWhite").classList.toggle("on", S.solidMode === "custom" && c === "#ffffff");
  }
  solidColorInput.oninput = function(){ S.solidMode = "custom"; S.solidColor = solidColorInput.value; setSolidChips(); scheduleRender(120); };
  $("solidAuto").onclick  = function(){ S.solidMode = "auto"; setSolidChips(); scheduleRender(); };
  $("solidBlack").onclick = function(){ S.solidMode = "custom"; S.solidColor = "#000000"; solidColorInput.value = "#000000"; setSolidChips(); scheduleRender(); };
  $("solidWhite").onclick = function(){ S.solidMode = "custom"; S.solidColor = "#ffffff"; solidColorInput.value = "#ffffff"; setSolidChips(); scheduleRender(); };
  setSolidChips();
}
