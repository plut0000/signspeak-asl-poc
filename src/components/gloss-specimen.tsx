"use client";

import { Button } from "@/components/ui/button";
import { useSpeech } from "@/hooks/use-speech";
import { Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/** Signed order. All three are in the dedicated model's 200-sign vocabulary. */
const GLOSSES = ["hello", "name", "what"] as const;
type Gloss = (typeof GLOSSES)[number];

/** English word order, with the sign each word came from (null: added by Gemini). */
const ENGLISH: ReadonlyArray<{ text: string; from: Gloss | null }> = [
  { text: "Hello,", from: "hello" },
  { text: "what’s", from: "what" },
  { text: "your", from: null },
  { text: "name?", from: "name" },
];

const SENTENCE = ENGLISH.map((word) => word.text).join(" ");
const LINE_STAGGER_MS = 420;
const LINE_START_MS = 250;

type Link = { gloss: Gloss; d: string; x2: number; y2: number; x1: number; y1: number };

export function GlossSpecimen() {
  const rootRef = useRef<HTMLDivElement>(null);
  const glossRefs = useRef(new Map<Gloss, HTMLElement>());
  const wordRefs = useRef(new Map<Gloss, HTMLElement>());
  const [links, setLinks] = useState<Link[]>([]);
  const [play, setPlay] = useState(false);
  const { speak, speaking, error } = useSpeech();

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const next: Link[] = [];
    for (const gloss of GLOSSES) {
      const from = glossRefs.current.get(gloss)?.getBoundingClientRect();
      const to = wordRefs.current.get(gloss)?.getBoundingClientRect();
      if (!from || !to) continue;
      const x1 = from.left + from.width / 2 - box.left;
      const y1 = from.bottom - box.top + 6;
      const x2 = to.left + to.width / 2 - box.left;
      const y2 = to.top - box.top + to.height * 0.12;
      const mid = (y1 + y2) / 2;
      next.push({
        gloss,
        x1,
        y1,
        x2,
        y2,
        d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${mid.toFixed(1)}, ${x2.toFixed(1)} ${mid.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      });
    }
    setLinks(next);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    const ready = document.fonts?.ready ?? Promise.resolve();
    void ready.then(() => {
      if (cancelled) return;
      measure();
      setPlay(true);
    });
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [measure]);

  return (
    <figure className="space-y-8">
      <div
        ref={rootRef}
        data-specimen-play={play ? "true" : "false"}
        className="@container relative grid grid-cols-1 gap-x-8 [--gutter:0rem] sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:[--gutter:7.5rem]"
      >
        <TierLabel>Gloss</TierLabel>
        {/*
          Both tiers scale with the column so the English always sits on one
          line; a wrapped word would put an alignment line through the text.
        */}
        <ol
          aria-label="Signs, in the order they were signed"
          className="gloss flex gap-x-[1.1em] text-[min(3.25rem,calc((100cqi-var(--gutter))/18.5))] leading-none whitespace-nowrap text-chalk"
        >
          {GLOSSES.map((gloss) => (
            <li
              key={gloss}
              ref={(node) => {
                if (node) glossRefs.current.set(gloss, node);
                else glossRefs.current.delete(gloss);
              }}
            >
              {gloss}
            </li>
          ))}
        </ol>

        <div aria-hidden="true" className="h-[clamp(3.5rem,9vw,6.5rem)] sm:col-start-2" />

        <TierLabel className="sm:pt-[0.6em]">English</TierLabel>
        <p className="text-[min(5.25rem,calc((100cqi-var(--gutter))/12))] leading-[1.02] font-extrabold tracking-[-0.025em] whitespace-nowrap text-chalk">
          {ENGLISH.map((word, index) => (
            <span key={word.text}>
              <span
                ref={(node) => {
                  if (!word.from) return;
                  if (node) wordRefs.current.set(word.from, node);
                  else wordRefs.current.delete(word.from);
                }}
              >
                {word.text}
              </span>
              {index < ENGLISH.length - 1 ? " " : null}
            </span>
          ))}
        </p>

        <TierLabel className="mt-8 sm:pt-2">Voice</TierLabel>
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 rounded-full border-rule bg-transparent px-4 text-[0.95rem] dark:bg-transparent"
            onClick={() => speak(SENTENCE)}
            disabled={speaking}
          >
            <Volume2 data-icon="inline-start" className="text-signal" />
            {speaking ? "Speaking…" : "Hear it"}
          </Button>
          {error ? <p className="text-sm text-record">{error}</p> : null}
        </div>

        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          {links.map((link, index) => {
            const delay = { "--delay": `${LINE_START_MS + index * LINE_STAGGER_MS}ms` } as React.CSSProperties;
            return (
              <g key={link.gloss} style={delay}>
                <circle cx={link.x1} cy={link.y1} r={3} fill="var(--trace)" />
                <path
                  className="align-line"
                  d={link.d}
                  pathLength={1}
                  stroke="var(--trace)"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  fill="none"
                />
                <circle
                  className="align-dot"
                  cx={link.x2}
                  cy={link.y2}
                  r={3}
                  fill="var(--trace)"
                />
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="max-w-[58ch] text-base leading-relaxed text-mist sm:pl-[calc(5.5rem+2rem)]">
        The model reads three signs in the order they were signed. Gemini puts
        them in English word order and adds the small words English needs. In
        ASL, the question sign often comes last.
      </figcaption>
    </figure>
  );
}

function TierLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`hidden text-sm font-bold text-mist sm:block sm:self-start ${className}`}
    >
      {children}
    </p>
  );
}
