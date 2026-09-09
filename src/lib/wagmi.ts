import { createConfig, http } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

/*
 * Wallet configuration.
 *
 * Sepolia only, and the injected connector only — that covers browser wallets
 * such as MetaMask without requiring a third-party project ID. Add other
 * connectors when there is a reason to, not before.
 *
 * VITE_SEPOLIA_RPC_URL is optional. Without it, viem falls back to Sepolia's
 * default public RPC, which is fine for development but rate-limited.
 */
export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL),
  },
})

// Gives the wagmi hooks precise types for this config.
declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
