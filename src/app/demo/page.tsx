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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-14 sm:px-6 sm:pt-10">
        <div className="mb-8 grid gap-3 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:items-end lg:gap-10">
          <h1 className="text-4xl leading-[1.1] font-bold tracking-tight sm:text-5xl">
            Sign, then listen
          </h1>
          <p className="max-w-[54ch] leading-relaxed text-mist">
            Sign one word from the 200-sign vocabulary, like hello, lunch or
            Coca-Cola, or several with a short pause after each. Songs and
            fluent conversation go to Gemini video instead.
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
