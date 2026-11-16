import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "字卡 · Hanzi Deck",
  description: "Your personal Chinese flashcards with spaced repetition",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#c8372d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Suspense fallback={null}>
          <Nav />
        </Suspense>
        <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-4 pb-28 sm:pb-10">{children}</main>
      </body>
    </html>
  );
}
