import { Badge } from "@/components/ui/badge";
import { PATCH_NOTES } from "@/lib/patch-notes";

type PatchNotesProps = {
  compact?: boolean;
};

export function PatchNotes({ compact = false }: PatchNotesProps) {
  return (
    <details
      open={!compact}
      className={
        compact
          ? "rounded-xl border border-border/80 bg-card/70 px-4 py-3"
          : "rounded-2xl border border-border/80 bg-card/70 px-5 py-4 sm:px-6"
      }
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <Badge variant="outline" className="h-auto border-primary/30 px-2 py-0.5 text-[0.7rem] text-primary">
            v{PATCH_NOTES.version}
          </Badge>
          <span className="font-heading text-sm font-semibold tracking-tight sm:text-base">
            {PATCH_NOTES.title}
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          Patch notes
        </span>
      </summary>
      <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
        <p className="text-sm leading-6 text-muted-foreground">
          {PATCH_NOTES.summary}
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
          {PATCH_NOTES.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}
