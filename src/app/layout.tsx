import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { SyncAgent } from "@/components/SyncAgent";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrument = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sarvekshan",
  description: "School audit — what the records claim, and what the building looks like",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#2B5CFF",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${instrument.variable} h-full`}
    >
      <body className="min-h-full bg-canvas text-ink">
        {children}
        <SyncAgent />
      </body>
    </html>
  );
}
