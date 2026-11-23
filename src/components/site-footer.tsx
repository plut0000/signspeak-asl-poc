export function SiteFooter({ note }: { note?: string }) {
  return (
    <footer className="bg-postcard text-porcelain">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 border-t border-porcelain/30 px-4 py-6 text-sm sm:flex-row sm:justify-between sm:px-6">
        <p>SignSpeak is a DECA Entrepreneurship Innovation Plan feasibility demo.</p>
        <p>{note ?? "No accounts, no database."}</p>
      </div>
    </footer>
  );
}
