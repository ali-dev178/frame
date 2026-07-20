# Frame.

Fit tall photos into any Instagram format — **losslessly** — then turn them into a video
with your music, all in one place. Everything runs locally; no photo or audio ever leaves
your machine.

- The photo is placed at its exact original resolution and saved as lossless PNG — the
  picture area is never resized, cropped, or recompressed (there's an in-app **Verify**
  button that proves it per photo).
- If a photo already matches the target shape, downloading hands you the original file
  byte-for-byte.
- The video studio arranges framed photos on a timeline with music (drag, trim, split),
  and exports MP4 via WebCodecs in seconds — no real-time recording where supported.

## Download (desktop)

Grab the installer for Windows or macOS from the
[Releases](https://github.com/ali-dev178/frame/releases) page.

Builds are currently **unsigned**:
- **Windows**: SmartScreen will warn — click *More info → Run anyway*.
- **macOS**: approve the app under *System Settings → Privacy & Security* after first launch.

## Develop

```sh
npm install
npm run dev            # web app at the printed URL
npm run dev:desktop    # same app in an Electron window
npm test               # unit + real-Chromium pixel tests
npm run dist           # build the desktop installer locally
npm run smoke:desktop  # verify the WebCodecs export pipeline in Electron
```

Architecture notes live in [CLAUDE.md](CLAUDE.md). The original single-file version of the
app is preserved untouched at [`instagram-frame-tool.html`](instagram-frame-tool.html).

Tagged pushes (`v*`) build Windows + macOS installers on CI and attach them to a GitHub
Release — each build first runs a WebCodecs smoke probe inside the packaged Electron on
that OS, so an installer only ships if the fast-export pipeline actually works there.
