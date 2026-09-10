import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'

import { validateReceiptFile } from '../../lib/receipts'
import { RECEIPT_ACCEPT_ATTRIBUTE } from '../../types/receipt'
import Button from '../ui/Button'

/*
 * Choosing a receipt image.
 *
 * A plain file input under a drop zone — no camera API. On a phone the
 * browser's own picker already offers the camera, which works everywhere and
 * needs no permission prompt from us.
 *
 * Validation happens here so the user hears about an unsupported or oversized
 * file immediately, without waiting on an upload. It is not the only check:
 * `createReceipt` re-validates and sniffs the actual bytes, and the Edge
 * Function does it again server-side.
 */

type Props = {
  onSelect: (file: File) => void
  disabled?: boolean
}

function ReceiptUploader({ onSelect, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function accept(file: File | undefined) {
    if (!file) return

    const message = validateReceiptFile(file)

    if (message) {
      setError(message)
      return
    }

    setError(null)
    onSelect(file)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    accept(event.target.files?.[0])
    // Clear the input so picking the same file twice still fires a change.
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)

    if (disabled) return

    accept(event.dataTransfer.files?.[0])
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-card border-2 border-dashed p-8 text-center transition-colors sm:p-12 ${
          isDragging ? 'border-brand-600 bg-brand-50' : 'border-line bg-surface'
        }`}
      >
        <h2 className="text-lg font-semibold text-ink">Scan your receipt</h2>
        <p className="mx-auto mt-2 max-w-sm text-ink-muted text-pretty">
          Upload a clear photo of your receipt and we'll fill in the product
          details for you to check.
        </p>

        <Button
          className="mt-6"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Choose receipt
        </Button>

        <p className="mt-4 text-sm text-ink-muted">JPG, PNG or WebP · up to 10 MB</p>

        <input
          ref={inputRef}
          type="file"
          accept={RECEIPT_ACCEPT_ATTRIBUTE}
          className="sr-only"
          disabled={disabled}
          onChange={handleChange}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-card border border-danger-200 bg-danger-50 p-4 text-sm font-medium text-danger-700"
        >
          {error}
        </p>
      )}
    </div>
  )
}

export default ReceiptUploader
