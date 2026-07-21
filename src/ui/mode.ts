import { $ } from "./dom";
import { renderTimeline } from "./timeline";

/**
 * App-shell navigation: the sidebar switches between the framing workspace and
 * the video workspace over one shared photo library. The video workspace has no
 * framing controls — framing is applied automatically — while the photo grid and
 * "add photos" stay usable in both.
 */
let mode: "frame" | "video" = "frame";

export function currentMode(): "frame" | "video" {
  return mode;
}

export function setMode(m: "frame" | "video"): void {
  mode = m;
  const v = m === "video";
  $("navFrame").classList.toggle("on", !v);
  $("navVideo").classList.toggle("on", v);
  $("navFrame").setAttribute("aria-current", v ? "false" : "page");
  $("navVideo").setAttribute("aria-current", v ? "page" : "false");
  $("framePanel").style.display = v ? "none" : "";
  $("videoPanel").style.display = v ? "" : "none";
  if (v) renderTimeline(); // the timeline can only size itself once it's visible
}

export function initMode(): void {
  // the video editor sits directly above the shared photo library
  const main = document.querySelector(".workspace")!;
  main.insertBefore($("videoPanel"), $("drop"));
  $("navFrame").onclick = function () { setMode("frame"); };
  $("navVideo").onclick = function () { setMode("video"); };
  setMode("frame");
}
