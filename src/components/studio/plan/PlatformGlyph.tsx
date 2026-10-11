import { AtSign, Cloud, Facebook, Instagram, Linkedin, Music2, Pin, Twitter, Youtube } from "lucide-react";

const ICON: Record<string, typeof Instagram> = {
  instagram: Instagram, tiktok: Music2, youtube: Youtube, facebook: Facebook, twitter: Twitter, x: Twitter,
  linkedin: Linkedin, pinterest: Pin, threads: AtSign, bluesky: Cloud,
};

/** A small, quiet platform mark for calendars and post pages. */
export function PlatformGlyph({ platform, size = 12 }: { platform: string; size?: number }) {
  const Icon = ICON[platform] ?? AtSign;
  return <Icon style={{ width: size, height: size }} aria-label={platform} />;
}
