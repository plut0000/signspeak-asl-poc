"use client";

import { SignSpeakMark } from "@/components/signspeak-mark";
import { DEMO_VERSION } from "@/lib/patch-notes";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/demo", label: "Camera demo" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link
          href="/"
          className="-mx-1 flex items-center gap-2 rounded-md px-1 py-0.5"
        >
          <SignSpeakMark className="size-8 text-chalk" />
          <span className="text-lg font-bold tracking-tight">SignSpeak</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          {NAV.map((item) => {
            const current = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  current
                    ? "font-bold text-chalk underline decoration-signal decoration-2 underline-offset-[6px]"
                    : "text-mist hover:text-chalk",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <span className="ml-2 hidden text-sm text-mist tabular sm:inline">
            v{DEMO_VERSION}
          </span>
        </nav>
      </div>
    </header>
  );
}
