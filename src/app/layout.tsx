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
  title: "Sarvekshan | School repair evidence",
  description:
    "A public evidence and operations platform connecting school conditions, repair work, costs, and long-term follow-up checks.",
  applicationName: "Sarvekshan",
  keywords: ["school repairs", "public infrastructure", "field evidence", "repair monitoring"],
  manifest: "/manifest.webmanifest",
  // without this the browser falls back to requesting /favicon.ico, which this
  // app does not have — the icon has been an SVG since the design system landed
  icons: { icon: "/icon.svg" },
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
