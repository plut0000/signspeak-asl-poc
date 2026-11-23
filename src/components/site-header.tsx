"use client";

import { SignSpeakMark } from "@/components/signspeak-mark";
import { DEMO_VERSION } from "@/lib/patch-notes";
import { cn } from "@/lib/utils";
import { Camera } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  const onDemo = pathname === "/demo";

  return (
    <header className="relative z-20 px-3 pt-3 sm:px-6 sm:pt-5">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-2xl bg-ink/25 py-2 pr-2 pl-3 ring-1 ring-porcelain/20 backdrop-blur-md sm:pl-5">
        <Link href="/" className="flex items-center gap-2 rounded-md py-1">
          <SignSpeakMark className="size-7 text-porcelain" />
          <span className="poster text-[1.75rem] leading-none">SignSpeak</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className={cn(
              "hidden rounded-md px-2.5 py-1.5 text-sm font-semibold sm:block",
              pathname === "/"
                ? "underline decoration-2 underline-offset-[7px]"
                : "hover:underline hover:decoration-porcelain/50 hover:underline-offset-[7px]",
            )}
          >
            Overview
          </Link>
          <Link
            href="/#how-it-works"
            className="hidden rounded-md px-2.5 py-1.5 text-sm font-semibold hover:underline hover:decoration-porcelain/50 hover:underline-offset-[7px] md:block"
          >
            How it works
          </Link>
          <span className="mr-2 hidden px-1 text-sm tabular md:inline">
            v{DEMO_VERSION}
          </span>
          <Link
            href="/demo"
            aria-current={onDemo ? "page" : undefined}
            className="flex items-center gap-2.5 rounded-xl bg-porcelain py-1.5 pr-1.5 pl-3.5 text-sm font-bold text-ink transition-colors hover:bg-[color-mix(in_oklab,var(--porcelain),var(--postcard)_12%)]"
          >
            Camera demo
            <span className="flex size-7 items-center justify-center rounded-lg bg-flamingo">
              <Camera className="size-4 text-ink" aria-hidden="true" />
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
