"use client";

import { HandPoster } from "@/components/hand-poster";
import { useSpeech } from "@/hooks/use-speech";
import { ArrowLeft, ArrowRight, Volume2 } from "lucide-react";
import { useState } from "react";

/**
 * Glosses in signed order, all in the dedicated model's 200-sign vocabulary,
 * with the kind of English Gemini writes from them.
 */
const EXAMPLES = [
  { glosses: ["hello", "name", "what"], english: "Hello, what’s your name?" },
  { glosses: ["brother", "deaf"], english: "My brother is Deaf." },
  { glosses: ["lunch", "want"], english: "Do you want lunch?" },
  { glosses: ["rain", "later"], english: "It’s going to rain later." },
] as const;

export function PostcardHero() {
  const [index, setIndex] = useState(0);
  const { speak, speaking, error } = useSpeech();
  const example = EXAMPLES[index];
  const step = (delta: number) =>
    setIndex((current) => (current + delta + EXAMPLES.length) % EXAMPLES.length);

  return (
    <section className="relative overflow-hidden pb-14 sm:pb-20">
      <HandPoster className="pointer-events-none absolute top-6 -right-6 w-[44vw] sm:top-2 sm:w-[40vw] lg:top-auto lg:right-0 lg:bottom-0 lg:w-[min(33vw,30rem)]" />

      <div className="relative mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6 sm:pt-16 lg:pt-20">
        <h1 className="poster text-[min(9.5rem,15vw)] [--indent:0] lg:[--indent:19.5rem]">
          <span className="block">Sign it.</span>
          <span className="block pl-[8vw] lg:pl-(--indent)">Read it.</span>
          <span className="block pl-[16vw] lg:pl-(--indent)">Hear it.</span>
        </h1>

        {/*
          On large screens the card sits in the space the indented lines leave,
          like the story card on a poster; on small screens it follows the
          headline.
        */}
        <div className="mt-8 w-full max-w-[22rem] lg:absolute lg:top-[calc(min(9.5rem,15vw)*0.86+5rem+2.5rem)] lg:left-6 lg:mt-0 lg:w-[17.5rem]">
          <figure
            aria-live="polite"
            className="space-y-3 rounded-xl bg-ink/35 p-5 ring-1 ring-porcelain/25 backdrop-blur-md"
          >
            <p className="text-sm text-glass-text tabular">
              Example {index + 1} of {EXAMPLES.length}
            </p>
            <ol
              aria-label="Signs, in signed order"
              className="gloss flex flex-wrap gap-x-3 text-[1.2rem] leading-tight text-porcelain"
            >
              {example.glosses.map((gloss) => (
                <li key={gloss}>{gloss}</li>
              ))}
            </ol>
            <figcaption className="condensed text-[1.6rem] leading-[1.1] font-extrabold text-porcelain">
              {example.english}
            </figcaption>
            <button
              type="button"
              onClick={() => speak(example.english)}
              disabled={speaking}
              className="flex items-center gap-2 rounded-lg py-1 text-sm font-bold text-porcelain hover:underline hover:underline-offset-4 disabled:opacity-70"
            >
              <Volume2 className="size-4" aria-hidden="true" />
              {speaking ? "Speaking…" : "Hear it"}
            </button>
            {error ? <p className="text-sm text-glass-text">{error}</p> : null}
          </figure>
          <div className="mt-3 flex gap-2">
            <ArrowButton label="Previous example" onClick={() => step(-1)}>
              <ArrowLeft className="size-5" aria-hidden="true" />
            </ArrowButton>
            <ArrowButton label="Next example" onClick={() => step(1)}>
              <ArrowRight className="size-5" aria-hidden="true" />
            </ArrowButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function ArrowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-lg bg-porcelain text-ink transition-colors hover:bg-[color-mix(in_oklab,var(--porcelain),var(--postcard)_12%)]"
    >
      {children}
    </button>
  );
}
