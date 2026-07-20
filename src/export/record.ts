import { applyFadesFrom, ensureCtx, scheduleSegs } from "../audio/engine";
import { VQUAL } from "../core/config";
import { drawAtTime, outDims } from "../render/sequence";
import { S, hasAudio, totalDur } from "../state";
import { $ } from "../ui/dom";
import { REC } from "./capabilities";

/**
 * Honest real-time fallback: records the canvas + a live audio mix
 * with MediaRecorder. Slower and lossier than the fast path by design.
 */
export function exportRecord(onProgress: (f: number, label: string) => void): Promise<{ blob: Blob; ext: string }> {
  return new Promise(function(resolve, reject){
    if(!REC){ reject(new Error("no recorder")); return; }
    const fmt = REC; // narrowed copy — survives into the callbacks below
    const dims = outDims(), W = dims.W, H = dims.H;
    const q = VQUAL.filter(function(x){return x.key===S.vq;})[0];
    const total = totalDur();
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const c2 = cv.getContext("2d")!;
    drawAtTime(c2, W, H, 0);
    const st = $("resultStage"); st.insertBefore(cv, st.firstChild);
    $("expRec").classList.add("on"); $("expRecLbl").textContent = "Recording (real time)";

    const stream = cv.captureStream(30);
    const mtracks: MediaStreamTrack[] = stream.getVideoTracks();
    let actx: AudioContext | null = null, gain: GainNode | null = null, liveNodes: AudioBufferSourceNode[] = [];
    if(hasAudio()){
      actx = ensureCtx();
      if(actx.state === "suspended") actx.resume();
      const dest = actx.createMediaStreamDestination();
      gain = actx.createGain();
      const comp = actx.createDynamicsCompressor();
      gain.connect(comp); comp.connect(dest);
      if(dest.stream.getAudioTracks()[0]) mtracks.push(dest.stream.getAudioTracks()[0]);
    }
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(new MediaStream(mtracks), { mimeType: fmt.m, videoBitsPerSecond: q.v, audioBitsPerSecond: q.a }); }
    catch(e){ rec = new MediaRecorder(new MediaStream(mtracks), { mimeType: fmt.m }); }
    const chunks: Blob[] = [];
    rec.ondataavailable = function(ev){ if(ev.data && ev.data.size) chunks.push(ev.data); };
    rec.onstop = function(){
      liveNodes.forEach(function(n){ try{ n.stop(); }catch(e){} });
      stream.getTracks().forEach(function(t){ t.stop(); });
      resolve({ blob: new Blob(chunks, { type: fmt.m.split(";")[0] }), ext: fmt.ext });
    };
    const t0 = performance.now();
    rec.start(1000);
    if(gain && actx){
      const now = actx.currentTime + 0.02;
      applyFadesFrom(gain, now, 0, total);
      liveNodes = scheduleSegs(actx, gain, now, 0, total);
    }
    let raf: number;
    (function loop(){
      const t = (performance.now() - t0) / 1000;
      drawAtTime(c2, W, H, Math.min(t, total));
      onProgress(Math.min(1, t/total), "Recording");
      if(t < total) raf = requestAnimationFrame(loop);
    })();
    setTimeout(function(){
      cancelAnimationFrame(raf);
      if(rec.state !== "inactive") rec.stop();
    }, total*1000 + 120);
  });
}
