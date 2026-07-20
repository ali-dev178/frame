import { FORMATS, MKEYS, MODES, tabDef } from "../core/config";
import { S, app, curTarget } from "../state";
import { $, buildSeg, refreshSeg } from "./dom";
import { scheduleRender } from "./cards";

/** Step 1 panel: format tabs, target picker, fill mode, sliders, solid color, bounds toggle. */
export function initControls(): void {
  // top-level surface tabs: Post / Story / Reel / Profile
  const tabHost = $("tabs");
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
    $("targetHint").textContent = t.hint + " · Instagram size " + t.dims + ".";
  }
  function buildTargetControl(): void {
    const def = tabDef(S.tab), targets = def.targets, seg = $("segTarget"), chip = $("targetChip");
    if(targets.length > 1){
      seg.style.display = ""; chip.style.display = "none";
      buildSeg(seg, targets, S.targetByTab[S.tab], function(k){
        S.targetByTab[S.tab] = k;
        refreshSeg(seg, targets.map(function(x){return x.key;}), k);
        updateTargetHint(); scheduleRender();
      });
    } else {
      seg.style.display = "none"; chip.style.display = "";
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
  buildTargetControl();

  buildSeg($("segMode"), MODES, S.mode, function(k){
    S.mode = k; refreshSeg($("segMode"), MKEYS, k);
    updateModeHint(); syncBlurField(); scheduleRender();
  });
  function updateModeHint(): void { $("modeHint").textContent = MODES.filter(function(x){return x.key===S.mode;})[0].hint!; }
  function syncBlurField(): void {
    $("blurField").style.display = (S.mode === "blur" || S.mode === "frosted") ? "" : "none";
    $("solidField").style.display = (S.mode === "solid") ? "" : "none";
  }
  updateModeHint(); syncBlurField();

  const blur = $<HTMLInputElement>("blur"), dark = $<HTMLInputElement>("dark"), bounds = $<HTMLInputElement>("bounds");
  blur.value = String(S.blur); dark.value = String(S.dark); bounds.checked = S.bounds;
  $("blurVal").textContent = S.blur + "%";
  $("darkVal").textContent = S.dark + "%";

  blur.addEventListener("input", function(){ S.blur = +blur.value; $("blurVal").textContent = S.blur + "%"; scheduleRender(140); });
  dark.addEventListener("input", function(){ S.dark = +dark.value; $("darkVal").textContent = S.dark + "%"; scheduleRender(140); });
  bounds.addEventListener("change", function(){
    S.bounds = bounds.checked;
    app.items.forEach(function(it){ if(it.el){ const bx = it.el.querySelector(".bounds"); if(bx) bx.classList.toggle("on", S.bounds); } });
  });

  const solidColorInput = $<HTMLInputElement>("solidColor");
  solidColorInput.value = (S.solidMode === "custom") ? S.solidColor : "#101010";
  function setSolidChips(): void {
    const c = (S.solidColor || "").toLowerCase();
    $("solidAuto").classList.toggle("on", S.solidMode === "auto");
    $("solidBlack").classList.toggle("on", S.solidMode === "custom" && c === "#000000");
    $("solidWhite").classList.toggle("on", S.solidMode === "custom" && c === "#ffffff");
  }
  solidColorInput.addEventListener("input", function(){ S.solidMode = "custom"; S.solidColor = solidColorInput.value; setSolidChips(); scheduleRender(120); });
  $("solidAuto").onclick  = function(){ S.solidMode = "auto"; setSolidChips(); scheduleRender(); };
  $("solidBlack").onclick = function(){ S.solidMode = "custom"; S.solidColor = "#000000"; solidColorInput.value = "#000000"; setSolidChips(); scheduleRender(); };
  $("solidWhite").onclick = function(){ S.solidMode = "custom"; S.solidColor = "#ffffff"; solidColorInput.value = "#ffffff"; setSolidChips(); scheduleRender(); };
  setSolidChips();
}
