import { useState, type ReactNode } from 'react'
import { useConnect } from 'wagmi'

import Button from '../ui/Button'
import {
  useHashReceipt,
  useOnchainProof,
  useRegisterProof,
  useSwitchToRegistryChain,
  type RegisterPhase,
} from '../../hooks/useOnchainProof'
import { addressUrl, transactionUrl } from '../../lib/contracts/warrantyPass'
import type { ProductWithWarranty } from '../../types/product'
import type { ReceiptSummary } from '../../types/receipt'

/*
 * The onchain proof section of the product page.
 *
 * Language rules, which are not stylistic:
 *
 *   - The wallet is a **registrant**. Never an issuer, manufacturer or verified
 *     retailer. It is whoever paid for the transaction.
 *   - "Verified" means the digest and dates onchain match this WarrantyPass. It
 *     does not mean anyone confirmed the purchase, the retailer, or that a
 *     warranty is enforceable. The disclaimer at the bottom says so and should
 *     not be removed to save space.
 *   - A mismatch is never softened into a warning next to a check mark. It
 *     replaces the verified state entirely.
 */

const PHASE_COPY: Record<RegisterPhase, string> = {
  idle: '',
  hashing: 'Hashing your receipt…',
  checking: 'Checking whether a proof already exists…',
  simulating: 'Checking the transaction will succeed…',
  'awaiting-signature': 'Confirm this transaction in your wallet.',
  broadcasting: 'Sending the transaction…',
  waiting: 'Waiting for the network to confirm…',
  verifying: 'Reading the record back from the chain…',
}

/** `0x1234…abcd`. */
function shorten(value: string, lead = 10) {
  return value.length > lead + 8 ? `${value.slice(0, lead)}…${value.slice(-6)}` : value
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-ink">Onchain proof</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-0.5 break-all text-ink">{children}</dd>
    </div>
  )
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-brand-600 underline underline-offset-2 hover:text-brand-700"
    >
      {children}
    </a>
  )
}

/** A hash with a copy control, truncated by default. */
function HashValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-sm text-ink">{shorten(value)}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            },
            () => setCopied(false),
          )
        }}
        className="rounded-card px-2 py-1 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

/**
 * The disclaimer. Shown in every state that mentions a proof.
 *
 * This is the sentence that keeps the feature honest: the chain attests to
 * registration and timing, and to nothing else.
 */
function Disclaimer() {
  return (
    <p className="mt-6 border-t border-line pt-4 text-sm text-ink-muted text-pretty">
      An onchain proof records that WarrantyPass registered this receipt
      fingerprint and these warranty dates at a point in time. It does not verify
      the retailer or manufacturer, confirm the purchase took place, or make a
      warranty legally enforceable.
    </p>
  )
}

function OnchainProofCard({
  product,
  receipt,
}: {
  product: ProductWithWarranty
  receipt: ReceiptSummary | null | undefined
}) {
  const { state, chainError, refetch } = useOnchainProof(product, receipt)
  const register = useRegisterProof(product, receipt)
  const hash = useHashReceipt(product.id)
  const { switchToRegistryChain, isPending: isSwitching } = useSwitchToRegistryChain()
  const { connect, connectors, isPending: isConnecting } = useConnect()

  // Nothing is configured for this environment. Say so plainly rather than
  // offering a button that cannot work.
  if (state.kind === 'registry-unconfigured') return null

  const busy = register.isPending

  return (
    <Card>
      {chainError && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger-700 text-pretty">
          We couldn't reach the network to check this product's proof, so its
          status is unknown. This is not the same as having no proof.
        </p>
      )}

      {state.kind === 'no-receipt' && (
        <p className="mt-4 text-ink-muted text-pretty">
          Onchain proof needs a receipt. This WarrantyPass was entered manually,
          so there is no document to fingerprint. Everything else about it works
          normally.
        </p>
      )}

      {state.kind === 'no-warranty' && (
        <p className="mt-4 text-ink-muted text-pretty">
          Onchain proof needs warranty dates, and this WarrantyPass has none on
          record.
        </p>
      )}

      {state.kind === 'unhashed' && (
        <>
          <p className="mt-4 text-ink-muted text-pretty">
            This receipt has not been fingerprinted yet. We compute it from the
            stored image on our side — you never need to upload it again.
          </p>
          <div className="mt-6">
            <Button
              variant="secondary"
              disabled={hash.isPending}
              onClick={() => hash.mutate(receipt!.id)}
            >
              {hash.isPending ? 'Hashing…' : 'Prepare receipt fingerprint'}
            </Button>
          </div>
          {hash.error && (
            <p role="alert" className="mt-4 text-sm font-medium text-danger-700 text-pretty">
              {hash.error.message}
            </p>
          )}
        </>
      )}

      {state.kind === 'wallet-disconnected' && (
        <>
          <p className="mt-4 text-ink-muted text-pretty">
            Connect a wallet to anchor a tamper-evident proof of this receipt and
            warranty record to Arc Testnet.
          </p>
          <div className="mt-6">
            <Button
              disabled={isConnecting || !connectors[0]}
              onClick={() => connectors[0] && connect({ connector: connectors[0] })}
            >
              {isConnecting ? 'Connecting…' : 'Connect wallet'}
            </Button>
          </div>
          <Disclaimer />
        </>
      )}

      {state.kind === 'wrong-chain' && (
        <>
          <p className="mt-4 text-ink-muted text-pretty">
            Arc Testnet is required to create this proof. Your wallet is on
            another network.
          </p>
          <div className="mt-6">
            <Button
              variant="secondary"
              disabled={isSwitching}
              onClick={() => switchToRegistryChain()}
            >
              {isSwitching ? 'Switching…' : 'Switch to Arc Testnet'}
            </Button>
          </div>
          <Disclaimer />
        </>
      )}

      {(state.kind === 'ready' || state.kind === 'failed') && (
        <>
          <p className="mt-2 font-medium text-ink">Not created</p>
          <p className="mt-2 text-ink-muted text-pretty">
            Anchor a tamper-evident proof of this receipt and warranty record to
            Arc Testnet. You will be asked to confirm one transaction.
          </p>
          <p className="mt-2 text-sm text-ink-muted text-pretty">
            Arc uses USDC for transaction fees rather than ETH. If your wallet
            has no testnet USDC, get some from{' '}
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 underline underline-offset-2 hover:text-brand-700"
            >
              Circle's faucet
            </a>
            .
          </p>

          {state.kind === 'failed' && (
            <p className="mt-4 text-sm text-ink-muted text-pretty">
              A previous attempt did not succeed.{' '}
              {transactionUrl(state.record.transactionHash) && (
                <ExternalLink href={transactionUrl(state.record.transactionHash)!}>
                  View the transaction
                </ExternalLink>
              )}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button disabled={busy} onClick={() => register.mutate()}>
              {busy ? 'Working…' : 'Create onchain proof'}
            </Button>
            {busy && <span className="text-sm text-ink-muted">{PHASE_COPY[register.phase]}</span>}
          </div>

          {register.error && (
            <p role="alert" className="mt-4 text-sm font-medium text-danger-700 text-pretty">
              {register.error.message}
            </p>
          )}

          <Disclaimer />
        </>
      )}

      {state.kind === 'pending' && (
        <>
          <p className="mt-2 font-medium text-ink">Creating proof…</p>
          <p className="mt-2 text-ink-muted text-pretty">
            The transaction has been sent and is waiting to be confirmed. You can
            safely leave this page — we will pick it up again when you return.
          </p>
          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <Row label="Transaction">
              {transactionUrl(state.record.transactionHash) ? (
                <ExternalLink href={transactionUrl(state.record.transactionHash)!}>
                  {shorten(state.record.transactionHash)}
                </ExternalLink>
              ) : (
                <span className="font-mono text-sm">{shorten(state.record.transactionHash)}</span>
              )}
            </Row>
            <Row label="Network">Arc Testnet</Row>
          </dl>
          <div className="mt-6">
            <Button variant="secondary" onClick={() => void refetch()}>
              Check again
            </Button>
          </div>
          <Disclaimer />
        </>
      )}

      {state.kind === 'confirmed' && (
        <>
          <p className="mt-2 font-medium text-success-700">Verified ✓</p>

          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <Row label="Network">Arc Testnet</Row>
            <Row label="Receipt integrity">
              <span className="font-medium text-success-700">
                Receipt matches onchain proof ✓
              </span>
            </Row>
            <div className="sm:col-span-2">
              <dt className="text-sm text-ink-muted">Receipt fingerprint</dt>
              <dd className="mt-0.5">
                <HashValue value={state.onchain.receiptHash} />
              </dd>
            </div>
            <Row label="Registered by">
              {addressUrl(state.onchain.registeredBy) ? (
                <ExternalLink href={addressUrl(state.onchain.registeredBy)!}>
                  {shorten(state.onchain.registeredBy, 8)}
                </ExternalLink>
              ) : (
                <span className="font-mono text-sm">{shorten(state.onchain.registeredBy, 8)}</span>
              )}
            </Row>
            {state.record?.transactionHash && (
              <Row label="Transaction">
                {transactionUrl(state.record.transactionHash) ? (
                  <ExternalLink href={transactionUrl(state.record.transactionHash)!}>
                    {shorten(state.record.transactionHash)}
                  </ExternalLink>
                ) : (
                  <span className="font-mono text-sm">
                    {shorten(state.record.transactionHash)}
                  </span>
                )}
              </Row>
            )}
          </dl>

          <p className="mt-6 text-sm text-ink-muted text-pretty">
            <span className="font-medium text-ink">Registered by</span> is the
            wallet that paid for this registration. It is not a record of
            ownership, and not a manufacturer or retailer confirming anything.
          </p>

          {!state.record && (
            <p className="mt-4 text-sm text-ink-muted text-pretty">
              This proof was found on the network but is not in your local
              history — it may have been created from another browser. The
              onchain record is what counts, and it matches.
            </p>
          )}

          <Disclaimer />
        </>
      )}

      {state.kind === 'conflict' && (
        <>
          <p className="mt-2 font-medium text-danger-700">Integrity warning</p>
          <p className="mt-2 text-ink text-pretty">
            The existing onchain record does not match this WarrantyPass. Do not
            treat this record as verified.
          </p>

          {state.mismatches.length > 0 ? (
            <dl className="mt-6 grid gap-5">
              {state.mismatches.map((mismatch) => (
                <div key={mismatch.field}>
                  <dt className="text-sm font-medium text-ink">{mismatch.field}</dt>
                  <dd className="mt-1 space-y-1 text-sm">
                    <p className="break-all text-ink-muted">
                      Onchain: <span className="font-mono">{shorten(mismatch.onchain, 14)}</span>
                    </p>
                    <p className="break-all text-ink-muted">
                      This record:{' '}
                      <span className="font-mono">{shorten(mismatch.expected, 14)}</span>
                    </p>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-ink-muted text-pretty">
              A record is registered under this product's key, but this
              WarrantyPass does not have the receipt fingerprint or warranty
              dates needed to check it against.
            </p>
          )}

          <p className="mt-6 text-sm text-ink-muted text-pretty">
            Nothing has been changed on either side. An onchain record cannot be
            edited or replaced, and we will not overwrite your stored details to
            make them agree.
          </p>

          <Disclaimer />
        </>
      )}
    </Card>
  )
}

export default OnchainProofCard
