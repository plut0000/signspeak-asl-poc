import { PATCH_NOTES } from "@/lib/patch-notes";
import { ChevronDown } from "lucide-react";

type PatchNotesProps = {
  compact?: boolean;
};

export function PatchNotes({ compact = false }: PatchNotesProps) {
  if (!compact) {
    return (
      <div className="space-y-4">
        <p className="max-w-[62ch] text-lg leading-relaxed text-chalk">
          {PATCH_NOTES.summary}
        </p>
        <NotesList />
      </div>
    );
  }

  return (
    <details className="group border-t border-rule pt-4">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md py-1 text-sm font-bold text-mist hover:text-chalk [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="size-4 -rotate-90 transition-transform group-open:rotate-0 motion-reduce:transition-none"
          aria-hidden="true"
        />
        {PATCH_NOTES.title}
      </summary>
      <div className="mt-3 space-y-3 pl-6">
        <p className="max-w-[68ch] text-sm leading-6 text-mist">
          {PATCH_NOTES.summary}
        </p>
        <NotesList small />
      </div>
    </details>
  );
}

function NotesList({ small = false }: { small?: boolean }) {
  return (
    <ul
      className={
        small
          ? "max-w-[68ch] list-disc space-y-1.5 pl-5 text-sm leading-6 text-mist marker:text-rule"
          : "max-w-[66ch] list-disc space-y-3 pl-5 leading-relaxed text-mist marker:text-signal"
      }
    >
      {PATCH_NOTES.highlights.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
