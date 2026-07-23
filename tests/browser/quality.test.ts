import { describe, expect, it } from "vitest";
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import { exportFast } from "../../src/export/fast";
import { S, app } from "../../src/state";
import type { Item } from "../../src/types";

/**
 * The gold proof: encode a still through the REAL Ultra pipeline, then
 * DECODE the actual MP4 and measure pixel fidelity. Photo-like content at
 * 40 Mbps must come back visually transparent (high PSNR, tiny mean error).
 */

const W = 320, H = 400;

/** Photo-like content: smooth gradients + hard edges (worst honest case — pure noise would only measure chroma subsampling, which no codec at any bitrate preserves). */
function photoLikeCanvas(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#2a4d69"); g.addColorStop(0.5, "#c9a24b"); g.addColorStop(1, "#4f2d3d");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = "#ece7d9";
  x.beginPath(); x.arc(W * 0.35, H * 0.3, 60, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#15140f";
  x.fillRect(W * 0.55, H * 0.55, 90, 120);
  x.strokeStyle = "#fff"; x.lineWidth = 3;
  for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(10 + i * 50, H - 20); x.lineTo(40 + i * 50, H - 90); x.stroke(); }
  return cv;
}

function fakeItem(cv: HTMLCanvasElement): Item {
  return {
    id: 1, name: "q.png", file: new File([], "q.png"), img: null as unknown as HTMLImageElement,
    iw: cv.width, ih: cv.height, edges: null, grad: null, canvas: cv, el: null,
  };
}

describe("video quality — measured, not promised", () => {
  it("Ultra-encoded frames come back visually transparent (PSNR)", async (ctx) => {
    const encOk = typeof VideoEncoder !== "undefined" &&
      (await VideoEncoder.isConfigSupported({ codec: "avc1.42e01e", width: W, height: H, bitrate: 1000000 })).supported;
    if (!encOk) return ctx.skip();

    if (!document.getElementById("resultStage")) {
      const d = document.createElement("div"); d.id = "resultStage"; document.body.appendChild(d);
    }
    const src = photoLikeCanvas();
    app.items = [fakeItem(src)];
    app.seq = [{ id: 1, dur: 1 }];
    app.tracks = [];
    S.motion = "static"; S.trans = "none"; S.look = "none"; S.vq = "ultra";

    const blob = await exportFast(function () {});
    // sanity only: a real MP4 (container + a frame) is at least ~1 KB. A static
    // Ultra frame compresses to very little (all-identical P-frames), and how
    // little depends on the platform encoder — the actual quality bar is the
    // PSNR/mean-error check below, not the byte count.
    expect(blob.size).toBeGreaterThan(1000);

    // decode the REAL MP4 with mediabunny + WebCodecs
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    expect(track).toBeTruthy();
    const decodable = await track!.canDecode();
    if (!decodable) return ctx.skip(); // this Chromium build can't decode H.264 — encode-side already verified

    const sink = new VideoSampleSink(track!);
    const sample = await sink.getSample(0.5); // mid-clip frame
    expect(sample).toBeTruthy();
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const octx = out.getContext("2d")!;
    sample!.draw(octx, 0, 0);
    sample!.close();

    const a = src.getContext("2d")!.getImageData(0, 0, W, H).data;
    const b = octx.getImageData(0, 0, W, H).data;
    let sumSq = 0, sumAbs = 0, maxAbs = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        const d = a[i + k] - b[i + k];
        sumSq += d * d; sumAbs += Math.abs(d);
        if (Math.abs(d) > maxAbs) maxAbs = Math.abs(d);
        n++;
      }
    }
    const mse = sumSq / n;
    const psnr = mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
    const meanAbs = sumAbs / n;
    console.log(`QUALITY PROOF: PSNR=${psnr.toFixed(2)} dB, mean|Δ|=${meanAbs.toFixed(3)}, max|Δ|=${maxAbs}`);

    // >40 dB is the classic "visually lossless" bar; Ultra should sail past it
    expect(psnr).toBeGreaterThan(40);
    expect(meanAbs).toBeLessThan(3);
  }, 30000);
});
