import { createClient } from '@supabase/supabase-js'

/*
 * Supabase browser client.
 *
 * Both values below are public: the URL and the anon key are compiled into the
 * client bundle and are meant to be visible. Access is expected to be
 * restricted by row-level security on the database, never by hiding the key.
 * A service-role key must never appear here or in any VITE_ variable.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

function isValidUrl(value: string | undefined): value is string {
  if (!value) return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Whether Supabase credentials were supplied at build time. Check this before
 * using `supabase`, which is `null` when the app is running unconfigured.
 */
export const isSupabaseConfigured = isValidUrl(url) && Boolean(anonKey)

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    'Supabase is not configured. Copy .env.example to .env and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Features that need the ' +
      'database will stay unavailable until you do.',
  )
}

/**
 * The Supabase client, or `null` when configuration is missing. Kept nullable
 * so the app still builds and runs locally without a Supabase project rather
 * than crashing on import.
 */
export const supabase =
  isSupabaseConfigured && url && anonKey ? createClient(url, anonKey) : null
