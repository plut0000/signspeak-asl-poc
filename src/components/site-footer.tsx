export function SiteFooter({ note }: { note?: string }) {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-mist sm:flex-row sm:justify-between sm:px-6">
        <p>SignSpeak is a DECA Entrepreneurship Innovation Plan feasibility demo.</p>
        <p>{note ?? "No accounts, no database."}</p>
      </div>
    </footer>
  );
}
