import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["http://72.61.194.197:3001", "http://72.61.194.197:3000"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "tempfile.aiquickdraw.com" },
      { protocol: "https", hostname: "hzkufspjozkgmloznkvp.supabase.co" },
    ],
  },
};

export default nextConfig;
