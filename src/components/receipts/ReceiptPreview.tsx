import { useEffect, useMemo } from 'react'

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
  // Derived during render rather than set from an effect: the URL is a pure
  // function of the file, and routing it through state would render once
  // without an image and then again with one.
  const url = useMemo(() => URL.createObjectURL(file), [file])

  // The effect exists only to release it.
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <div className="rounded-card border border-line bg-surface p-6 sm:p-8">
      <div className="flex justify-center rounded-card bg-canvas p-4">
        <img
          src={url}
          // The image is the user's own receipt and its content is not
          // something we can describe; the filename below is what identifies
          // it, so the alt text names the role rather than repeating it.
          alt="The receipt you selected"
          className="max-h-96 w-auto max-w-full rounded object-contain"
        />
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
