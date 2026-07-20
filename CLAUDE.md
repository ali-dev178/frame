# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Frame** — a client-side web app that (1) fits tall/wide photos into a social-media aspect ratio
by adding filled margins around the *untouched* original, and (2) turns those framed photos into a
video slideshow with music. Runs entirely in the browser; no photo or audio ever leaves the machine.
The roadmap targets Windows/macOS desktop apps via an Electron shell around this same web core
(plus a PWA build) — see the phase plan below.

`instagram-frame-tool.html` at the repo root is the **original single-file app**, kept as a frozen
historical baseline. Do not edit it; the live code is `index.html` + `src/`.

## Commands

- `npm run dev` — Vite dev server, pure web (the main dev loop)
- `npm run dev:desktop` — same app inside an Electron window (hot reload included)
- `npm run build` / `npm run build:desktop` — typecheck + production build (`dist/`, plus
  `dist-electron/` for desktop)
- `npm run smoke:desktop` — headless Electron probe: verifies secure context, preload bridge,
  H.264 VideoEncoder, and the AAC bitrate ladder. CI runs this before packaging installers.
- `npm run dist` — build a desktop installer locally (`release/`)
- `npm test` — all tests once; `npm run test:watch` for watch mode
- Run a single test file: `npx vitest run tests/unit/layout.test.ts`
- Browser-mode tests (`tests/browser/`) run in real headless Chromium via Playwright
  (`npx playwright install chromium` if the browser is missing). Unit tests (`tests/unit/`) run in node.
- Releases: push a `v*` tag → GitHub Actions builds Win (NSIS) + Mac (dmg/zip universal,
  unsigned) and attaches them to a GitHub Release.

Target browser is recent Chrome/Edge (WebCodecs). The code degrades honestly on others.

## The one invariant that governs everything

The photo's pixels must survive **bit-for-bit**. `tests/browser/lossless.test.ts` enforces this
against real Chromium for every fill mode — it must stay green. The moving parts:

- `src/core/layout.ts` reaches the target ratio by *growing the canvas*, never scaling the photo.
- `src/render/frame.ts` (`buildCanvas`) draws the original once, at natural size, smoothing off.
  Only the margins get painted (`src/render/fills.ts`).
- When the photo already matches the ratio (`orient === "none"` → `it.passthrough`), download hands
  over the **original `File` byte-for-byte** (`downloadItem` in `src/ui/cards.ts`); otherwise a
  lossless PNG. Never route a passthrough image through the canvas.
- `drawClipFrame` (`src/render/sequence.ts`) extends the invariant into video: exact-size static
  clips are 1:1 copies; odd dimensions get a *duplicated* edge row/column, never a removed one.
- The promise is stated verbatim to users in the header and footer of `index.html`. If you change
  draw behavior, keep that copy honest. The in-app **Verify** button re-checks any photo live.

## Architecture

```
src/
├── main.ts          entry — calls init* in the original app's execution order
├── state.ts         S (settings) + app (items/seq/tracks/selection/busy) + selectors
├── types.ts         all interfaces
├── core/            config (FORMATS/MODES/… arrays), layout math, color analysis, naming
├── render/          fills (margin painters), frame (buildCanvas), sequence (drawAtTime)
├── audio/           Web Audio: scheduling, fade envelope, offline mixdown
├── export/          capabilities probe, WebCodecs fast path, MediaRecorder fallback
├── platform/        THE only browser-vs-desktop split: saveBlob/saveMany adapter
└── ui/              dom helpers, controls, cards+dropzone, studio, timeline editor, soundtrack
electron/            desktop shell: main (window+IPC+smoke probe), preload (frameNative bridge)
```

**Desktop specifics:** one Vite codebase, two modes (`--mode desktop` adds the Electron
plugin; web build stays pure). The renderer detects desktop by the presence of
`window.frameNative` (contextBridge), never by user-agent. Saves go through
`src/platform/index.ts` — browser = `<a download>`, desktop = native dialogs over IPC
(`frame:save-file`, `frame:pick-dir` + `frame:write-file` with a picked-dir allowlist).
AAC export bitrate is negotiated down a ladder (`pickAacBitrate`) because platform
encoders cap below 320k (Windows MF: 192k stereo max) — don't hardcode AAC bitrates.

Key design points that span files:

- **`drawAtTime` (src/render/sequence.ts) is the single frame renderer.** The live preview
  (`pv` engine in `src/ui/studio.ts`), the fast exporter, and the recording fallback all call it —
  what you preview is exactly what exports.
- **State**: `S` is settings, `app` holds mutable collections; modules mutate `app.x` (never
  reassign an imported binding). UI is generated from config arrays via `buildSeg` (`src/ui/dom.ts`)
  — add a format/fill/motion/transition by extending the array in `src/core/config.ts`, not by
  hand-wiring DOM. New fill style = MODES entry + painter + case in `fillMargins`.
- **Analysis cache**: `computeColors` (src/core/colors.ts) runs once per photo and caches
  edges/avg/duo/grad on the item; fills degrade gracefully if it threw (oversized canvas).
- **Two export engines** (orchestrated in `src/ui/studio.ts`, prefers fast, falls back honestly):
  `exportFast` = WebCodecs H.264+AAC muxed by **Mediabunny** (npm, bundled — offline-capable;
  successor to the deprecated mp4-muxer). Mediabunny's packet adds are async while encoder
  callbacks are sync — the per-track promise chains in `exportFast` keep decode order; don't
  fire-and-forget `source.add()`. `exportRecord` = real-time MediaRecorder. Capability flags
  live in `src/export/capabilities.ts`.
- **UI module cycles are intentional and safe**: cards↔studio↔timeline↔soundtrack import each
  other's functions, but only call them at event time; all wiring lives in `init*()` functions
  invoked by `main.ts` after every module is loaded. Don't add top-level cross-module *calls*.
- **`app.vbusy` guards**: every interactive handler checks it so nothing mutates mid-export.
  Keep that up in new handlers. `invalidateResult()` must be called when any setting that affects
  the video changes.

## Conventions & gotchas

- No UI framework; imperative DOM + canvas, `$()` = typed getElementById. Match this style.
- Object URLs are always `revokeObjectURL`'d after use.
- Video output dimensions must be **even** (`outDims` rounds up; encoders reject odd sizes).
- WebCodecs is SecureContext-gated — relevant for the future Electron shell (use `loadFile()` or a
  privileged custom scheme, not an opaque origin).
- Roadmap (tracked in session tasks): ① foundation (done) → ② Electron shell + Win/Mac installers
  (unsigned initially) via GitHub Actions → ③ PWA + IndexedDB persistence → ④ more platforms/formats
  → ⑤ richer editing (text overlays, per-clip settings, filters). Repo is private for now.
