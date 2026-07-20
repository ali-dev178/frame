import { BrowserWindow, Menu, app, dialog, ipcMain, session } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isSmoke = process.argv.includes("--smoke");
const devUrl = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL : undefined;
const appIndexPath = path.join(__dirname, "../dist/index.html");
const appIndexUrl = pathToFileURL(appIndexPath).href;

// only allow bulk writes into directories the user explicitly picked this session;
// grants are released when the batch finishes (frame:release-dir)
const allowedDirs = new Set<string>();

/** Only the app's own top frame may use the privileged IPC surface. */
function trustedSender(e: Electron.IpcMainInvokeEvent): boolean {
  const f = e.senderFrame;
  if (!f || f !== e.sender.mainFrame) return false;
  if (devUrl) return f.url.startsWith(devUrl);
  return f.url === appIndexUrl;
}

function filtersFor(name: string): Electron.FileFilter[] {
  const ext = (name.match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase();
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp")
    return [{ name: "Image", extensions: [ext] }, { name: "All files", extensions: ["*"] }];
  if (ext === "mp4" || ext === "webm")
    return [{ name: "Video", extensions: [ext] }, { name: "All files", extensions: ["*"] }];
  return [{ name: "All files", extensions: ["*"] }];
}

/**
 * Collision-proof write for bulk saves: never overwrites — appends " (1)",
 * " (2)", … like browser download managers do. (Single saves go through the
 * OS save dialog, which owns its own overwrite confirmation.)
 */
async function writeUnique(dir: string, name: string, data: ArrayBuffer): Promise<string> {
  let base = path.basename(name);
  if (process.platform === "win32") base = base.replace(/[:*?"<>|]/g, "_"); // also kills NTFS alternate-data-stream names
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let n = 0; n < 100; n++) {
    const candidate = n === 0 ? base : stem + " (" + n + ")" + ext;
    try {
      await fs.writeFile(path.join(dir, candidate), Buffer.from(data), { flag: "wx" });
      return candidate;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  throw new Error("too many name collisions");
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 920,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: "#15140f", // app background — avoids a white flash
    autoHideMenuBar: true,      // Windows/Linux: Alt reveals the menu
    show: false,                // shown on ready-to-show (never for --smoke)
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once("ready-to-show", () => { if (!isSmoke) win.show(); });

  // the app never navigates or opens windows — deny the whole class so a
  // dropped HTML file can never replace the app with the preload attached
  win.webContents.on("will-navigate", (e, url) => {
    const ok = devUrl ? url.startsWith(devUrl) : url === appIndexUrl;
    if (!ok) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  if (isSmoke) {
    win.webContents.on("render-process-gone", (_e, d) => {
      console.error("FRAME_SMOKE RENDERER GONE", d.reason);
      app.exit(1);
    });
  }

  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(appIndexPath); // file:// is a secure context — WebCodecs needs one

  return win;
}

/**
 * --smoke: headless capability probe. Verifies the fast-export pipeline
 * (H.264 VideoEncoder + AAC AudioEncoder in a secure context), the preload
 * bridge, and that the renderer actually booted — run in CI on every
 * platform before packaging installers.
 */
async function runSmoke(win: BrowserWindow): Promise<void> {
  // watchdog: a wedged renderer must fail the build, not hang CI for hours
  setTimeout(() => { console.error("FRAME_SMOKE TIMEOUT"); app.exit(1); }, 60000);
  try {
    await new Promise<void>((res, rej) => {
      win.webContents.once("did-finish-load", () => res());
      win.webContents.once("did-fail-load", (_e, code, desc) => rej(new Error(`load failed: ${code} ${desc}`)));
    });
    const probe = await win.webContents.executeJavaScript(`(async () => {
      const aacAt = async (bitrate) => typeof AudioEncoder !== "undefined"
        ? (await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate })).supported
        : false;
      const ladder = [320000, 256000, 192000, 160000, 128000, 96000];
      const aacBitrates = [];
      for (const b of ladder) if (await aacAt(b)) aacBitrates.push(b);
      return {
        secureContext: window.isSecureContext,
        preloadBridge: typeof window.frameNative !== "undefined" && typeof window.frameNative.saveFile === "function",
        appBooted: !!document.querySelector("#tabs button"), // initControls built the tabs → scripts + CSP are fine
        videoEncoder: typeof VideoEncoder !== "undefined",
        audioEncoder: typeof AudioEncoder !== "undefined",
        h264: typeof VideoEncoder !== "undefined"
          ? (await VideoEncoder.isConfigSupported({ codec: "avc1.640028", width: 1080, height: 1350, bitrate: 40000000 })).supported
          : false,
        aacBitrates,
        mediaRecorderMp4: typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.640029,mp4a.40.2"),
      };
    })()`);
    const ok = probe.secureContext && probe.preloadBridge && probe.appBooted && probe.h264 && probe.aacBitrates.length > 0;
    console.log("FRAME_SMOKE " + JSON.stringify(probe));
    console.log(ok ? "FRAME_SMOKE OK — fast export pipeline available" : "FRAME_SMOKE FAIL — fast export pipeline NOT available");
    app.exit(ok ? 0 : 1);
  } catch (e) {
    console.error("FRAME_SMOKE ERROR", e);
    app.exit(1);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    // the app needs no permissions except fullscreen (the video preview's button)
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(permission === "fullscreen");
    });

    if (process.platform === "darwin") {
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        { role: "appMenu" }, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" },
      ]));
    }

    ipcMain.handle("frame:save-file", async (e, data: ArrayBuffer, name: string) => {
      if (!trustedSender(e)) throw new Error("untrusted sender");
      const win = BrowserWindow.fromWebContents(e.sender);
      const r = await dialog.showSaveDialog(win!, {
        defaultPath: path.basename(name),
        filters: filtersFor(name),
      });
      if (r.canceled || !r.filePath) return "canceled";
      await fs.writeFile(r.filePath, Buffer.from(data));
      return "saved";
    });

    ipcMain.handle("frame:pick-dir", async (e) => {
      if (!trustedSender(e)) throw new Error("untrusted sender");
      const win = BrowserWindow.fromWebContents(e.sender);
      const r = await dialog.showOpenDialog(win!, {
        title: "Choose where to save all images",
        properties: ["openDirectory", "createDirectory"],
      });
      if (r.canceled || !r.filePaths[0]) return null;
      allowedDirs.add(r.filePaths[0]);
      return r.filePaths[0];
    });

    ipcMain.handle("frame:write-file", async (e, dir: string, name: string, data: ArrayBuffer) => {
      if (!trustedSender(e)) throw new Error("untrusted sender");
      if (!allowedDirs.has(dir)) throw new Error("directory was not picked by the user");
      await writeUnique(dir, name, data);
      return "saved";
    });

    ipcMain.handle("frame:release-dir", async (e, dir: string) => {
      if (!trustedSender(e)) throw new Error("untrusted sender");
      allowedDirs.delete(dir);
    });

    const win = createWindow();
    if (isSmoke) runSmoke(win);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
