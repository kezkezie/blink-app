"use client";

import { use } from "react";
import { XrayEditor } from "@/components/studio/library/XrayEditor";

// Edit with AI in the studio look (2026-10-11). The classic X-ray page stays at /dashboard/content/[id]/edit.
export default function EditWithAiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <XrayEditor id={id} />;
}
