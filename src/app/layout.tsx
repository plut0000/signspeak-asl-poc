import type { Metadata, Viewport } from "next";
import { Archivo, Spectral_SC } from "next/font/google";
import "./globals.css";

/** One family for poster headlines (narrowest width) and UI copy (normal width). */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
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
  themeColor: "#0672e1",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${spectralSc.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
