import { useState } from 'react'
import { useNavigate } from 'react-router'

import SessionGate from '../components/auth/SessionGate'
import ProductForm, {
  type ProductFormDefaults,
} from '../components/products/ProductForm'
import ReceiptExtractionReview from '../components/receipts/ReceiptExtractionReview'
import ReceiptParsingState from '../components/receipts/ReceiptParsingState'
import ReceiptPreview from '../components/receipts/ReceiptPreview'
import ReceiptUploader from '../components/receipts/ReceiptUploader'
import Button from '../components/ui/Button'
import { useCreateProduct } from '../hooks/useProducts'
import {
  useDiscardReceipt,
  useParseReceipt,
  useUploadReceipt,
} from '../hooks/useReceipts'
import { toReceiptPrefill, type ReceiptPrefill } from '../lib/receiptExtraction'
import type { Receipt, ReceiptExtraction } from '../types/receipt'

/*
 * Add a product, by scanning a receipt or by typing.
 *
 * Both routes end at the same `ProductForm` and the same creation call. The
 * scan only changes what the form starts with — it never creates anything on
 * its own, and it never fills in a warranty.
 *
 *   choose ─┬─ scan → preview → reading ─┬─ review ─┐
 *           │                             └─ failed ─┤
 *           └─ manual ─────────────────────────────► form → /products/:id
 *
 * `failed` is a first-class stage rather than an error banner: a receipt we
 * could not read still exists, still belongs to the user, and can still be
 * attached to a product they type in themselves.
 */

type Stage =
  | { kind: 'choose' }
  | { kind: 'select' }
  | { kind: 'preview'; file: File }
  | { kind: 'reading'; receipt: Receipt }
  | { kind: 'review'; receipt: Receipt; extraction: ReceiptExtraction }
  | { kind: 'failed'; receipt: Receipt | null; message: string }
  | { kind: 'form'; receipt: Receipt | null; prefill: ReceiptPrefill | null }

const UNREADABLE = "We couldn't read this receipt."

function toMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : UNREADABLE
}

function Intro({ children }: { children: string }) {
  return <p className="mt-3 max-w-2xl text-ink-muted text-pretty">{children}</p>
}

function AddProductFlow() {
  const navigate = useNavigate()

  const [stage, setStage] = useState<Stage>({ kind: 'choose' })
  const [selectedIndex, setSelectedIndex] = useState(0)

  const uploadReceipt = useUploadReceipt()
  const parseReceipt = useParseReceipt()
  const discardReceipt = useDiscardReceipt()
  const createProduct = useCreateProduct()

  async function runParse(receipt: Receipt, force = false) {
    try {
      const parsed = await parseReceipt.mutateAsync({ receiptId: receipt.id, force })

      // Parsed, but nothing usable came back — no legible product, or a reply
      // that failed validation. Same outcome for the user either way.
      if (!parsed.extraction) {
        setStage({ kind: 'failed', receipt: parsed, message: UNREADABLE })
        return
      }

      setSelectedIndex(0)
      setStage({ kind: 'review', receipt: parsed, extraction: parsed.extraction })
    } catch (cause) {
      setStage({ kind: 'failed', receipt, message: toMessage(cause) })
    }
  }

  /** Upload, then read. Parsing is fired once, here — never from a render. */
  async function confirmReceipt(file: File) {
    let created: Receipt

    try {
      created = await uploadReceipt.mutateAsync(file)
    } catch (cause) {
      // Nothing was stored, so there is no receipt to keep or discard.
      setStage({ kind: 'failed', receipt: null, message: toMessage(cause) })
      return
    }

    setStage({ kind: 'reading', receipt: created })
    await runParse(created)
  }

  async function discard(receipt: Receipt) {
    try {
      await discardReceipt.mutateAsync(receipt)
    } catch {
      // The draft is being abandoned either way; a failed cleanup leaves an
      // unattached row, which the user never sees.
    }

    setStage({ kind: 'choose' })
  }

  function continueToForm(receipt: Receipt, extraction: ReceiptExtraction) {
    setStage({
      kind: 'form',
      receipt,
      prefill: toReceiptPrefill(extraction, selectedIndex),
    })
  }

  switch (stage.kind) {
    case 'choose':
      return (
        <>
          <Intro>
            Scan a receipt and we'll read the product details for you to check,
            or type them in yourself. Either way, only you can see this product.
          </Intro>

          <div className="mt-8 grid gap-4 sm:max-w-lg">
            <Button onClick={() => setStage({ kind: 'select' })}>
              Scan receipt
            </Button>
            <Button
              variant="secondary"
              onClick={() => setStage({ kind: 'form', receipt: null, prefill: null })}
            >
              Enter manually
            </Button>
          </div>
        </>
      )

    case 'select':
      return (
        <>
          <Intro>
            Your receipt is stored privately and is never shown on a public page.
          </Intro>

          <div className="mt-8">
            <ReceiptUploader onSelect={(file) => setStage({ kind: 'preview', file })} />

            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => setStage({ kind: 'choose' })}
            >
              Back
            </Button>
          </div>
        </>
      )

    case 'preview':
      return (
        <>
          <Intro>Check the whole receipt is in frame and readable.</Intro>

          <div className="mt-8">
            <ReceiptPreview
              file={stage.file}
              isBusy={uploadReceipt.isPending}
              onConfirm={() => void confirmReceipt(stage.file)}
              onReplace={() => setStage({ kind: 'select' })}
            />
          </div>
        </>
      )

    case 'reading':
      return (
        <>
          <Intro>Nothing is saved until you've checked the details.</Intro>
          <div className="mt-8">
            <ReceiptParsingState />
          </div>
        </>
      )

    case 'review':
      return (
        <>
          <Intro>Nothing is saved until you've checked the details.</Intro>

          <div className="mt-8">
            <ReceiptExtractionReview
              extraction={stage.extraction}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onContinue={() => continueToForm(stage.receipt, stage.extraction)}
              onRescan={() => void runParse(stage.receipt, true)}
              isRescanning={parseReceipt.isPending}
            />

            <DiscardButton
              receipt={stage.receipt}
              isPending={discardReceipt.isPending}
              onDiscard={discard}
            />
          </div>
        </>
      )

    case 'failed':
      return (
        <>
          <Intro>You can try again, or just type the details in yourself.</Intro>

          <div className="mt-8">
            <div className="rounded-card border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-lg font-semibold text-ink">{UNREADABLE}</h2>
              <p className="mt-2 text-ink-muted text-pretty">
                {stage.receipt
                  ? "Your receipt is saved and will still be attached to the product if you carry on manually."
                  : 'Nothing was uploaded.'}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  disabled={parseReceipt.isPending}
                  onClick={() =>
                    stage.receipt
                      ? void runParse(stage.receipt, true)
                      : setStage({ kind: 'select' })
                  }
                >
                  {parseReceipt.isPending ? 'Trying again…' : 'Try again'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setStage({ kind: 'form', receipt: stage.receipt, prefill: null })
                  }
                >
                  Enter details manually
                </Button>
              </div>
            </div>

            {stage.receipt && (
              <DiscardButton
                receipt={stage.receipt}
                isPending={discardReceipt.isPending}
                onDiscard={discard}
              />
            )}
          </div>
        </>
      )

    case 'form': {
      const { receipt, prefill } = stage

      return (
        <>
          <Intro>
            {prefill
              ? 'Edit anything that looks wrong, then add the warranty details.'
              : 'Enter the product and its warranty. Only you can see this.'}
          </Intro>

          {receipt && (
            <p className="mt-6 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
              Your receipt will be attached to this product when you create it.
            </p>
          )}

          <ProductForm
            defaults={(prefill?.values ?? {}) as ProductFormDefaults}
            lowConfidenceFields={prefill?.lowConfidence ?? []}
            currency={prefill?.currency ?? 'USD'}
            isSubmitting={createProduct.isPending}
            submitError={createProduct.error?.message ?? null}
            onSubmit={(input) => {
              createProduct.mutate(
                { ...input, receiptId: receipt?.id ?? null },
                {
                  // The mutation invalidates the product list first, so the
                  // dashboard is already correct behind the detail page.
                  onSuccess: ({ productId }) => navigate(`/products/${productId}`),
                },
              )
            }}
          />
        </>
      )
    }
  }
}

function DiscardButton({
  receipt,
  isPending,
  onDiscard,
}: {
  receipt: Receipt
  isPending: boolean
  onDiscard: (receipt: Receipt) => void
}) {
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => onDiscard(receipt)}
      className="mt-6 rounded-card px-2 py-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-60"
    >
      {isPending ? 'Discarding…' : 'Discard this receipt and start over'}
    </button>
  )
}

function AddProductPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Add product
      </h1>

      <SessionGate>
        <AddProductFlow />
      </SessionGate>
    </>
  )
}

export default AddProductPage
