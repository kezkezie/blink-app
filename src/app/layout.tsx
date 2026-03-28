import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Blink — Create at the Speed of Light",
  description: "The first social media operating system for modern creators. One workspace, zero friction.",
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
        {children}
      </body>
    </html>
  );
}