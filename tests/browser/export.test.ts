import { describe, expect, it } from "vitest";
import { exportFast } from "../../src/export/fast";
import { S, app } from "../../src/state";
import type { Item } from "../../src/types";

/**
 * End-to-end fast-export regression test: encodes a real 1-second clip
 * through VideoEncoder + the Mediabunny muxer and checks the MP4 comes
 * out sane. Video-only on purpose — AAC encode doesn't exist in Linux
 * Chromium (CI), while H.264 is bundled everywhere.
 */

function resetForExport(cv: HTMLCanvasElement): void {
  if (!document.getElementById("resultStage")) {
    const d = document.createElement("div");
    d.id = "resultStage";
    document.body.appendChild(d);
  }
  const item: Item = {
    id: 1, name: "clip.png", file: new File([], "clip.png"),
    img: null as unknown as HTMLImageElement,
    iw: cv.width, ih: cv.height, edges: null, grad: null, canvas: cv, el: null,
  };
  app.items = [item];
  app.seq = [{ id: 1, dur: 1 }];
  app.tracks = [];
  S.motion = "static";
  S.trans = "none";
  S.vq = "high";
}

describe("exportFast (WebCodecs + Mediabunny)", () => {
  it("muxes a video-only clip into a valid MP4", async (ctx) => {
    const supported = typeof VideoEncoder !== "undefined" &&
      (await VideoEncoder.isConfigSupported({ codec: "avc1.42e01e", width: 64, height: 64, bitrate: 1000000 })).supported;
    if (!supported) return ctx.skip(); // environment has no H.264 encoder — nothing to test

    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64;
    const c2 = cv.getContext("2d")!;
    c2.fillStyle = "#c9a24b"; c2.fillRect(0, 0, 64, 64);
    resetForExport(cv);

    const blob = await exportFast(function () {});

    expect(blob.type).toBe("video/mp4");
    expect(blob.size).toBeGreaterThan(500); // 30 real encoded frames, not an empty container
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const brand = String.fromCharCode(head[4], head[5], head[6], head[7]);
    expect(brand).toBe("ftyp"); // an actual MP4 file signature
  });
});
