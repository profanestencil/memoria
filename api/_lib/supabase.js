import { createClient } from '@supabase/supabase-js'

export const isSupabaseConfigured = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

/** Service-role client (server only). Bypasses RLS. */
export const getServiceSupabase = () => {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * PostgrestError from @supabase/supabase-js is not instanceof Error.
 * Use this after inserts/selects so catch blocks can return e.message to the client.
 * @param {{ message?: string, details?: string, hint?: string, code?: string } | null | undefined} err
 */
export const throwIfSupabaseError = (err) => {
  if (!err) return
  const parts = [err.message, err.details, err.hint].filter(Boolean)
  const msg = parts.length ? parts.join(' — ') : 'Database error'
  throw new Error(msg)
}
