import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PostHogProvider } from '@/providers/PostHogProvider';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BlinkSpot — AI Social Media OS for Creators & Agencies",
  description: "BlinkSpot is the AI-powered social media operating system that generates brand-consistent images, videos, and captions — then schedules and publishes them automatically.",
  keywords: ["social media AI", "content automation", "AI video generator", "brand content", "social media scheduler", "AI image generator", "agency social media tool"],
  authors: [{ name: "BlinkSpot", url: "https://www.blinkspot.io" }],
  metadataBase: new URL("https://www.blinkspot.io"),
  openGraph: {
    title: "BlinkSpot — AI Social Media OS for Creators & Agencies",
    description: "Generate brand-consistent images, videos, and captions. Schedule and publish automatically across every platform.",
    url: "https://www.blinkspot.io",
    siteName: "BlinkSpot",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "BlinkSpot — AI Social Media OS" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BlinkSpot — AI Social Media OS",
    description: "Generate brand-consistent content and publish it automatically across every platform.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  icons: {
    icon: "/bs.png",
    apple: "/bs.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>

      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#191D23] text-[#DEDCDC] selection:bg-[#C5BAC4] selection:text-[#191D23]`}
        suppressHydrationWarning
      >
        <PostHogProvider>
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}