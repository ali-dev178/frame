import type { RecFormat } from "../types";

/** Best supported MediaRecorder fallback format (also used for capability labeling). */
export const REC: RecFormat | null = (function(){
  const cands: RecFormat[] = [
    {m:"video/mp4;codecs=avc1.640029,mp4a.40.2", ext:"mp4", label:"MP4 (H.264 + AAC)", ig:true},
    {m:"video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext:"mp4", label:"MP4 (H.264 + AAC)", ig:true},
    {m:"video/mp4", ext:"mp4", label:"MP4", ig:true},
    {m:"video/webm;codecs=vp9,opus", ext:"webm", label:"WebM (VP9)", ig:false},
    {m:"video/webm;codecs=vp8,opus", ext:"webm", label:"WebM (VP8)", ig:false},
    {m:"video/webm", ext:"webm", label:"WebM", ig:false}
  ];
  const ok = (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported);
  for(let i=0;i<cands.length;i++){ if(ok && MediaRecorder.isTypeSupported(cands[i].m)) return cands[i]; }
  return null;
})();

export const hasVEnc = (typeof VideoEncoder !== "undefined");
export const hasAEnc = (typeof AudioEncoder !== "undefined");
