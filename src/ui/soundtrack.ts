import { ensureCtx } from "../audio/engine";
import { op } from "../core/history";
import { fmtTime, round10 } from "../core/names";
import { app, hasAudio, nextLane, sndExtent, totalDur } from "../state";
import type { AudioTrack } from "../types";
import { $ } from "./dom";
import { invalidateResult, pv, updateSelUI } from "./studio";
import { renderTimeline } from "./timeline";

/** Soundtrack panel: load audio files, status line, "match clips to music". */
export function initSoundtrack(): void {
  const audioFile = $<HTMLInputElement>("audioFile");
  $("musicPick").onclick = function(e){ e.stopPropagation(); audioFile.click(); };
  $("music").addEventListener("click", function(e){ if((e.target as Element).closest("button")) return; audioFile.click(); });
  audioFile.addEventListener("change", function(){ if(audioFile.files) addAudioFiles(audioFile.files); audioFile.value=""; });
  ["dragenter","dragover"].forEach(function(ev){ $("music").addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); $("music").style.borderColor="var(--brass)"; }); });
  ["dragleave","drop"].forEach(function(ev){ $("music").addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); $("music").style.borderColor="var(--line)"; }); });
  $("music").addEventListener("drop", function(e){
    const de = e as DragEvent;
    if(de.dataTransfer && de.dataTransfer.files) addAudioFiles(de.dataTransfer.files);
  });

  $("fitMusic").onclick = function(){
    if(!hasAudio() || !app.seq.length){ const m=$("music"); m.style.borderColor="var(--warn)"; setTimeout(function(){ m.style.borderColor="var(--line)"; },700); return; }
    op(function(){
      const target = Math.min(90, Math.max(1, Math.round(sndExtent())));
      const now = totalDur();
      let acc = 0;
      app.seq.forEach(function(c){
        c.dur = Math.max(1, Math.min(60, Math.round(c.dur * target / now)));
        acc += c.dur;
      });
      const drift = target - acc;
      app.seq[app.seq.length-1].dur = Math.max(1, Math.min(60, app.seq[app.seq.length-1].dur + drift));
    });
    renderTimeline(); updateSelUI(); invalidateResult();
  };

  // voiceover: record from the microphone straight into a new audio track
  let mediaRec: MediaRecorder | null = null;
  let micStream: MediaStream | null = null;
  const recBtn = $<HTMLButtonElement>("recVoice");
  recBtn.onclick = function(){
    if(app.vbusy) return;
    if(mediaRec && mediaRec.state !== "inactive"){ mediaRec.stop(); return; } // toggle off
    const md = navigator.mediaDevices;
    if(!md || !md.getUserMedia || typeof MediaRecorder === "undefined"){
      $("musicDur").textContent = "Microphone recording isn't available in this browser.";
      return;
    }
    md.getUserMedia({ audio: true }).then(function(stream){
      micStream = stream;
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      mediaRec = rec;
      rec.ondataavailable = function(ev){ if(ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = function(){
        if(micStream){ micStream.getTracks().forEach(function(tr){ tr.stop(); }); micStream = null; }
        recBtn.classList.remove("rec"); recBtn.textContent = "● Voiceover"; mediaRec = null;
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if(blob.size) addRecordedVoice(new File([blob], "Voiceover", { type: blob.type }));
      };
      rec.start();
      recBtn.classList.add("rec"); recBtn.textContent = "■ Stop";
    }).catch(function(){
      // reject OR a throw from new MediaRecorder()/start() after the stream was
      // acquired — never leave the mic live or the recorder half-open
      if(micStream){ micStream.getTracks().forEach(function(tr){ tr.stop(); }); micStream = null; }
      mediaRec = null;
      recBtn.classList.remove("rec"); recBtn.textContent = "● Voiceover";
      $("musicDur").textContent = "Couldn't start recording — check microphone permissions.";
    });
  };
}

/** Decode a recorded voiceover blob and drop it as a track at the playhead. */
function addRecordedVoice(file: File): void {
  const fr = new FileReader();
  fr.onload = function(){
    ensureCtx().decodeAudioData((fr.result as ArrayBuffer).slice(0), function(buf){
      const atDefault = Math.max(0, Math.min(round10(pv.t), Math.max(0, totalDur() - 0.5)));
      op(function(){
        const t: AudioTrack = { id: ++app.trackIdc, name: "Voiceover", file: file, buffer: buf, dur: buf.duration,
                  start: 0, end: buf.duration, at: atDefault, lane: nextLane() };
        app.tracks.push(t); app.selTrackId = t.id;
      });
      refreshAudioUI(); invalidateResult();
    }, function(){ $("musicDur").textContent = "Couldn't decode the recording — try again."; });
  };
  fr.readAsArrayBuffer(file);
}

function addAudioFiles(list: FileList): void {
  Array.from(list).filter(function(f){ return /^audio\//.test(f.type); }).forEach(function(file){
    const fr = new FileReader();
    fr.onload = function(){
      ensureCtx().decodeAudioData((fr.result as ArrayBuffer).slice(0), function(buf){
        const atDefault = Math.max(0, Math.min(round10(pv.t), Math.max(0, totalDur() - 0.5)));
        op(function(){
          const t: AudioTrack = { id: ++app.trackIdc, name: file.name, file: file, buffer: buf, dur: buf.duration,
                    start: 0, end: buf.duration, at: atDefault, lane: nextLane() };
          app.tracks.push(t); app.selTrackId = t.id;
        });
        refreshAudioUI(); invalidateResult();
      }, function(){ $("musicDur").textContent = "Couldn't read \"" + file.name + "\" — try MP3, M4A, or WAV."; });
    };
    fr.readAsArrayBuffer(file);
  });
}

export function refreshAudioUI(): void {
  if(!app.tracks.length){
    $("musicName").textContent = "No music loaded";
    $("musicDur").textContent = "Drop audio files here, or choose — each file gets its own row on the timeline";
  } else {
    $("musicName").textContent = (app.tracks.length === 1)
      ? app.tracks[0].name
      : app.tracks.length + " audio pieces on the timeline";
    const raw = sndExtent(), vis = Math.min(raw, totalDur());
    $("musicDur").textContent = "audio plays to " + fmtTime(vis) +
      (raw > totalDur() + 0.05 ? " — the rest is cut at the video's end (lengthen clips to hear more)" : "") +
      " · drag blocks to position, edges to trim, ✂ to split";
  }
  renderTimeline();
}
