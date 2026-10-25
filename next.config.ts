import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PostHog through our own domain (2026-10-20), so ad blockers don't drop the analytics.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  skipTrailingSlashRedirect: true,
  // The stamp on free accounts' videos (2026-10-25) runs ffmpeg in /api/stamp only: the binary is
  // loaded from node_modules at run time and shipped with that one function.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: { "/api/stamp": ["./node_modules/ffmpeg-static/ffmpeg"] },
  allowedDevOrigins: ["http://72.61.194.197:3001", "http://72.61.194.197:3000"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "tempfile.aiquickdraw.com" },
      { protocol: "https", hostname: "hzkufspjozkgmloznkvp.supabase.co" },
    ],
  },
};

export default nextConfig;
