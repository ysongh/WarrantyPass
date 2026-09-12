import { createConfig, http } from 'wagmi'
import { arcTestnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

/*
 * Wallet configuration.
 *
 * Arc Testnet only (chain id 5042002), and the injected connector only — that
 * covers browser wallets such as MetaMask without requiring a third-party
 * project ID. Add other connectors when there is a reason to, not before.
 *
 * Gas on Arc is paid in USDC
 * --------------------------
 * Arc is Circle's chain, and USDC is its *native* token — there is no ETH, and
 * a wallet holding only ETH cannot send a transaction here. Users fund from
 * https://faucet.circle.com. Any copy about transaction costs must say USDC.
 *
 * A decimals trap worth knowing: native USDC on Arc has **18** decimals, like
 * ether, while the ERC-20 USDC contract has 6. Nothing in this app moves USDC
 * as a token, so only the 18-decimal native form is in play — but do not mix
 * them if that ever changes.
 *
 * Arc is testnet-only today. There is no mainnet to point at.
 *
 * VITE_ARC_TESTNET_RPC_URL is optional. Without it, viem falls back to Arc's
 * default public RPC, which is fine for development but rate-limited.
 */
export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(import.meta.env.VITE_ARC_TESTNET_RPC_URL),
  },
})

// Gives the wagmi hooks precise types for this config.
declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
