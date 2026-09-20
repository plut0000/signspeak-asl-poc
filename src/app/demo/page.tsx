import { SignStudio } from "@/components/sign-studio";
import { SiteHeader } from "@/components/site-header";
import { isMockMode } from "@/lib/gemini";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Camera demo — SignSpeak",
  description:
    "Record ASL on your webcam, get an English translation, and hear it spoken.",
};

export default function DemoPage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-primary">Live demo</p>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              Sign, then listen
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Allow the camera, tap Start signing, and keep your hands in the
              frame. Unmute your device so the English translation can be spoken
              automatically.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Back to overview
          </Link>
        </div>
        <SignStudio mode={isMockMode() ? "mock" : "live"} />
      </main>
      <footer className="border-t border-border/70 py-6 text-center text-xs text-muted-foreground">
        Unmute speakers · Keep hands in frame · Feasibility demo, not a certified interpreter
      </footer>
    </div>
  );
}
