import { GlossSpecimen } from "@/components/gloss-specimen";
import { PatchNotes } from "@/components/patch-notes";
import { SignSpeakMark } from "@/components/signspeak-mark";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { RECORD_SECONDS } from "@/lib/media";
import { PATCH_NOTES } from "@/lib/patch-notes";
import { Volume2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "SignSpeak — ASL to spoken English",
  description:
    "DECA EIP proof of concept: sign in American Sign Language on camera, get English from a dedicated BiLSTM plus Gemini cleanup, and hear it spoken aloud.",
};

/** The pipeline, as the tiers a sign-language annotator would recognize. */
const tiers = [
  {
    name: "Sign",
    sample: <SignSpeakMark className="size-7 text-chalk" />,
    body: `Allow the webcam and sign a short phrase. Recording stops on its own after ${RECORD_SECONDS} seconds.`,
    detail:
      "MediaPipe Pose and Hands track 75 body and hand points in the browser, live on the preview.",
  },
  {
    name: "Gloss",
    sample: <span className="gloss text-xl text-chalk">hello</span>,
    body: "A dedicated model reads the sign and names it. Pause for half a second between signs and it reads several, one by one.",
    detail:
      "200-class ASL Citizen BiLSTM on the server, about 90.3% top-1 on its test set.",
  },
  {
    name: "English",
    sample: <span className="text-xl font-extrabold text-chalk">Hello.</span>,
    body: "Gemini turns the glosses into a natural English sentence. Songs and unclear clips go to Gemini as video instead.",
    detail:
      "Without a Gemini key, a confident gloss becomes dictionary English and the video path returns a labeled sample.",
  },
  {
    name: "Voice",
    sample: <Volume2 className="size-6 text-signal" aria-hidden="true" />,
    body: "Your browser reads the sentence aloud. Replay it as often as you like.",
    detail: "Built-in Web Speech API. No paid text-to-speech, no account.",
  },
];

const limits = [
  {
    lead: "200 signs, read one at a time.",
    body: "The dedicated model is an RL-fine-tuned ASL Citizen BiLSTM, about 90.3% top-1 on its test set. Pause between vocabulary signs and it can read a short phrase. Fluent signing, songs and conversation go to Gemini video.",
  },
  {
    lead: "Gemini is the safety net.",
    body: "When the model is unsure or hand tracking fails, Gemini reads the full video instead of the app guessing a sign.",
  },
  {
    lead: "A webcam is harder than a studio.",
    body: "Accuracy changes with lighting, camera angle and how closely live MediaPipe matches the keypoints the model was trained on.",
  },
  {
    lead: "Not an interpreter.",
    body: "This proves the product loop can be demonstrated. It is not a substitute for a human interpreter.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-24">
          <GlossSpecimen />

          <div className="mt-14 grid gap-8 border-t border-rule pt-8 sm:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <h1 className="max-w-[16ch] text-4xl leading-[1.1] font-bold tracking-tight text-balance sm:text-5xl">
              Sign in ASL. Read it in English. Hear it spoken.
            </h1>
            <div className="space-y-6">
              <p className="max-w-[56ch] text-lg leading-relaxed text-mist">
                SignSpeak is a student proof of concept for a DECA
                Entrepreneurship Innovation Plan. Sign one word, or a few with a
                short pause after each, and a model trained on 200 ASL signs
                reads them. Gemini writes the English and your browser says it
                out loud.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-full px-6 text-base font-bold"
                >
                  <Link href="/demo">Open the camera demo</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="h-12 rounded-full px-5 text-base text-chalk"
                >
                  <Link href="#how-it-works">How it works</Link>
                </Button>
              </div>
              <p className="max-w-[56ch] text-sm leading-6 text-mist">
                No Gemini key? The demo still runs, in a labeled sample mode,
                so every step can be walked through without an account.
              </p>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="scroll-mt-6 border-t border-rule bg-panel/40"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] lg:gap-16">
            <div className="space-y-3">
              <h2 id="how-heading" className="text-3xl font-bold tracking-tight">
                How it works
              </h2>
              <p className="max-w-[40ch] leading-relaxed text-mist">
                Each step is separate on purpose, so a presentation can pause
                on any one of them.
              </p>
            </div>
            <ol className="border-t border-rule">
              {tiers.map((tier) => (
                <li
                  key={tier.name}
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-5 gap-y-2 border-b border-rule py-6 sm:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,15rem)] sm:gap-x-8"
                >
                  <div className="row-span-2 space-y-2 sm:row-span-1">
                    <h3 className="text-sm font-bold text-mist">{tier.name}</h3>
                    <div className="flex h-8 items-center">{tier.sample}</div>
                  </div>
                  <p className="max-w-[46ch] text-lg leading-relaxed text-chalk">
                    {tier.body}
                  </p>
                  <p className="text-sm leading-6 text-mist">{tier.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="limits-heading" className="border-t border-rule">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] lg:gap-16">
            <h2 id="limits-heading" className="text-3xl font-bold tracking-tight">
              Honest limits
            </h2>
            <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {limits.map((limit) => (
                <li key={limit.lead} className="space-y-2">
                  <p className="font-bold text-chalk">{limit.lead}</p>
                  <p className="max-w-[44ch] leading-relaxed text-mist">
                    {limit.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="notes-heading" className="border-t border-rule">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] lg:gap-16">
            <h2 id="notes-heading" className="text-3xl font-bold tracking-tight">
              {PATCH_NOTES.title}
            </h2>
            <PatchNotes />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
