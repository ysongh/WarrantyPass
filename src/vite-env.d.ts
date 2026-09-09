/// <reference types="vite/client" />

/**
 * Public client configuration. Anything prefixed `VITE_` is embedded in the
 * client bundle and is readable by anyone, so only public values belong here.
 * Optional, because the app must still run without a Supabase project.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Optional. Falls back to Sepolia's default public RPC when unset. */
  readonly VITE_SEPOLIA_RPC_URL?: string
}
