# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Frame** — a single-file, client-side web tool that (1) fits tall/wide photos into an Instagram
aspect ratio by adding filled margins around the *untouched* original, and (2) turns those framed
photos into a video slideshow with music. Everything is one file: `instagram-frame-tool.html`
(HTML + CSS + one IIFE of ES5-style vanilla JS, ~1970 lines). It runs entirely in the browser;
no photo or audio ever leaves the machine.

## Build / run / test

There is **no build system, no package manager, no lint config, and no test suite** — do not look
for `package.json`, npm scripts, or a bundler. To develop:

- **Run it:** open the file directly in a browser — `start instagram-frame-tool.html` (PowerShell).
  Editing the file and reloading the page is the entire dev loop. `file://` is fine; WebCodecs and
  the Web Audio API work there.
- **Only external dependency:** `mp4-muxer@5` is fetched from a jsDelivr CDN at runtime, and only on
  the *first* video export. Image framing and the real-time recording fallback need no network.
- **"Tests":** the closest thing is the in-app **Verify** button on each photo card
  (`verifyItem`), which re-reads the source pixels and reports what % of the picture region differs
  from the upload — it must read `0.000%`. Treat that as the regression check for any change to the
  framing/draw path (see the invariant below).

Target browser is recent Chrome/Edge (WebCodecs). The code degrades on others and says so in the UI.

## The one invariant that governs the framing code

The photo's pixels must survive **bit-for-bit**. Every change to the image path must preserve this:

- `layout(iw, ih, R)` reaches the target ratio `R` by *growing the canvas*, never scaling the photo.
  The original is drawn once at its natural size at offset `dx,dy` with `imageSmoothingEnabled=false`
  (see `buildCanvas`). Only the surrounding margins get painted.
- When the photo already matches the ratio (`orient==="none"` → `it.passthrough`), download returns
  the **original `File` object byte-for-byte** (`downloadItem` → `passName`). Otherwise it saves a
  lossless PNG (`outName`). Never route a passthrough image through the canvas.
- The lossless/"untouched" promise is stated verbatim to users in the header and `<footer>`. If you
  change draw behavior, keep that copy honest.

## Architecture (one IIFE, module-level state)

State lives in a few module-level variables, not a framework:

- `S` — the settings object (current tab, fill `mode`, blur, motion, transition, quality, etc.).
- `items[]` — loaded photos. Each `item` caches its analysis and its rendered `<canvas>`.
- `seq[]` — the video timeline: `{id, dur}` clips referencing `items`, in order.
- `tracks[]` — audio blocks: freely positioned (`at`), trimmable (`start`/`end` within the decoded
  buffer), assigned to a `lane`; blocks may overlap and are mixed.

The UI is two stages driven by config arrays rendered through generic `buildSeg`/`refreshSeg`
segmented controls: `FORMATS` (Post/Story/Reel/Profile → aspect ratios), `MODES` (side-fill styles),
`MOTIONS`, `TRANSITIONS`, `TDURS`, `VQUAL`. Add a format or fill style by extending the array, not
by wiring new DOM by hand. Re-rendering the photo grid is debounced through `scheduleRender(delay)`.

**Per-photo color analysis** — `computeColors(it)` runs once per image and caches edge-color strips
(`it.edges`), overall average (`it.avg`), two dominant tones (`it.duo`), and gradient endpoints
(`it.grad`). It is wrapped in try/catch because `getImageData` throws on oversized/tainted canvases;
fills fall back gracefully when the analysis is missing.

**Fill styles** — `fillMargins(ctx, it, G)` dispatches on `S.mode` to one `fill*` function per style
(`fillMatched`, `fillStretch`, `fillMirror`, `fillBlur`, `fillGradient`, `fillDuotone`, `fillSolid`).
Each paints *only* the margin regions described by the geometry object `G`; `shade()` adds the edge
darkening. A new fill style = a `MODES` entry + a `fill*` function + a `case` in `fillMargins`.

## Video studio: one draw path feeds preview and both exporters

The single most important design point: **`drawAtTime(ctx, W, H, t)` is the sole frame renderer.**
The live preview loop (`pv`, driven by `requestAnimationFrame`), the fast exporter, and the
real-time fallback all call it, so what you preview is exactly what exports.

- `outDims()` — output size is the largest clip's canvas (even-rounded); smaller clips scale up.
- `drawAtTime` picks the active clip(s) for time `t`; inside a transition window it calls
  `drawBlend` (crossfade / fadeblack / slide / wipe), otherwise `drawClipFrame`.
- `drawClipFrame` applies the Ken-Burns `S.motion`. It special-cases an exact-size static clip to a
  true 1:1 pixel copy (duplicating — never dropping — an odd edge row/column), preserving the
  lossless invariant into video where possible.

**Audio** — decoded via Web Audio. `scheduleSegs` schedules the (possibly overlapping) `tracks` as
buffer sources; `applyFadesFrom` builds a fade envelope that stays correct when starting mid-timeline
(used by both preview and export); `renderAudioOffline` bounces the whole mix to a normalized stereo
Float32 buffer via `OfflineAudioContext` for the fast exporter. A large block of the file is the
pointer-driven timeline editor (move/trim/split audio, `drawSegWave` waveforms, `startResize` etc.).

**Two export engines** (`exportBtn.onclick` orchestrates; prefers fast, falls back honestly):

1. `exportFast` — WebCodecs `VideoEncoder` (H.264; `pickAvc` probes codec strings) + `AudioEncoder`
   (AAC) muxed to MP4 with the CDN `mp4-muxer`. Renders 30fps frames off-thread of real time, so a
   long video exports in seconds. Requires `VideoEncoder`/`AudioEncoder`.
2. `exportRecord` — `MediaRecorder` over a `captureStream()` canvas + a Web Audio
   `MediaStreamDestination`, in real time. `REC` selects the best supported mime (MP4/H.264
   preferred, WebM fallback).

Capability flags `hasVEnc` / `hasAEnc` / `REC` decide the path and the honest status line
(`setFmtLine`). `vbusy` locks the UI during export; guard new interactive handlers with it.
`invalidateResult` / `invalidateResultForce` tear down a stale export when any setting changes.

## Conventions

- Vanilla ES5 style throughout: `var`, function declarations, no framework/modules, `$` = `getElementById`.
- Object URLs are explicitly `revokeObjectURL`'d after use — keep that up when adding downloads.
- The whole app is inside one IIFE — there is no global API surface to import against.
