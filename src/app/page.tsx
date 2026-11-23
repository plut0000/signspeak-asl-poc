import { PatchNotes } from "@/components/patch-notes";
import { PostcardHero } from "@/components/postcard-hero";
import { SignSpeakMark } from "@/components/signspeak-mark";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { RECORD_SECONDS } from "@/lib/media";
import { DEMO_VERSION, PATCH_NOTES } from "@/lib/patch-notes";
import { Camera, Volume2 } from "lucide-react";
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
    sample: <SignSpeakMark className="size-8 text-postcard" />,
    body: `Allow the webcam and sign a short phrase. Recording stops on its own after ${RECORD_SECONDS} seconds.`,
    detail:
      "MediaPipe Pose and Hands track 75 body and hand points in the browser, live on the preview.",
  },
  {
    name: "Gloss",
    sample: <span className="gloss text-xl">hello</span>,
    body: "A dedicated model reads the sign and names it. Pause for half a second between signs and it reads several, one by one.",
    detail:
      "200-class ASL Citizen BiLSTM on the server, about 90.3% top-1 on its test set.",
  },
  {
    name: "English",
    sample: <span className="condensed text-2xl font-extrabold">Hello.</span>,
    body: "Gemini turns the glosses into a natural English sentence. Songs and unclear clips go to Gemini as video instead.",
    detail:
      "Without a Gemini key, a confident gloss becomes dictionary English and the video path returns a labeled sample.",
  },
  {
    name: "Voice",
    sample: <Volume2 className="size-7 text-postcard" aria-hidden="true" />,
    body: "Your browser reads the sentence aloud. Replay it as often as you like.",
    detail: "Built-in Web Speech API. No paid text-to-speech, no account.",
  },
];

const facts = [
  "Reads 200 ASL signs, one at a time",
  "About 90.3% top-1 on its test set",
  `Records up to ${RECORD_SECONDS} seconds per clip`,
  "No account, no database",
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
        <PostcardHero />

        <div className="side-back">
          <section aria-labelledby="about-heading" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <h2 id="about-heading" className="sr-only">
              About SignSpeak
            </h2>
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_1px_minmax(0,0.85fr)] lg:gap-14">
              <div className="space-y-7">
                <p className="max-w-[34ch] text-2xl leading-snug font-medium sm:text-[1.75rem]">
                  SignSpeak is a student proof of concept for a DECA
                  Entrepreneurship Innovation Plan. Sign one word, or a few with
                  a short pause after each. A model trained on 200 ASL signs
                  reads them, Gemini writes the English, and your browser says
                  it out loud.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="/demo"
                    className="flex w-fit items-center gap-3 rounded-xl bg-postcard py-2 pr-2 pl-5 text-base font-bold text-porcelain transition-colors hover:bg-[color-mix(in_oklab,var(--postcard),var(--ink)_25%)]"
                  >
                    Open the camera demo
                    <span className="flex size-9 items-center justify-center rounded-lg bg-flamingo">
                      <Camera className="size-5 text-ink" aria-hidden="true" />
                    </span>
                  </Link>
                  <Link
                    href="#how-it-works"
                    className="w-fit rounded-md px-2 py-2 font-bold underline decoration-ink/30 decoration-2 underline-offset-[6px] hover:decoration-ink"
                  >
                    How it works
                  </Link>
                </div>
                <p className="max-w-[52ch] text-sm leading-6 text-ink/75">
                  No Gemini key? The demo still runs, in a labeled sample mode,
                  so every step can be walked through without an account.
                </p>
              </div>

              <div aria-hidden="true" className="hidden bg-ink/15 lg:block" />

              <div className="space-y-6">
                <div className="flex justify-end">
                  <div className="stamp w-32 rotate-3">
                    <div className="flex aspect-[4/5] flex-col items-center justify-center gap-1 bg-flamingo text-ink">
                      <SignSpeakMark className="size-14 text-ink [&_circle]:fill-porcelain" />
                      <span className="poster text-3xl">200</span>
                      <span className="text-sm font-bold">signs</span>
                      <span className="text-xs tabular">v{DEMO_VERSION}</span>
                    </div>
                  </div>
                </div>
                <ul aria-label="At a glance" className="border-t border-ink/25">
                  {facts.map((fact) => (
                    <li key={fact} className="border-b border-ink/25 py-3 text-lg font-medium">
                      {fact}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section
            id="how-it-works"
            aria-labelledby="how-heading"
            className="scroll-mt-4 border-t border-ink/15"
          >
            <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] lg:gap-16">
              <div className="space-y-4">
                <h2 id="how-heading" className="poster text-[clamp(3rem,6vw,4.5rem)] text-postcard">
                  How it works
                </h2>
                <p className="max-w-[36ch] leading-relaxed text-ink/80">
                  Each step is separate on purpose, so a presentation can pause
                  on any one of them.
                </p>
              </div>
              <ol className="border-t-2 border-ink">
                {tiers.map((tier) => (
                  <li
                    key={tier.name}
                    className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-5 gap-y-2 border-b border-ink/20 py-6 sm:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,15rem)] sm:gap-x-8"
                  >
                    <div className="row-span-2 space-y-2 sm:row-span-1">
                      <h3 className="text-sm font-bold text-ink/75">{tier.name}</h3>
                      <div className="flex h-9 items-center">{tier.sample}</div>
                    </div>
                    <p className="max-w-[46ch] text-lg leading-relaxed font-medium">
                      {tier.body}
                    </p>
                    <p className="text-sm leading-6 text-ink/75">{tier.detail}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section aria-labelledby="limits-heading" className="border-t border-ink/15">
            <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] lg:gap-16">
              <h2 id="limits-heading" className="poster text-[clamp(3rem,6vw,4.5rem)] text-postcard">
                Honest limits
              </h2>
              <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {limits.map((limit) => (
                  <li key={limit.lead} className="space-y-2 border-t-2 border-ink pt-4">
                    <p className="text-lg font-bold">{limit.lead}</p>
                    <p className="max-w-[44ch] leading-relaxed text-ink/80">
                      {limit.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section aria-labelledby="notes-heading" className="border-t border-ink/15">
            <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] lg:gap-16">
              <h2 id="notes-heading" className="poster text-[clamp(3rem,6vw,4.5rem)] text-postcard">
                {PATCH_NOTES.title}
              </h2>
              <PatchNotes />
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
