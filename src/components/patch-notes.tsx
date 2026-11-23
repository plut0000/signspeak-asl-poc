import { PATCH_NOTES } from "@/lib/patch-notes";
import { ChevronDown } from "lucide-react";

type PatchNotesProps = {
  compact?: boolean;
};

/** Full notes sit on the white back of the landing; compact sits on blue. */
export function PatchNotes({ compact = false }: PatchNotesProps) {
  if (!compact) {
    return (
      <div className="space-y-4">
        <p className="max-w-[60ch] text-xl leading-relaxed font-medium">
          {PATCH_NOTES.summary}
        </p>
        <ul className="max-w-[66ch] list-disc space-y-3 pl-5 leading-relaxed text-ink/80 marker:text-postcard">
          {PATCH_NOTES.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <details className="group border-t border-porcelain/30 pt-4">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md py-1 text-sm font-bold hover:underline hover:underline-offset-4 [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="size-4 -rotate-90 transition-transform group-open:rotate-0 motion-reduce:transition-none"
          aria-hidden="true"
        />
        {PATCH_NOTES.title}
      </summary>
      <div className="mt-3 space-y-3 pl-6">
        <p className="max-w-[68ch] text-sm leading-6">{PATCH_NOTES.summary}</p>
        <ul className="max-w-[68ch] list-disc space-y-1.5 pl-5 text-sm leading-6 marker:text-flamingo">
          {PATCH_NOTES.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}
