"use client";

import { use } from "react";
import { PostDetail } from "@/components/studio/library/PostDetail";

// A post in the studio look (2026-10-11). The classic page stays at /dashboard/content/[id].
export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PostDetail id={id} />;
}
