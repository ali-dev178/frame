import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { renderAudioOffline } from "../audio/engine";
import { VQUAL } from "../core/config";
import { drawAtTime, outDims } from "../render/sequence";
import { S, hasAudio, totalDur } from "../state";
import { $ } from "../ui/dom";

/**
 * AAC bitrates to try, highest first. Platform encoders cap out below the
 * app's Ultra 320k — e.g. Windows Media Foundation refuses stereo AAC
 * above 192k — so the exporter negotiates downward instead of failing
 * over to slow real-time recording.
 */
export function aacBitrateLadder(want: number): number[] {
  const ladder = [want, 256000, 192000, 160000, 128000, 96000];
  return ladder.filter(function(v, i){ return ladder.indexOf(v) === i && v > 0; });
}

/** Highest AAC bitrate the platform encoder accepts, or null if none. */
export async function pickAacBitrate(sampleRate: number, channels: number, want: number): Promise<number | null> {
  const ladder = aacBitrateLadder(want);
  for(let i=0;i<ladder.length;i++){
    try{
      const r = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: sampleRate, numberOfChannels: channels, bitrate: ladder[i] });
      if(r && r.supported) return ladder[i];
    }catch(e){ /* try the next rung */ }
  }
  return null;
}

/** Probes H.264 codec strings from best to broadest and returns the first supported. */
export function pickAvc(W: number, H: number, bitrate: number): Promise<string | null> {
  const list = ["avc1.640033","avc1.640032","avc1.640028","avc1.64001f","avc1.4d0028","avc1.42e01e"];
  return (function tryNext(i: number): Promise<string | null> {
    if(i >= list.length) return Promise.resolve(null);
    return VideoEncoder.isConfigSupported({ codec:list[i], width:W, height:H, bitrate:bitrate })
      .then(function(r){ return (r && r.supported) ? list[i] : tryNext(i+1); })
      .catch(function(){ return tryNext(i+1); });
  })(0);
}

/**
 * Fast export: WebCodecs H.264 + AAC muxed straight into an MP4 —
 * no real-time recording, so a long video exports in seconds.
 */
export async function exportFast(onProgress: (f: number, label: string) => void): Promise<Blob> {
  const dims = outDims(), W = dims.W, H = dims.H;
  const q = VQUAL.filter(function(x){return x.key===S.vq;})[0];
  const total = totalDur(), fps = 30, frames = Math.max(1, Math.round(total*fps));
  const codec = await pickAvc(W, H, q.v);
  if(!codec) throw new Error("no supported H.264 config");
  const audioPlan = hasAudio() ? await renderAudioOffline(total) : null;

  const target = new ArrayBufferTarget();
  const videoCfg = { codec: "avc" as const, width: W, height: H };
  const muxer = audioPlan
    ? new Muxer({ target: target, fastStart: "in-memory", video: videoCfg,
                  audio: { codec: "aac", sampleRate: audioPlan.sampleRate, numberOfChannels: 2 } })
    : new Muxer({ target: target, fastStart: "in-memory", video: videoCfg });

  let vErr: unknown = null;
  const venc = new VideoEncoder({
    output: function(chunk, meta){ muxer.addVideoChunk(chunk, meta); },
    error: function(e){ vErr = e; }
  });
  venc.configure({ codec: codec, width: W, height: H, bitrate: q.v, framerate: fps });

  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c2 = cv.getContext("2d")!;
  const st = $("resultStage"); st.insertBefore(cv, st.firstChild);

  for(let i=0;i<frames;i++){
    if(vErr) throw vErr;
    drawAtTime(c2, W, H, i/fps);
    const vf = new VideoFrame(cv, { timestamp: Math.round(i*1e6/fps), duration: Math.round(1e6/fps) });
    venc.encode(vf, { keyFrame: (i % 60) === 0 });
    vf.close();
    while(venc.encodeQueueSize > 20){ await new Promise(function(r){ setTimeout(r, 4); }); }
    if(i % 10 === 0){ onProgress(i/frames*0.85, "Exporting"); await new Promise(function(r){ setTimeout(r, 0); }); }
  }
  await venc.flush();
  if(vErr) throw vErr;

  if(audioPlan){
    onProgress(0.9, "Exporting");
    const aBitrate = await pickAacBitrate(audioPlan.sampleRate, 2, q.a);
    if(aBitrate === null) throw new Error("no supported AAC config"); // → honest real-time fallback
    let aErr: unknown = null;
    const aenc = new AudioEncoder({
      output: function(chunk, meta){ muxer.addAudioChunk(chunk, meta); },
      error: function(e){ aErr = e; }
    });
    aenc.configure({ codec: "mp4a.40.2", sampleRate: audioPlan.sampleRate, numberOfChannels: 2, bitrate: aBitrate });
    const step = 4800, L = audioPlan.left, R = audioPlan.right;
    for(let off=0; off<L.length; off += step){
      if(aErr) throw aErr;
      const n = Math.min(step, L.length - off);
      const data = new Float32Array(n*2);
      data.set(L.subarray(off, off+n), 0);
      data.set(R.subarray(off, off+n), n);
      const ad = new AudioData({ format:"f32-planar", sampleRate: audioPlan.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off/audioPlan.sampleRate*1e6), data: data });
      aenc.encode(ad); ad.close();
      while(aenc.encodeQueueSize > 10){ await new Promise(function(r){ setTimeout(r, 4); }); }
    }
    await aenc.flush();
    if(aErr) throw aErr;
  }
  onProgress(0.98, "Exporting");
  muxer.finalize();
  return new Blob([target.buffer], { type: "video/mp4" });
}
