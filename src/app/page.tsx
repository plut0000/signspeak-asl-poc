import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RECORD_SECONDS } from "@/lib/media";
import { Camera, Hand, Volume2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "SignSpeak — ASL to spoken English",
  description:
    "DECA EIP proof of concept: sign in American Sign Language on camera, get English text from Gemini, and hear it spoken aloud.",
};

const steps = [
  {
    icon: Camera,
    title: "Sign on camera",
    body: `Allow the webcam, then record a short phrase in American Sign Language. The clip auto-stops after ${RECORD_SECONDS} seconds.`,
  },
  {
    icon: Hand,
    title: "Gemini reads the signing",
    body: "The short video is sent to Google Gemini, which returns a concise English translation — or says the signing was unclear.",
  },
  {
    icon: Volume2,
    title: "The site speaks English",
    body: "Your browser’s built-in speech engine reads the translation aloud. Replay it any time with one tap.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-4 py-10 sm:px-6 sm:py-16">
        <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-6">
            <p className="text-sm font-medium tracking-wide text-primary uppercase">
              DECA Entrepreneurship Innovation Plan
            </p>
            <h1 className="font-heading max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Sign in ASL. Read English. Hear it spoken.
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              SignSpeak is a feasibility demo: someone signs a sentence on
              camera, Gemini interprets that signing as English text, and the
              site speaks the text aloud. It is a student proof of concept, not
              a certified interpreter or production recognizer.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-5 text-base">
                <Link href="/demo">Open the camera demo</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-5 text-base">
                <Link href="#how-it-works">How it works</Link>
              </Button>
            </div>
          </div>

          <Card className="bg-card/80">
            <CardHeader>
              <CardTitle>What judges will see</CardTitle>
              <CardDescription>
                One loop, from webcam to spoken English.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6">
              <p>
                1. Grant camera access and watch the live preview.
              </p>
              <p>
                2. Tap <span className="font-medium text-foreground">Start signing</span>,
                sign for a few seconds, then stop.
              </p>
              <p>
                3. English text appears. The browser automatically speaks it.
              </p>
              <p className="text-muted-foreground">
                No Gemini key? The demo still runs in labeled mock mode with a
                sample sentence, so the UX can be walked through without an
                account.
              </p>
            </CardContent>
          </Card>
        </section>

        <section id="how-it-works" className="space-y-6">
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              How the proof of concept works
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              The capture, translation, and voice steps are split on purpose so
              a DECA presentation can pause on each one.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <Card key={step.title} className="bg-card/80">
                <CardHeader>
                  <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <step.icon className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle>
                    <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                    {step.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6">
                    {step.body}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border/80 bg-card/60 p-6 sm:p-8">
          <h2 className="font-heading text-xl font-semibold tracking-tight">
            Honest limits
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
            Gemini is a general multimodal model, not an ASL expert system.
            Accuracy varies with lighting, camera angle, signing speed, and
            whether the signs are common. This app is meant to prove the product
            idea is demoable: camera in, English out, voice out — with a free
            Gemini key and the browser’s Web Speech API. It is not a substitute
            for a human interpreter.
          </p>
        </section>
      </main>
      <footer className="border-t border-border/70 py-6 text-center text-xs text-muted-foreground">
        SignSpeak · DECA EIP feasibility demo · No accounts, no database
      </footer>
    </div>
  );
}
