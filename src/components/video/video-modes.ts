import { UserCircle, ShoppingBag, Shirt, Clapperboard, Zap } from "lucide-react";

// The five Video Studio styles. Shared by the classic page and the new studio.
export const VIDEO_MODES = [
  {
    id: "ugc",
    title: "UGC Product Review",
    icon: UserCircle,
    desc: "AI influencer talks about your product.",
    primaryLabel: "Product Image",
    secondaryLabel: "Influencer Face (Optional)",
  },
  {
    id: "showcase",
    title: "Cinematic Showcase",
    icon: ShoppingBag,
    desc: "Dynamic camera pans around your product.",
    primaryLabel: "Product Image",
    secondaryLabel: null,
  },
  {
    id: "clothing",
    title: "AI Clothing Try-On",
    icon: Shirt,
    desc: "Put your garments on an AI model.",
    primaryLabel: "Garment Image",
    secondaryLabel: "Model Image",
  },
  {
    id: "logo_reveal",
    title: "Product Reveal",
    icon: Zap,
    desc: "Dynamic 3D motion graphics for your product.",
    primaryLabel: "Product Image (PNG)",
    secondaryLabel: null,
  },
  {
    id: "storytelling",
    title: "Storytelling B-Roll",
    icon: Clapperboard,
    desc: "Multi-scene cinematic sequence for your brand.",
    primaryLabel: null,
    secondaryLabel: null,
  },
];

export type VideoModeConfig = (typeof VIDEO_MODES)[number];
