"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen, ImagePlus, Loader2, Mic, Music, Square, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { allowedDurationsFor, estimateVideoCredits } from "@/lib/video-model-registry";
import type { VideoStudio } from "@/components/video/useVideoStudio";
import { ImagePicker } from "../ImagePicker";
import { formatCredits } from "../hooks";

/**
 * Lip-sync: a face + a voice → the face speaks the voice. Same workflow call as the classic Upload →
 * Audio to Video tab (/api/video/nano-banana, video_mode "audio_to_video"), with a native layout,
 * voice recording in the browser (saved as WAV so every engine accepts it), and the length set from
 * the voice. Progress then shows in Video Studio's Render step.
 */

const ENGINES = [
  { id: "kling-3.0/video", label: "Best", hint: "Kling 3.0 · most natural mouth movement", needsFace: true },
  { id: "bytedance/seedance-2", label: "Good", hint: "Seedance 2 · cinematic", needsFace: true },
  { id: "replicate:prunaai/p-video", label: "Fast", hint: "Pruna · quick drafts", needsFace: false },
] as const;
type EngineId = (typeof ENGINES)[number]["id"];

/** Encode decoded audio as a 16-bit mono WAV (universally accepted by the lip-sync engines). */
function toWav(buffer: AudioBuffer) {
  const rate = buffer.sampleRate;
  const data = buffer.numberOfChannels > 1
    ? buffer.getChannelData(0).map((v, i) => (v + buffer.getChannelData(1)[i]) / 2)
    : buffer.getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); out.setUint32(4, 36 + data.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return new Blob([out], { type: "audio/wav" });
}

export function LipSyncSetup({ v }: { v: VideoStudio }) {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const [face, setFace] = useState<{ file?: File; url: string } | null>(null);
  const [voice, setVoice] = useState<{ blob: Blob; url: string; seconds: number; name: string } | null>(null);
  const [scene, setScene] = useState("");
  const [engine, setEngine] = useState<EngineId>("kling-3.0/video");
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const faceRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const rec = useRef<{ r: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null);

  const allowed = allowedDurationsFor(engine).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  const seconds = voice ? (allowed.find((d) => d >= Math.ceil(voice.seconds)) ?? allowed[allowed.length - 1] ?? 5) : (allowed[0] ?? 5);
  const tooLong = !!voice && allowed.length > 0 && voice.seconds > allowed[allowed.length - 1];
  const cost = estimateVideoCredits(engine, seconds, { hasAudio: true, videoMode: "audio_to_video", hasStartFrame: !!face }) ?? 0;
  const needsFace = ENGINES.find((e) => e.id === engine)!.needsFace;
  const ready = !!voice && scene.trim().length > 3 && (!needsFace || !!face) && !tooLong;

  useEffect(() => {
    if (!recording) return;
    const t0 = Date.now();
    const t = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); setRecSeconds(s); if (s >= 60) rec.current?.r.stop(); }, 250);
    return () => { clearInterval(t); setRecSeconds(0); };
  }, [recording]);

  async function loadAudio(blob: Blob, name: string) {
    try {
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      void ctx.close();
      // Recordings (webm/mp4) become WAV; uploaded mp3/wav files are kept as they are.
      const keep = /audio\/(mpeg|mp3|wav|x-wav)/.test(blob.type);
      const finalBlob = keep ? blob : toWav(decoded);
      setVoice({ blob: finalBlob, url: URL.createObjectURL(finalBlob), seconds: decoded.duration, name });
    } catch {
      toast.error("Couldn't read that audio. Try an MP3 or WAV file.");
    }
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        void loadAudio(new Blob(chunks, { type: r.mimeType || "audio/webm" }), "Your recording");
      };
      rec.current = { r, stream, chunks };
      r.start(250);
      setRecording(true);
    } catch {
      toast.error("Microphone access was blocked. Allow it in the address bar, or upload an audio file.");
    }
  }

  async function upload(blob: Blob, path: string) {
    const { error } = await supabase.storage.from("assets").upload(path, blob, { contentType: blob.type || undefined });
    if (error) throw new Error("Upload failed. Please try again.");
    return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
  }

  async function render() {
    if (!ready || !clientId || !activeBrand || !voice) return;
    setBusy(true);
    try {
      const ext = voice.blob.type.includes("wav") ? "wav" : voice.blob.type.includes("mpeg") ? "mp3" : "m4a";
      const audioUrl = await upload(voice.blob, `videos/${activeBrand.id}/lipsync_audio_${Date.now()}.${ext}`);
      let faceUrl: string | null = face?.url && !face.file ? face.url : null;
      if (face?.file) faceUrl = await upload(face.file, `videos/${activeBrand.id}/lipsync_face_${Date.now()}.${face.file.name.split(".").pop() || "jpg"}`);
      const { data: row, error } = await supabase.from("content").insert({
        client_id: clientId, brand_id: activeBrand.id, content_type: "sequence_clip", caption: `Lip-sync: ${scene.slice(0, 80)}`,
        // The face goes in reference_image_url: Render treats image_urls as the finished video.
        status: "draft", image_urls: [], reference_image_url: faceUrl, ai_model: engine, generation_status_text: "Getting the voice ready…",
      }).select("id").single();
      if (error) throw error;
      const res = await fetch("/api/video/nano-banana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "scene_video_generator", post_id: row.id, client_id: clientId, brand_id: activeBrand.id,
          primary_image_url: faceUrl, user_prompt: scene.trim(), duration: String(seconds), video_mode: "audio_to_video", ai_model_override: engine,
          scene_data: { ai_enhance: v.aiEnhance, audio: { audio_url: audioUrl } },
        }),
      });
      if (!res.ok) throw new Error("The lip-sync engine didn't accept the job. No credits were taken.");
      // Hand over to the Render step, which follows the job live.
      v.setGeneratingPostId(row.id);
      v.setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lip-sync failed to start.");
    } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
      {/* face */}
      <div className="s-card p-3 grid gap-2 content-start">
        <div className="flex items-center justify-between"><b className="text-[13px]">1 · The face</b>{needsFace && !face && <span className="s-badge warn">NEEDED</span>}</div>
        {face ? (
          <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "4 / 5" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={face.url} alt="The face" className="w-full h-full object-cover" />
            <button className="s-btn sm absolute top-2 right-2" onClick={() => setFace(null)}><X className="h-3.5 w-3.5" /> Change</button>
          </div>
        ) : (
          <>
            <button className="s-drop rounded-xl grid place-items-center text-center p-4" style={{ aspectRatio: "4 / 5" }} onClick={() => faceRef.current?.click()}>
              <span className="grid place-items-center gap-1.5">
                <ImagePlus className="h-6 w-6" style={{ color: "var(--s-accent)" }} />
                <b className="text-[13px] font-medium">Upload a photo of the face</b>
                <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Front-facing, mouth visible, good light.</span>
              </span>
            </button>
            <button className="s-btn ghost sm" onClick={() => setPicking(true)}><FolderOpen className="h-3.5 w-3.5" /> From my Library</button>
          </>
        )}
        <input ref={faceRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFace({ file: f, url: URL.createObjectURL(f) }); e.target.value = ""; }} />
      </div>

      {/* voice + scene */}
      <div className="grid gap-3 content-start">
        <div className="s-card p-3 grid gap-2">
          <b className="text-[13px]">2 · The voice</b>
          {voice ? (
            <div className="grid gap-2">
              <audio src={voice.url} controls className="w-full" />
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--s-soft)" }}>
                <span>{voice.name} · {voice.seconds.toFixed(1)} s</span>
                <button className="s-btn ghost sm" onClick={() => setVoice(null)}><X className="h-3.5 w-3.5" /> Replace</button>
              </div>
              {tooLong && <p className="text-xs" style={{ color: "var(--s-warn)" }}>This engine makes up to {allowed[allowed.length - 1]} s. Trim the voice or pick another quality.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button className="s-drop rounded-xl grid place-items-center gap-1 p-4" onClick={() => (recording ? rec.current?.r.stop() : void startRec())}
                style={recording ? { borderColor: "var(--s-danger)", color: "var(--s-danger)" } : undefined}>
                {recording ? <Square className="h-5 w-5" fill="currentColor" /> : <Mic className="h-5 w-5" style={{ color: "var(--s-accent)" }} />}
                <b className="text-[13px] font-medium">{recording ? `Stop · ${recSeconds}s` : "Record my voice"}</b>
                <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>{recording ? "Speak now" : "Up to 60 s"}</span>
              </button>
              <button className="s-drop rounded-xl grid place-items-center gap-1 p-4" onClick={() => audioRef.current?.click()}>
                <Music className="h-5 w-5" />
                <b className="text-[13px] font-medium">Upload audio</b>
                <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>MP3, WAV or M4A</span>
              </button>
            </div>
          )}
          <input ref={audioRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadAudio(f, f.name); e.target.value = ""; }} />
        </div>
        <div className="s-card p-3 grid gap-2">
          <b className="text-[13px]">3 · What&apos;s happening</b>
          <textarea className="s-input" rows={4} value={scene} onChange={(e) => setScene(e.target.value)} placeholder="Who is speaking and where? e.g. a friendly chef in a bright kitchen, talking to the camera, warm light" aria-label="What's happening" />
          <div className="flex flex-wrap gap-1.5">
            {["Talking to camera in a bright studio", "Selfie video in a car", "Presenter at a desk, soft light", "Walking down a city street"].map((ex) => (
              <button key={ex} className="s-chip" onClick={() => setScene(ex)}>{ex}</button>
            ))}
          </div>
        </div>
      </div>

      {/* quality + render */}
      <aside className="s-card p-3 grid gap-3 content-start">
        <b className="text-[13px]">Quality</b>
        <div className="grid gap-1.5">
          {ENGINES.map((e) => {
            const s = voice ? (allowedDurationsFor(e.id).map(Number).sort((a, b) => a - b).find((d) => d >= Math.ceil(voice.seconds)) ?? 5) : 5;
            return (
              <button key={e.id} onClick={() => setEngine(e.id)} className="grid grid-cols-[1fr_auto] text-left px-3 py-2.5 rounded-[10px]"
                style={{ border: `1px solid ${engine === e.id ? "var(--s-accent)" : "var(--s-line-2)"}`, background: engine === e.id ? "color-mix(in oklab, var(--s-accent) 6%, var(--s-bg))" : "var(--s-bg)" }}>
                <b className="text-[13px]">{e.label}</b>
                <span className="text-xs mono">{formatCredits(estimateVideoCredits(e.id, s, { hasAudio: true, videoMode: "audio_to_video", hasStartFrame: true }))} cr</span>
                <span className="text-[11px] col-span-2" style={{ color: "var(--s-mute)" }}>{e.hint}</span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-xs" style={{ color: "var(--s-soft)" }}><span>Length</span><span className="mono">{seconds} s{voice ? " (fits your voice)" : ""}</span></div>
        <button className="s-btn primary lg w-full" disabled={!ready || busy} onClick={render}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</> : <>Make it talk <span className="cost">{formatCredits(cost)} cr</span></>}
        </button>
        <p className="text-[11px]" style={{ color: "var(--s-mute)" }}>
          {!voice ? "Add a voice to continue." : needsFace && !face ? "Add a photo of the face to continue." : scene.trim().length <= 3 ? "Say what's happening to continue." : "Charged when the render starts. Failed renders are refunded."}
        </p>
      </aside>

      {picking && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,.6)" }} onClick={() => setPicking(false)}>
          <div className="s-card p-4 w-full max-w-[860px] max-h-[80dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><b className="text-sm">Pick the face</b><button className="s-btn ghost sm" onClick={() => setPicking(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
            <ImagePicker allowUpload={false} onPick={(p) => { setFace({ url: p.url }); setPicking(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}
