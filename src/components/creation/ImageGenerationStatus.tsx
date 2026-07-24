"use client";

import { Loader2, CheckCircle2, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  billingLabel,
  canRetry,
  describeStatus,
  isActive,
  type ImageGenerationStatus as Status,
  type StatusTone,
} from "@/lib/image-generation-state";

const TONE_STYLES: Record<StatusTone, string> = {
  info: "border-[#C5BAC4]/35 bg-[#C5BAC4]/8",
  success: "border-[#B3FF00]/35 bg-[#B3FF00]/8",
  error: "border-red-500/35 bg-red-500/10",
  warning: "border-amber-400/35 bg-amber-400/10",
};

const BILLING_TONE: Record<string, string> = {
  not_charged: "text-[#989DAA]",
  charged: "text-[#DEDCDC]",
  refund_pending: "text-amber-300",
  refunded: "text-[#B3FF00]",
  refund_failed: "text-red-300",
};

function ToneIcon({ status }: { status: Status }) {
  if (isActive(status)) return <Loader2 className="h-5 w-5 animate-spin text-[#C5BAC4]" />;
  switch (status.generationState) {
    case "succeeded":
      return <CheckCircle2 className="h-5 w-5 text-[#B3FF00]" />;
    case "failed":
      return <AlertTriangle className="h-5 w-5 text-red-400" />;
    case "timed_out":
      return <Clock className="h-5 w-5 text-amber-300" />;
    default:
      return null;
  }
}

interface ImageGenerationStatusProps {
  status: Status;
  onRetry: () => void;
}

/**
 * Persistent, non-blocking in-page status surface for image generation.
 * Renders the unified generation/billing/retry contract (Slice 3). Never a
 * dialog — the panel stays visible so the user always knows what is happening,
 * whether they were charged/refunded, and whether retry is safe.
 */
export function ImageGenerationStatus({ status, onRetry }: ImageGenerationStatusProps) {
  if (status.generationState === "idle") return null;

  const { title, detail, tone } = describeStatus(status);
  const billing = billingLabel(status);
  const showRetry = canRetry(status);

  return (
    <div
      role="status"
      aria-live="polite"
      data-generation-state={status.generationState}
      data-billing-state={status.billingState}
      data-retry-state={status.retryState}
      className={cn(
        "rounded-xl border p-4 shadow-lg flex items-start gap-3 animate-in fade-in-50",
        TONE_STYLES[tone],
      )}
    >
      <div className="mt-0.5 shrink-0">
        <ToneIcon status={status} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[#DEDCDC]">{title}</p>
        <p className="text-xs text-[#989DAA] mt-1 leading-relaxed break-words">{detail}</p>
        {billing && (
          <p className={cn("text-[11px] font-bold mt-2", BILLING_TONE[status.billingState])}>
            {billing}
          </p>
        )}
      </div>
      {showRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="shrink-0 h-8 text-xs bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/30 hover:border-[#C5BAC4] rounded-lg"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      )}
    </div>
  );
}
