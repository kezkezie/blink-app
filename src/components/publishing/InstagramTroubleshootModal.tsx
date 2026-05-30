"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ShieldAlert,
  UserX,
  Link2Off,
  KeyRound,
  ImageOff,
  Maximize2,
  AlignLeft,
  Hash,
  Gauge,
  Clock,
  WifiOff,
  Bot,
  Flag,
  X,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const issues = [
  {
    icon: ShieldAlert,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    title: "Your Instagram account is restricted by Meta",
    body: "Meta can restrict accounts without warning. Posts appear to send from Blink but Meta silently rejects them. Open Instagram → Settings → Account → Account Status. If restricted, tap \"Request Review\" to appeal.",
  },
  {
    icon: Flag,
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
    title: "Crypto or financial content triggered a block",
    body: "Meta has strict rules on financial promotions. Captions mentioning crypto exchanges, trading platforms, or financial CTAs can flag the account — even on organic posts. Avoid terms like \"exchange\", \"trading\", or \"invest\" until the account is cleared through Meta's financial services authorization.",
  },
  {
    icon: UserX,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    title: "Account is a personal profile, not Business or Creator",
    body: "Instagram's API only works with Professional accounts. Personal accounts will appear connected in Blink but posts will never go through. Fix: Instagram → Settings → Account → Switch to Professional Account.",
  },
  {
    icon: Link2Off,
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
    title: "Facebook Page is disconnected or not linked",
    body: "Instagram Business accounts must be connected to a Facebook Page. If the Page was deleted, disconnected, or admin access was lost, publishing stops. Check: Meta Business Suite → Accounts → Instagram.",
  },
  {
    icon: KeyRound,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    title: "Access token expired or permissions were revoked",
    body: "Tokens expire every 60 days. Users can also accidentally revoke app permissions. Fix: go to Blink Settings → Social Accounts → disconnect and reconnect Instagram.",
  },
  {
    icon: ImageOff,
    color: "text-pink-400",
    bg: "bg-pink-500/10 border-pink-500/20",
    title: "Image format is not JPEG",
    body: "Instagram's API only accepts JPEG images. PNG, WebP, and other formats are silently rejected. Blink now converts images automatically, but if you're uploading your own images, make sure they are saved as JPEG before uploading.",
  },
  {
    icon: Maximize2,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20",
    title: "Image dimensions or aspect ratio is wrong",
    body: "Instagram enforces strict specs: aspect ratio must be between 4:5 (portrait) and 1.91:1 (landscape), minimum 320×320px, maximum 1440px wide. Images outside these ranges are rejected.",
  },
  {
    icon: AlignLeft,
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
    title: "Caption is too long",
    body: "Instagram's hard limit is 2,200 characters. Blink trims automatically, but if you paste a very long caption with many hashtags, it may push over the limit.",
  },
  {
    icon: Hash,
    color: "text-indigo-400",
    bg: "bg-indigo-500/10 border-indigo-500/20",
    title: "Too many hashtags",
    body: "Instagram allows a maximum of 30 hashtags per post. More than 30 will cause the post to fail silently. Count your hashtags before publishing.",
  },
  {
    icon: Gauge,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    title: "Daily posting limit reached",
    body: "Instagram's API allows a maximum of 100 published posts per 24-hour rolling window. If multiple accounts are sharing one integration and that limit is hit, all further posts will fail until the window resets.",
  },
  {
    icon: Clock,
    color: "text-teal-400",
    bg: "bg-teal-500/10 border-teal-500/20",
    title: "Media container timed out before publishing",
    body: "Instagram's API uses a two-step process: create a media container, then publish it. Containers expire after 24 hours. If there's a delay between steps, the container expires and the post fails silently.",
  },
  {
    icon: WifiOff,
    color: "text-slate-400",
    bg: "bg-slate-500/10 border-slate-500/20",
    title: "PostForMe (publishing tool) is experiencing an outage",
    body: "When the third-party tool handling API publishing goes down, posts queue up or fail. The post appears sent from Blink but was never delivered to Instagram. Wait for the service to recover and retry.",
  },
  {
    icon: Bot,
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    title: "Account was caught in Meta's AI moderation sweep",
    body: "In 2025, Meta's new AI moderation flagged thousands of accounts overnight — including verified business accounts — with no warning. Accounts in crypto, health, and finance are most at risk. Check the email linked to the Meta account for any notices and appeal through Meta Business Support.",
  },
  {
    icon: AlertTriangle,
    color: "text-orange-300",
    bg: "bg-orange-400/10 border-orange-400/20",
    title: "The connected Facebook Page has its own restrictions",
    body: "If the Facebook Page linked to the Instagram account is restricted (e.g. for advertising violations), API publishing for the connected Instagram account can also be blocked — even if Instagram itself looks fine. Check: Meta Business Suite → Business Account Health.",
  },
];

export function InstagramTroubleshootModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg w-full bg-[#0E1117] border border-[#57707A]/30 rounded-2xl p-0 overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#57707A]/20 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-[#DEDCDC] font-bold text-lg leading-tight">
                Why isn't my post showing on Instagram?
              </DialogTitle>
              <p className="text-[#57707A] text-xs mt-1 font-medium">
                14 possible reasons — work through this list from the top
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-[#57707A] hover:text-[#DEDCDC] transition-colors mt-0.5 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        {/* Scrollable list */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-2.5">
          {issues.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={i}
                className={`flex gap-3 p-3.5 rounded-xl border ${item.bg} transition-all`}
              >
                <div className="shrink-0 mt-0.5">
                  <Icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <div className="space-y-1 min-w-0">
                  <p className="text-[#DEDCDC] text-xs font-bold leading-snug">
                    <span className="text-[#57707A] font-medium mr-1.5">#{i + 1}</span>
                    {item.title}
                  </p>
                  <p className="text-[#989DAA] text-[11px] leading-relaxed">
                    {item.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#57707A]/20 shrink-0 bg-[#0E1117]">
          <Button
            onClick={onClose}
            className="w-full h-10 bg-[#C5BAC4]/10 hover:bg-[#C5BAC4]/20 text-[#C5BAC4] border border-[#C5BAC4]/20 rounded-xl font-bold text-sm transition-colors"
          >
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
