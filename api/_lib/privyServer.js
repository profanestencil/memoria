/**
 * Server-side Privy env (Vercel / Node only). Never expose `PRIVY_APP_SECRET` as `VITE_*`.
 * Use with `@privy-io/server-auth` when you verify access tokens or call Privy server APIs.
 */

export const getPrivyAppSecret = () => {
  const s = process.env.PRIVY_APP_SECRET
  return typeof s === 'string' && s.trim() ? s.trim() : null
}

/** Prefer `PRIVY_APP_ID` on the server; falls back to the same value as the SPA build. */
export const getPrivyAppId = () => {
  const raw = process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}
