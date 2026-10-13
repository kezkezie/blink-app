"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Maximize2, X } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../Modal";
import { imageUpscaleCredits, videoUpscaleCredits, type UpscaleImageFactor, type UpscaleVideoTarget } from "@/lib/upscale";

type Job = { id: string; state: "running" | "done" | "failed"; kind: "image" | "video"; credits: number; contentId: string | null; error: string | null };

/**
 * Upscale a Library post (2026-10-13): pictures 2x or 4x, videos to 1080p or 4K. Prices come from
 * the real size or length (the server checks them again and charges); the sharper copy is a new
 * post, the original stays as it is.
 */
export function UpscaleButton({ contentId, mediaUrl, isVideo }: { contentId: string; mediaUrl: string; isVideo: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const poll = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => setSeconds(Number.isFinite(v.duration) ? v.duration : null);
      v.src = mediaUrl;
    } else {
      const img = new window.Image();
      img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = mediaUrl;
    }
  }, [open, isVideo, mediaUrl]);
  useEffect(() => () => { if (poll.current) window.clearInterval(poll.current); }, []);

  function finish(j: Job) {
    if (poll.current) { window.clearInterval(poll.current); poll.current = null; }
    setBusy(null);
    if (j.state === "done" && j.contentId) {
      toast.success(`Upscaled · ${j.credits} credits. It's a new post in your Library.`, { duration: 8000 });
      setOpen(false);
      router.push(`/studio/library/${j.contentId}`);
    } else if (j.state === "failed") toast.error(j.error || "The upscale didn't work. Your credits were refunded.", { duration: 10000 });
  }

  async function start(choice: { factor?: UpscaleImageFactor; target?: UpscaleVideoTarget }) {
    setBusy(choice.factor ? `x${choice.factor}` : String(choice.target));
    try {
      const res = await fetch("/api/upscale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentId, ...choice }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't start the upscale.");
      setJob(data);
      if (data.state !== "running") { finish(data); return; }
      poll.current = window.setInterval(async () => {
        const r = await fetch(`/api/upscale?job=${data.id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
        if (r && r.state !== "running") finish(r);
      }, 4000);
    } catch (e) {
      setBusy(null);
      toast.error(e instanceof Error ? e.message : "Couldn't start the upscale.");
    }
  }

  const running = !!busy;
  const options = isVideo
    ? ([["1080p", "1080p", "Sharp for every feed"], ["4k", "4K", "For big screens and ads"]] as const).map(([target, label, line]) => ({
      key: target, label, line, credits: seconds ? videoUpscaleCredits(seconds, target) : null, go: () => start({ target }),
    }))
    : ([[2, "2×", "Crisp for print and big posts"], [4, "4×", "Posters and billboards"]] as const).map(([factor, label, line]) => ({
      key: `x${factor}`, label, line, credits: size ? imageUpscaleCredits(size.w, size.h, factor) : null, go: () => start({ factor }),
    }));

  return (
    <>
      <button className="s-btn sm" onClick={() => setOpen(true)}><Maximize2 className="h-3.5 w-3.5" /> Upscale</button>
      <Modal open={open} onClose={() => { if (!running) setOpen(false); }} label="Upscale" width={460}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--s-line)" }}>
          <div>
            <b className="text-[15px]">Upscale this {isVideo ? "video" : "picture"}</b>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--s-mute)" }}>
              {isVideo ? (seconds ? `${Math.round(seconds)} s long` : "Reading the video…") : size ? `${size.w} × ${size.h} now` : "Reading the picture…"}. You get a sharper copy as a new post; this one stays.
            </p>
          </div>
          <button className="s-btn ghost sm" disabled={running} onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 grid gap-2">
          {options.map((o) => (
            <button key={o.key} className="s-btn justify-between h-auto py-2.5" disabled={running || o.credits === null} onClick={o.go} aria-label={`Upscale ${o.label}`}>
              <span className="grid text-left">
                <b className="flex items-center gap-2">{busy === o.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{o.label}</b>
                <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>{o.credits === null && (size || seconds) ? (isVideo ? "Too long for this size" : "Too big at this size") : o.line}</span>
              </span>
              <span className="cost">{o.credits === null ? "" : `${o.credits} cr`}</span>
            </button>
          ))}
          {running && (
            <p className="text-[12.5px]" role="status" style={{ color: "var(--s-soft)" }}>
              {isVideo ? "Upscaling the video: usually 1 to 3 minutes. You can leave this page; it lands in your Library." : "Upscaling: usually under a minute."}
            </p>
          )}
          {job?.state === "failed" && <p className="text-[12.5px]" style={{ color: "var(--s-danger)" }}>{job.error}</p>}
          <p className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Topaz upscaling. If it fails, the credits come back automatically.</p>
        </div>
      </Modal>
    </>
  );
}
