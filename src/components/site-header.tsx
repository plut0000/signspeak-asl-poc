"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DEMO_VERSION } from "@/lib/patch-notes";
import { Hand } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-border/70 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Hand className="size-5" aria-hidden="true" />
          </span>
          <span className="leading-tight">
            <span className="block font-heading text-sm font-semibold tracking-tight">
              SignSpeak
            </span>
            <span className="block text-xs text-muted-foreground">
              ASL → English → voice
            </span>
          </span>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant="outline" className="h-auto border-primary/30 px-2.5 py-1 text-[0.7rem] text-primary">
            Demo v{DEMO_VERSION}
          </Badge>
          <Badge variant="outline" className="h-auto px-2.5 py-1 text-[0.7rem]">
            DECA EIP proof of concept
          </Badge>
        </div>
      </div>
    </header>
  );
}
