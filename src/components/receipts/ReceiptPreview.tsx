import { useEffect, useState } from 'react'

import Button from '../ui/Button'

/*
 * The chosen image, before it goes anywhere.
 *
 * Previewed from a local object URL — the bytes are already in the browser, so
 * there is nothing to fetch and nothing to expose. Object URLs pin their blob
 * in memory until revoked, and a ten-megabyte photo held after the user has
 * moved on is a real leak, so the effect revokes on cleanup.
 */

type Props = {
  file: File
  isBusy?: boolean
  onConfirm: () => void
  onReplace: () => void
}

function ReceiptPreview({ file, isBusy, onConfirm, onReplace }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  /*
   * An object URL is an entry in the browser's blob registry — an external
   * resource with a lifecycle — which is exactly what effects are for.
   *
   * It must be created *inside* the effect, not derived with `useMemo`.
   * StrictMode mounts, unmounts and remounts effects in development: the
   * cleanup revokes the URL, and a memoised value would not be recomputed on
   * the remount, leaving the image pointing at a revoked URL. Chrome reports
   * that as `net::ERR_FILE_NOT_FOUND`, which is a confusing way to learn it.
   */
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)

    // The rule's advice — "derive the value during render" — is wrong for this
    // case and is exactly what produced the revoked-URL bug described above.
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return (
    <div className="rounded-card border border-line bg-surface p-6 sm:p-8">
      <div className="flex justify-center rounded-card bg-canvas p-4">
        {url && (
          <img
            src={url}
            // The image is the user's own receipt and its content is not
            // something we can describe; the filename below is what identifies
            // it, so the alt text names the role rather than repeating it.
            alt="The receipt you selected"
            className="max-h-96 w-auto max-w-full rounded object-contain"
          />
        )}
      </div>

      <p className="mt-4 truncate text-sm text-ink-muted" title={file.name}>
        {file.name}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button disabled={isBusy} onClick={onConfirm}>
          {isBusy ? 'Uploading…' : 'Use this receipt'}
        </Button>
        <Button variant="secondary" disabled={isBusy} onClick={onReplace}>
          Choose another
        </Button>
      </div>
    </div>
  )
}

export default ReceiptPreview
