/*
 * The wait while the receipt is being read.
 *
 * Reading takes a few seconds — long enough that an unexplained pause reads as
 * a hang. `role="status"` means a screen reader announces it rather than
 * leaving non-visual users with silence.
 */
function ReceiptParsingState() {
  return (
    <div
      role="status"
      className="rounded-card border border-line bg-surface p-8 text-center sm:p-12"
    >
      <div className="mx-auto flex max-w-xs flex-col items-center">
        <div className="flex gap-1.5" aria-hidden="true">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-2 w-2 animate-pulse rounded-full bg-brand-600"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>

        <p className="mt-5 font-medium text-ink">Reading your receipt…</p>
        <p className="mt-2 text-sm text-ink-muted text-pretty">
          This usually takes a few seconds. You'll get to check everything
          before anything is saved.
        </p>
      </div>
    </div>
  )
}

export default ReceiptParsingState
