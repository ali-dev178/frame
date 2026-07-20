/**
 * Platform adapter: the ONLY place the app distinguishes browser from
 * desktop. Everything else is plain web code on both.
 *
 * Detection is by the preload-injected API, not user-agent sniffing.
 */

interface FrameNative {
  saveFile(data: ArrayBuffer, name: string): Promise<"saved" | "canceled">;
  pickDir(): Promise<string | null>;
  writeFile(dir: string, name: string, data: ArrayBuffer): Promise<"saved">;
  releaseDir(dir: string): Promise<void>;
}

declare global {
  interface Window { frameNative?: FrameNative }
}

export type SaveOutcome = "saved" | "canceled" | "failed";

export interface SaveJob {
  /**
   * Produces blob AND name in the same instant, so a settings change
   * mid-batch can never pair a stale name with fresh content (or vice
   * versa). Return null to skip the job.
   */
  make: () => Promise<{ blob: Blob; name: string } | null>;
}

export interface SaveManyResult {
  saved: number;
  skipped: number;
  failed: number;
  canceled: boolean;
}

export interface Platform {
  readonly isDesktop: boolean;
  /** Save one file: browser = download; desktop = native save dialog. */
  saveBlob(blob: Blob, suggestedName: string): Promise<SaveOutcome>;
  /** Save many: browser = sequential downloads (original pacing); desktop = pick one folder, write all. */
  saveMany(jobs: SaveJob[]): Promise<SaveManyResult>;
}

const webPlatform: Platform = {
  isDesktop: false,
  saveBlob(blob, suggestedName) {
    return new Promise(function (resolve) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = suggestedName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); resolve("saved"); }, 400);
    });
  },
  async saveMany(jobs) {
    const r: SaveManyResult = { saved: 0, skipped: 0, failed: 0, canceled: false };
    for (let i = 0; i < jobs.length; i++) {
      const job = await jobs[i].make();
      if (job) { await this.saveBlob(job.blob, job.name); r.saved++; }
      else r.skipped++;
      await new Promise(function (res) { setTimeout(res, 350); });
    }
    return r;
  },
};

function desktopPlatform(native: FrameNative): Platform {
  return {
    isDesktop: true,
    async saveBlob(blob, suggestedName) {
      try {
        return await native.saveFile(await blob.arrayBuffer(), suggestedName);
      } catch (e) {
        return "failed";
      }
    },
    async saveMany(jobs) {
      const r: SaveManyResult = { saved: 0, skipped: 0, failed: 0, canceled: false };
      const dir = await native.pickDir();
      if (!dir) { r.canceled = true; return r; }
      try {
        for (let i = 0; i < jobs.length; i++) {
          // one failed write must never silently abort the rest of the batch
          try {
            const job = await jobs[i].make();
            if (job) { await native.writeFile(dir, job.name, await job.blob.arrayBuffer()); r.saved++; }
            else r.skipped++;
          } catch (e) {
            r.failed++;
          }
        }
      } finally {
        try { await native.releaseDir(dir); } catch (e) { /* grant expires with the session anyway */ }
      }
      return r;
    },
  };
}

export const platform: Platform = window.frameNative ? desktopPlatform(window.frameNative) : webPlatform;
