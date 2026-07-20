import { idbGet, idbSet } from "../core/idb";
import { markDirty } from "../core/project";
import { S, app } from "../state";
import type { Settings } from "../types";
import { scheduleRender } from "./cards";
import { initControls } from "./controls";
import { $ } from "./dom";
import { initStudio } from "./studio";
import { renderTimeline } from "./timeline";

interface Preset { name: string; S: Settings }

const KEY = "presets";
let presets: Preset[] = [];

export async function initPresets(): Promise<void> {
  presets = (await idbGet<Preset[]>(KEY).catch(function () { return undefined; })) || [];
  renderChips();
  $("presetSave").onclick = function () {
    const inp = $<HTMLInputElement>("presetName");
    const name = (inp.value || "").trim().slice(0, 24);
    if (!name) { inp.focus(); return; }
    const np: Preset = { name: name, S: JSON.parse(JSON.stringify(S)) as Settings };
    const existing = presets.findIndex(function (p) { return p.name === name; });
    if (existing >= 0) presets[existing] = np; // overwrite in place, keep chip order
    else presets.push(np);
    inp.value = "";
    persist(); renderChips();
  };
}

function persist(): void {
  idbSet(KEY, presets).catch(function () { /* best-effort */ });
}

function renderChips(): void {
  const host = $("presetChips");
  host.innerHTML = "";
  presets.forEach(function (p, i) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = p.name;
    b.title = "Apply this preset · right-click to remove";
    b.onclick = function () {
      if (app.vbusy) return; // never flip settings under a running export
      // merge onto current S so fields added after the preset keep their values;
      // targetByTab merges one level deep so newer tabs keep their entries
      const stored = JSON.parse(JSON.stringify(p.S)) as Partial<Settings>;
      stored.targetByTab = Object.assign({}, S.targetByTab, stored.targetByTab || {});
      Object.assign(S, stored);
      initControls(); initStudio(); // resync every control
      scheduleRender(); renderTimeline(); markDirty();
    };
    b.oncontextmenu = function (e) {
      e.preventDefault();
      presets.splice(i, 1);
      persist(); renderChips();
    };
    host.appendChild(b);
  });
}
