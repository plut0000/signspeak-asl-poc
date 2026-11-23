import { PatchNotes } from "@/components/patch-notes";
import { SignStudio } from "@/components/sign-studio";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isMockMode } from "@/lib/gemini";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Camera demo — SignSpeak",
  description:
    "Record ASL on your webcam, get an English translation, and hear it spoken.",
};

export default function DemoPage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-14 sm:px-6 sm:pt-9">
        <div className="mb-8 grid gap-3 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:items-end lg:gap-10">
          <h1 className="poster text-[clamp(3.25rem,6vw,5rem)]">
            Sign, then listen
          </h1>
          <p className="max-w-[50ch] text-lg leading-relaxed font-medium">
            Sign one word from the 200-sign vocabulary, like hello or lunch,
            or several with a short pause after each. Songs and conversation
            go to Gemini video.
          </p>
        </div>
        <SignStudio mode={isMockMode() ? "mock" : "live"} />
        <div className="mt-14">
          <PatchNotes compact />
        </div>
      </main>
      <SiteFooter note="A feasibility demo, not a certified interpreter." />
    </div>
  );
}
