import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { sepolia } from 'wagmi/chains'

const buttonBase =
  'rounded-card px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60'

/** `0x1234…abcd` — enough to recognise, short enough for the header. */
function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function WalletButton() {
  const { address, chainId } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()

  const injectedConnector = connectors[0]

  if (!address) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          className={`${buttonBase} bg-brand-600 text-white hover:bg-brand-700`}
          disabled={isPending || !injectedConnector}
          onClick={() =>
            injectedConnector && connect({ connector: injectedConnector })
          }
        >
          {isPending ? 'Connecting…' : 'Connect wallet'}
        </button>
        {error && (
          <p className="text-xs text-ink-muted">
            Couldn't connect. Is a browser wallet installed?
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {chainId !== sepolia.id && (
        <button
          type="button"
          className={`${buttonBase} border border-line bg-surface text-ink hover:bg-canvas`}
          onClick={() => switchChain({ chainId: sepolia.id })}
        >
          Switch to Sepolia
        </button>
      )}
      <span
        title={address}
        className="font-mono text-sm text-ink-muted"
        aria-label={`Connected wallet ${address}`}
      >
        {shortenAddress(address)}
      </span>
      <button
        type="button"
        className={`${buttonBase} border border-line bg-surface text-ink hover:bg-canvas`}
        onClick={() => disconnect()}
      >
        Disconnect
      </button>
    </div>
  )
}

export default WalletButton
