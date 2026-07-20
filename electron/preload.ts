import { contextBridge, ipcRenderer } from "electron";

/**
 * The entire native surface the renderer can see. Kept tiny on purpose:
 * the app is a normal web app everywhere except explicit file saves.
 */
contextBridge.exposeInMainWorld("frameNative", {
  saveFile: (data: ArrayBuffer, name: string): Promise<"saved" | "canceled"> =>
    ipcRenderer.invoke("frame:save-file", data, name),
  pickDir: (): Promise<string | null> =>
    ipcRenderer.invoke("frame:pick-dir"),
  writeFile: (dir: string, name: string, data: ArrayBuffer): Promise<"saved"> =>
    ipcRenderer.invoke("frame:write-file", dir, name, data),
  releaseDir: (dir: string): Promise<void> =>
    ipcRenderer.invoke("frame:release-dir", dir),
});
