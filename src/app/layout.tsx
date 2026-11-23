import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Spectral_SC } from "next/font/google";
import "./globals.css";

/** Braille Institute's legibility face: UI copy and the spoken English. */
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
  // next/font has no fallback metrics for this family yet.
  adjustFontFallback: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

/** True small caps for ASL gloss notation only. */
const spectralSc = Spectral_SC({
  variable: "--font-spectral-sc",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "SignSpeak — ASL to spoken English",
    template: "%s · SignSpeak",
  },
  description:
    "DECA EIP proof of concept that turns American Sign Language on camera into English text and spoken voice.",
};

export const viewport: Viewport = {
  themeColor: "#1d1b34",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${atkinson.variable} ${spectralSc.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
